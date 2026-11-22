// services/documentos.js — documentación PDF del alumno en Storage.

import { TABLAS, TIPOS_ARCHIVO } from '../config.js';
import { listar, insertar, eliminar, subirArchivo, eliminarArchivo, urlFirmada } from './db.js';

export function etiquetaTipoArchivo(tipo) {
  return TIPOS_ARCHIVO[tipo] ?? 'Otro documento';
}

/** Documentos de un alumno. */
export async function documentosDeAlumno(alumnoId) {
  return listar(TABLAS.documentos, {
    filtros: { alumno_id: alumnoId },
    orden: { columna: 'creado_en', asc: false },
  });
}

/**
 * Sube un PDF al bucket y registra el documento.
 * @param {string} alumnoId
 * @param {File} archivo
 * @param {string} tipo
 * @param {string} subidoPor
 */
export async function subirDocumento(alumnoId, archivo, tipo = 'otro', subidoPor = null, nota = '') {
  if (!archivo) throw new Error('Selecciona un archivo.');
  const esPdf = archivo.type === 'application/pdf' || archivo.name.toLowerCase().endsWith('.pdf');
  if (!esPdf) throw new Error('Sólo se aceptan archivos en formato PDF.');
  if (archivo.size > 10 * 1024 * 1024) throw new Error('El archivo supera el límite de 10 MB.');

  const limpio = archivo.name.replace(/[^\w.\-]+/g, '_').slice(-80);
  const ruta = `alumnos/${alumnoId}/${crypto.randomUUID()}-${limpio}`;

  await subirArchivo(ruta, archivo);

  return insertar(TABLAS.documentos, {
    alumno_id: alumnoId,
    tipo,
    nombre_archivo: archivo.name,
    path: ruta,
    mime: 'application/pdf',
    tamano: archivo.size,
    nota: nota?.trim() || null,
    subido_por: subidoPor,
  });
}

/** Enlace temporal de descarga. */
export async function enlaceDocumento(ruta) {
  return urlFirmada(ruta, 300);
}

/** Elimina el registro y el archivo almacenado. */
export async function borrarDocumento(documento) {
  await eliminarArchivo(documento.path).catch(() => {});
  return eliminar(TABLAS.documentos, documento.id);
}

/** Formatea el tamaño del archivo. */
export function tamanoLegible(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
