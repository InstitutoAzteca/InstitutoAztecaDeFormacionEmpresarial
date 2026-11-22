// services/calificaciones.js — captura y consulta de calificaciones.

import { TABLAS, PERIODOS } from '../config.js';
import { listar, insertar, actualizar, eliminar } from './db.js';
import { promedio } from '../utils/dates.js';

export function etiquetaPeriodo(valor) {
  return PERIODOS.find((p) => p.valor === valor)?.etiqueta ?? valor;
}

/** Calificaciones de un alumno. */
export async function calificacionesDeAlumno(alumnoId) {
  return listar(TABLAS.calificaciones, {
    filtros: { alumno_id: alumnoId },
    orden: { columna: 'alumno_id', asc: true },
  });
}

/** Calificaciones de un grupo y periodo. */
export async function calificacionesDeGrupo(grupoId, periodo = null) {
  const filtros = { grupo_id: grupoId };
  if (periodo) filtros.periodo = periodo;
  return listar(TABLAS.calificaciones, { filtros });
}

/** Materias que ya se han capturado (para autocompletar). */
export async function materiasConocidas() {
  const todas = await listar(TABLAS.calificaciones, { select: 'materia' });
  return [...new Set(todas.map((c) => c.materia))].sort((a, b) => a.localeCompare(b, 'es'));
}

/**
 * Guarda una calificación. Actualiza si ya existe el mismo alumno/materia/periodo.
 */
export async function guardarCalificacion(datos) {
  const existentes = await listar(TABLAS.calificaciones, {
    filtros: {
      alumno_id: datos.alumno_id,
      materia: datos.materia.trim(),
      periodo: datos.periodo,
    },
  });

  const fila = {
    alumno_id: datos.alumno_id,
    grupo_id: datos.grupo_id || null,
    materia: datos.materia.trim(),
    periodo: datos.periodo,
    calificacion:
      datos.calificacion === '' || datos.calificacion === null || datos.calificacion === undefined
        ? null
        : Number(datos.calificacion),
    docente_id: datos.docente_id ?? null,
    comentario: datos.comentario?.trim() || null,
    fecha: datos.fecha || null,
  };

  if (existentes.length) {
    return actualizar(TABLAS.calificaciones, existentes[0].id, fila);
  }
  return insertar(TABLAS.calificaciones, fila);
}

/** Guarda varias calificaciones a la vez (captura de una fila de la hoja). */
export async function guardarCalificaciones(lista) {
  const resultados = [];
  for (const dato of lista) {
    resultados.push(await guardarCalificacion(dato));
  }
  return resultados;
}

export async function eliminarCalificacion(id) {
  return eliminar(TABLAS.calificaciones, id);
}

/**
 * Resumen académico de un alumno: materias, notas por periodo y promedio.
 */
export function resumenAcademico(calificaciones = [], escalaMinima = 6) {
  const porMateria = new Map();

  for (const c of calificaciones) {
    if (!porMateria.has(c.materia)) {
      porMateria.set(c.materia, { materia: c.materia, notas: {}, final: null });
    }
    const materia = porMateria.get(c.materia);
    if (c.calificacion !== null && c.calificacion !== undefined) {
      materia.notas[c.periodo] = Number(c.calificacion);
    }
  }

  const filas = [...porMateria.values()].map((materia) => {
    const notas = Object.values(materia.notas);
    const final = materia.notas.final ?? promedio(notas);
    return {
      ...materia,
      final: final === null ? null : Math.round(final * 100) / 100,
      aprobado: final === null ? null : final >= escalaMinima,
    };
  });

  const notasFinales = filas.map((f) => f.final).filter((n) => n !== null);
  const general = promedio(notasFinales);

  return {
    filas: filas.sort((a, b) => a.materia.localeCompare(b.materia, 'es')),
    promedioGeneral: general,
    aprobado: general === null ? null : general >= escalaMinima,
    totalMaterias: filas.length,
  };
}

/** Promedio general de un alumno sobre todas sus calificaciones. */
export async function promedioAlumno(alumnoId, escalaMinima = 6) {
  const calificaciones = await calificacionesDeAlumno(alumnoId);
  return resumenAcademico(calificaciones, escalaMinima);
}
