// services/configuracion.js — datos oficiales y textos de plantilla.

import { TABLAS } from '../config.js';
import { listar, insertar, actualizar } from './db.js';

/** Lee toda la configuración como un objeto plano { clave: valor }. */
export async function leerConfiguracion() {
  const filas = await listar(TABLAS.configuracion, { orden: { columna: 'clave', asc: true } });
  const mapa = {};
  for (const fila of filas) {
    const valor = fila.valor;
    mapa[fila.clave] = typeof valor === 'string' ? valor : (valor ?? '');
  }
  return mapa;
}

/** Configuración con valores por defecto para las claves ausentes. */
export async function leerConfiguracionCompleta() {
  const base = await leerConfiguracion();
  return {
    institucion_nombre: base.institucion_nombre || 'Instituto Azteca de Formación Empresarial',
    institucion_siglas: base.institucion_siglas || 'IAFE',
    institucion_rfc: base.institucion_rfc || '',
    institucion_direccion: base.institucion_direccion || '',
    institucion_telefono: base.institucion_telefono || '',
    institucion_email: base.institucion_email || '',
    director_nombre: base.director_nombre || '',
    director_cargo: base.director_cargo || 'Director',
    coordinador_nombre: base.coordinador_nombre || '',
    pago_banco: base.pago_banco || '',
    pago_clabe: base.pago_clabe || '',
    pago_titular: base.pago_titular || '',
    pago_concepto: base.pago_concepto || 'Pago de mensualidad',
    ciclo_activo: base.ciclo_activo || '',
    escala_minima: Number(base.escala_minima || 6),
    codigo_invitacion: base.codigo_invitacion || '',
    plantilla_estudios: base.plantilla_estudios || '',
    plantilla_inscripcion: base.plantilla_inscripcion || '',
    plantilla_certificado: base.plantilla_certificado || '',
    plantilla_boleta: base.plantilla_boleta || 'Boleta de calificaciones',
    plantilla_comprobante: base.plantilla_comprobante || 'Comprobante de pago',
  };
}

/** Guarda un valor de configuración. */
export async function guardarConfiguracion(clave, valor, usuarioId = null) {
  // El valor viaja como texto plano: PostgREST lo serializa como JSON y lo
  // guarda en la columna jsonb. Si se serializara aquí, quedaría entrecomillado.
  const contenido = valor === null || valor === undefined ? '' : String(valor);

  const existente = (await listar(TABLAS.configuracion, { filtros: { clave } }))[0];
  if (existente) {
    return actualizar(TABLAS.configuracion, existente.id, {
      valor: contenido,
      actualizado_por: usuarioId,
    });
  }
  return insertar(TABLAS.configuracion, {
    clave,
    valor: contenido,
    actualizado_por: usuarioId,
  });
}
