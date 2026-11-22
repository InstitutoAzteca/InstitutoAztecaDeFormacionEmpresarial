// services/db.js — acceso a datos sobre Supabase (PostgREST) con RLS activo.

import { supabase } from '../supabase-client.js';
import { TABLAS } from '../config.js';

const PERMITIDAS = new Set(Object.values(TABLAS));

function asegurarTabla(tabla) {
  if (!PERMITIDAS.has(tabla)) throw new Error(`Tabla no permitida: ${tabla}`);
}

/** Normaliza los filtros: { columna: valor | [valores] }. */
function aplicarFiltros(query, filtros = {}) {
  let q = query;
  for (const [columna, valor] of Object.entries(filtros)) {
    if (valor === undefined || valor === null || valor === '') continue;
    if (Array.isArray(valor)) {
      if (!valor.length) continue;
      q = q.in(columna, valor);
    } else {
      q = q.eq(columna, valor);
    }
  }
  return q;
}

function mapear(filas = []) {
  return filas.map((f) => ({ id: f.id, ...f }));
}

export async function listar(tabla, { select = '*', filtros = {}, orden = null, limite = null } = {}) {
  asegurarTabla(tabla);
  let q = supabase.from(tabla).select(select);
  q = aplicarFiltros(q, filtros);
  if (orden) q = q.order(orden.columna, { ascending: orden.asc !== false });
  if (limite) q = q.limit(limite);
  const { data, error } = await q;
  if (error) throw error;
  return mapear(data);
}

export async function obtener(tabla, id, { select = '*' } = {}) {
  asegurarTabla(tabla);
  const { data, error } = await supabase.from(tabla).select(select).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, ...data } : null;
}

export async function insertar(tabla, fila) {
  asegurarTabla(tabla);
  const { data, error } = await supabase.from(tabla).insert(fila).select().single();
  if (error) throw error;
  return { id: data.id, ...data };
}

export async function actualizar(tabla, id, cambios) {
  asegurarTabla(tabla);
  const { data, error } = await supabase.from(tabla).update(cambios).eq('id', id).select().single();
  if (error) throw error;
  return { id: data.id, ...data };
}

export async function eliminar(tabla, id) {
  asegurarTabla(tabla);
  const { error } = await supabase.from(tabla).delete().eq('id', id);
  if (error) throw error;
}

/** Inserta o actualiza según la clave única indicada. */
export async function guardarEn(tabla, fila, claveUnica = 'id') {
  asegurarTabla(tabla);
  const { data, error } = await supabase
    .from(tabla)
    .upsert(fila, { onConflict: claveUnica })
    .select()
    .single();
  if (error) throw error;
  return { id: data.id, ...data };
}

export async function contar(tabla, filtros = {}) {
  asegurarTabla(tabla);
  let q = supabase.from(tabla).select('id', { count: 'exact', head: true });
  q = aplicarFiltros(q, filtros);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

/** Suscripción en tiempo real. Devuelve la función para cancelar. */
export function suscribir(tabla, alCambiar, { select = '*', filtros = {} } = {}) {
  asegurarTabla(tabla);
  let q = supabase.from(tabla).select(select);
  q = aplicarFiltros(q, filtros);
  const canal = supabase
    .channel(`iafe-${tabla}-${Math.random().toString(36).slice(2, 8)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: tabla }, (carga) => {
      alCambiar(mapear(carga.new ? [carga.new] : []), carga);
    })
    .subscribe();
  return () => supabase.removeChannel(canal);
}

/** Invoca una función RPC de la base de datos. */
export async function rpc(nombre, argumentos = {}) {
  const { data, error } = await supabase.rpc(nombre, argumentos);
  if (error) throw error;
  return data;
}

/** Descarga un archivo del bucket privado mediante URL firmada temporal. */
export async function urlFirmada(ruta, segundos = 300) {
  const { data, error } = await supabase.storage.from('iafe-documentos').createSignedUrl(ruta, segundos);
  if (error) throw error;
  return data.signedUrl;
}

/** Sube un archivo al bucket privado. */
export async function subirArchivo(ruta, archivo) {
  const { error } = await supabase.storage.from('iafe-documentos').upload(ruta, archivo, {
    upsert: false,
    contentType: archivo.type || 'application/octet-stream',
  });
  if (error) throw error;
  return ruta;
}

/** Elimina un archivo del bucket. */
export async function eliminarArchivo(ruta) {
  const { error } = await supabase.storage.from('iafe-documentos').remove([ruta]);
  if (error) throw error;
}
