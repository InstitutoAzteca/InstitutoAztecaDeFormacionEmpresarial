// services/pagos.js — mensualidades, adeudos y recibos.

import { TABLAS, CONCEPTOS, METODOS_PAGO } from '../config.js';
import { listar, insertar, actualizar, eliminar } from './db.js';
import { anioActual, mesActual } from '../utils/dates.js';

/** Etiqueta legible de un concepto. */
export function etiquetaConcepto(valor) {
  return CONCEPTOS.find((c) => c.valor === valor)?.etiqueta ?? valor;
}

/** Etiqueta legible de un método de pago. */
export function etiquetaMetodo(valor) {
  return METODOS_PAGO.find((m) => m.valor === valor)?.etiqueta ?? valor ?? '—';
}

/** Todas las mensualidades de un alumno, ordenadas. */
export async function pagosDeAlumno(alumnoId) {
  return listar(TABLAS.mensualidades, {
    filtros: { alumno_id: alumnoId },
    orden: { columna: 'anio', asc: false },
  });
}

/** Pagos del periodo (año/mes) para todos los alumnos activos. */
export async function pagosDelPeriodo(anio = anioActual(), mes = mesActual()) {
  return listar(TABLAS.mensualidades, {
    filtros: { anio, mes, concepto: 'mensualidad' },
    orden: { columna: 'alumno_id', asc: true },
  });
}

/**
 * Registra un pago. Si ya existe el registro del periodo lo actualiza.
 */
export async function registrarPago(datos) {
  const fila = {
    alumno_id: datos.alumno_id,
    anio: Number(datos.anio),
    mes: Number(datos.mes),
    ciclo: datos.ciclo ?? '',
    concepto: datos.concepto || 'mensualidad',
    monto: Number(datos.monto ?? 0),
    estado: datos.estado || 'pagada',
    fecha_pago: datos.estado === 'pagada' ? (datos.fecha_pago || null) : null,
    metodo: datos.estado === 'pagada' ? (datos.metodo || 'efectivo') : null,
    referencia: datos.referencia?.trim() || null,
    nota: datos.nota?.trim() || null,
    folio: datos.folio || null,
    registrado_por: datos.registrado_por ?? null,
  };

  const existentes = await listar(TABLAS.mensualidades, {
    filtros: {
      alumno_id: fila.alumno_id,
      anio: fila.anio,
      mes: fila.mes,
      concepto: fila.concepto,
    },
  });

  if (existentes.length) {
    return actualizar(TABLAS.mensualidades, existentes[0].id, fila);
  }
  return insertar(TABLAS.mensualidades, fila);
}

/** Cambia el estado de un pago sin registrar datos de cobro. */
export async function cambiarEstadoPago(id, estado) {
  const cambios = { estado };
  if (estado !== 'pagada') {
    cambios.fecha_pago = null;
    cambios.metodo = null;
  }
  return actualizar(TABLAS.mensualidades, id, cambios);
}

/** Elimina un registro de pago. */
export async function eliminarPago(id) {
  return eliminar(TABLAS.mensualidades, id);
}

/**
 * Genera la matriz de pagos de un ciclo: por cada alumno activo, el estado de
 * cada mes. Devuelve alumnos con su arreglo de meses.
 */
export async function matrizPagos(alumnos, { anio = anioActual() } = {}) {
  const pagos = await listar(TABLAS.mensualidades, {
    filtros: { anio },
    orden: { columna: 'mes', asc: true },
  });

  const porAlumno = new Map();
  for (const pago of pagos) {
    if (!porAlumno.has(pago.alumno_id)) porAlumno.set(pago.alumno_id, new Map());
    porAlumno.get(pago.alumno_id).set(pago.mes, pago);
  }

  return alumnos.map((alumno) => ({
    alumno,
    meses: Array.from({ length: 12 }, (_, i) => {
      const mes = i + 1;
      const pago = porAlumno.get(alumno.id)?.get(mes) ?? null;
      return {
        mes,
        pago,
        estado: pago?.estado ?? (mes <= mesActual() ? 'pendiente' : null),
      };
    }),
  }));
}

/** Totales de recaudación del periodo. */
export async function totalesPeriodo(anio = anioActual(), mes = mesActual()) {
  const pagos = await pagosDelPeriodo(anio, mes);
  const esperado = pagos.reduce((suma, p) => suma + Number(p.monto ?? 0), 0);
  const recaudado = pagos
    .filter((p) => p.estado === 'pagada')
    .reduce((suma, p) => suma + Number(p.monto ?? 0), 0);
  const condonado = pagos
    .filter((p) => p.estado === 'condonado' || p.estado === 'becado')
    .reduce((suma, p) => suma + Number(p.monto ?? 0), 0);
  const pendiente = esperado - recaudado - condonado;
  return {
    esperado,
    recaudado,
    condonado,
    pendiente: Math.max(0, pendiente),
    total: pagos.length,
    pagados: pagos.filter((p) => p.estado === 'pagada').length,
    morosos: pagos.filter((p) => p.estado === 'pendiente').length,
    porcentaje: esperado > 0 ? Math.round((recaudado / esperado) * 100) : 0,
  };
}

/** Ingresos acumulados por mes del año. */
export async function ingresosPorMes(anio = anioActual()) {
  const pagos = await listar(TABLAS.mensualidades, {
    filtros: { anio, concepto: 'mensualidad' },
  });

  const meses = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    recaudado: 0,
    esperado: 0,
    pagado: 0,
    pendiente: 0,
  }));

  for (const pago of pagos) {
    const fila = meses[pago.mes - 1];
    if (!fila) continue;
    fila.esperado += Number(pago.monto ?? 0);
    if (pago.estado === 'pagada') {
      fila.recaudado += Number(pago.monto ?? 0);
      fila.pagado += 1;
    } else if (pago.estado === 'pendiente') {
      fila.pendiente += Number(pago.monto ?? 0);
    }
  }

  return meses;
}

/** Adeudo total por alumno en el año. */
export async function adeudosPorAlumno(anio = anioActual()) {
  const pagos = await listar(TABLAS.mensualidades, {
    filtros: { anio, estado: 'pendiente' },
  });

  const porAlumno = new Map();
  for (const pago of pagos) {
    const actual = porAlumno.get(pago.alumno_id) ?? { monto: 0, meses: [] };
    actual.monto += Number(pago.monto ?? 0);
    actual.meses.push(pago.mes);
    porAlumno.set(pago.alumno_id, actual);
  }
  return porAlumno;
}
