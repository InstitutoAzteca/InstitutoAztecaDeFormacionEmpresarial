// services/alumnos.js — altas, edición, bajas y búsqueda de alumnos.

import { TABLAS } from '../config.js';
import { listar, insertar, actualizar, eliminar, contar } from './db.js';
import { hoyISO } from '../utils/dates.js';

/** Lista alumnos con el nivel y grupo resueltos. */
export async function listarAlumnos({ estado = 'activo', nivelId = null, grupoId = null, busqueda = '' } = {}) {
  const filtros = {};
  if (estado) filtros.estado = estado;
  if (nivelId) filtros.nivel_id = nivelId;
  if (grupoId) filtros.grupo_id = grupoId;

  const alumnos = await listar(TABLAS.alumnos, {
    filtros,
    orden: { columna: 'apellidos', asc: true },
  });

  const [niveles, grupos] = await Promise.all([
    listar(TABLAS.niveles, { orden: { columna: 'orden', asc: true } }),
    listar(TABLAS.grupos, { orden: { columna: 'nombre', asc: true } }),
  ]);

  const porNivel = new Map(niveles.map((n) => [n.id, n]));
  const porGrupo = new Map(grupos.map((g) => [g.id, g]));

  const enriched = alumnos.map((a) => ({
    ...a,
    nivel: porNivel.get(a.nivel_id) ?? null,
    grupo: porGrupo.get(a.grupo_id) ?? null,
  }));

  if (!busqueda) return enriched;

  const terms = busqueda
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/\s+/)
    .filter(Boolean);

  return enriched.filter((a) => {
    const texto = [a.nombre, a.apellidos, a.codigo, a.curp, a.email, a.telefono]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
    return terms.every((t) => texto.includes(t));
  });
}

export async function obtenerAlumno(id) {
  const alumno = await listar(TABLAS.alumnos, { filtros: { id } });
  if (!alumno.length) return null;
  const [niveles, grupos, personal] = await Promise.all([
    listar(TABLAS.niveles),
    listar(TABLAS.grupos),
    listar(TABLAS.personal),
  ]);
  const a = alumno[0];
  return {
    ...a,
    nivel: niveles.find((n) => n.id === a.nivel_id) ?? null,
    grupo: grupos.find((g) => g.id === a.grupo_id) ?? null,
    creado_por_nombre: personal.find((p) => p.id === a.creado_por)?.nombre ?? null,
  };
}

/** Genera el siguiente código de matrícula: IAFE-<nivel>-<consecutivo>. */
export async function generarCodigo(claveNivel = 'EST') {
  const total = await contar(TABLAS.alumnos);
  const anio = new Date().getFullYear();
  let consecutivo = total + 1;
  // verificar que no exista (por si se borraron alumnos)
  for (let intento = 0; intento < 50; intento += 1) {
    const codigo = `${claveNivel}${anio}-${String(consecutivo).padStart(4, '0')}`;
    const existe = await contar(TABLAS.alumnos, { codigo });
    if (!existe) return codigo;
    consecutivo += 1;
  }
  return `${claveNivel}${anio}-${String(consecutivo).padStart(4, '0')}`;
}

/** Crea un alumno. */
export async function crearAlumno(datos, creadoPor = null) {
  const fila = {
    codigo: datos.codigo?.trim() || (await generarCodigo(datos.codigoNivel || 'EST')),
    nombre: datos.nombre.trim(),
    apellidos: (datos.apellidos ?? '').trim(),
    curp: datos.curp?.trim() || null,
    email: datos.email?.trim() || null,
    telefono: datos.telefono?.trim() || null,
    direccion: datos.direccion?.trim() || null,
    fecha_nacimiento: datos.fecha_nacimiento || null,
    tutor_nombre: datos.tutor_nombre?.trim() || null,
    tutor_telefono: datos.tutor_telefono?.trim() || null,
    nivel_id: datos.nivel_id,
    grupo_id: datos.grupo_id || null,
    ciclo: datos.ciclo?.trim() || '',
    fecha_inscripcion: datos.fecha_inscripcion || hoyISO(),
    estado: 'activo',
    becado: Boolean(datos.becado),
    observaciones: datos.observaciones?.trim() || null,
    creado_por: creadoPor,
  };
  return insertar(TABLAS.alumnos, fila);
}

/** Actualiza un alumno (no permite cambiar el estado: eso es `registrarBaja`). */
export async function actualizarAlumno(id, cambios) {
  const permitidos = [
    'nombre', 'apellidos', 'curp', 'email', 'telefono', 'direccion',
    'fecha_nacimiento', 'tutor_nombre', 'tutor_telefono', 'nivel_id',
    'grupo_id', 'ciclo', 'fecha_inscripcion', 'becado', 'observaciones', 'codigo',
  ];
  const fila = {};
  for (const clave of permitidos) {
    if (cambios[clave] !== undefined) fila[clave] = cambios[clave];
  }
  return actualizar(TABLAS.alumnos, id, fila);
}

/** Registra una baja: marca al alumno y guarda el expediente. */
export async function registrarBaja(alumnoId, datos, registradoPor = null) {
  const baja = await insertar(TABLAS.bajas, {
    alumno_id: alumnoId,
    fecha_baja: datos.fecha_baja || hoyISO(),
    tipo: datos.tipo || 'voluntaria',
    motivo: (datos.motivo ?? '').trim(),
    adeudo_final: Number(datos.adeudo_final ?? 0),
    nota: datos.nota?.trim() || null,
    registrado_por: registradoPor,
  });
  await actualizar(TABLAS.alumnos, alumnoId, { estado: 'baja' });
  return baja;
}

/** Reintegra a un alumno dado de baja. */
export async function reingresarAlumno(alumnoId) {
  return actualizar(TABLAS.alumnos, alumnoId, { estado: 'activo' });
}

/** Elimina definitivamente un alumno y sus dependencias. */
export async function eliminarAlumno(id) {
  return eliminar(TABLAS.alumnos, id);
}

/** Resumen de estados para las tarjetas del panel. */
export async function resumenAlumnos() {
  const [activos, bajas, total] = await Promise.all([
    contar(TABLAS.alumnos, { estado: 'activo' }),
    contar(TABLAS.alumnos, { estado: 'baja' }),
    contar(TABLAS.alumnos),
  ]);
  return { activos, bajas, total };
}
