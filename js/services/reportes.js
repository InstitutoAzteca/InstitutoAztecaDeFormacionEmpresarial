// services/reportes.js — exportación a CSV y PDF.

import { descargar } from '../utils/ui.js';

function celdaCSV(valor) {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** Descarga un CSV (con BOM para que Excel respete acentos). */
export function exportarCSV(filas = [], nombre = 'reporte.csv', columnas = null) {
  const claves = columnas ?? (filas[0] ? Object.keys(filas[0]) : []);
  const lineas = [claves.map(celdaCSV).join(',')];
  for (const fila of filas) {
    lineas.push(claves.map((c) => celdaCSV(fila[c])).join(','));
  }
  const blob = new Blob(['\uFEFF' + lineas.join('\n')], { type: 'text/csv;charset=utf-8' });
  descargar(blob, nombre);
}

/** Descarga un PDF con tabla (jsPDF + AutoTable). */
export function exportarPDF({
  titulo = 'Reporte',
  subtitulo = '',
  columnas = [],
  filas = [],
  nombre = 'reporte.pdf',
  orientacion = 'portrait',
} = {}) {
  const { jsPDF } = window.jspdf ?? {};
  if (!jsPDF) throw new Error('No se pudo cargar el generador de PDF.');

  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation });
  const ancho = doc.internal.pageSize.getWidth();
  const margen = 40;

  doc.setFillColor(11, 47, 91);
  doc.rect(0, 0, ancho, 74, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(titulo, margen, 38);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(200, 210, 224);
  doc.text(subtitulo || `Generado el ${new Date().toLocaleString('es-MX')}`, margen, 56);

  doc.setDrawColor(176, 138, 60);
  doc.setLineWidth(1.4);
  doc.line(margen, 82, ancho - margen, 82);

  doc.autoTable({
    startY: 96,
    head: [columnas],
    body: filas,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 5, lineColor: [226, 231, 236], lineWidth: 0.5 },
    headStyles: { fillColor: [11, 47, 91], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [250, 251, 252] },
    margin: { left: margen, right: margen },
    didDrawPage: () => {
      const alto = doc.internal.pageSize.getHeight();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(140, 148, 158);
      doc.text(
        `Instituto Azteca de Formación Empresarial · ${new Date().toLocaleDateString('es-MX')}`,
        margen,
        alto - 20,
      );
    },
  });

  doc.save(nombre);
}

/** Filas tabulares del reporte de ingresos. */
export function filasIngresos(meses) {
  return meses.map((m) => ({
    Mes: m.etiqueta,
    'Alumnos con pago': m.pagado,
    Recaudado: m.recaudado,
    Pendiente: m.pendiente,
  }));
}

/** Filas tabulares del reporte de alumnos. */
export function filasAlumnos(alumnos) {
  return alumnos.map((a) => ({
    Matrícula: a.codigo,
    Alumno: [a.nombre, a.apellidos].filter(Boolean).join(' '),
    Nivel: a.nivel?.nombre ?? '',
    Grupo: a.grupo?.nombre ?? '',
    Ciclo: a.ciclo ?? '',
    Teléfono: a.telefono ?? '',
    Estado: a.estado === 'baja' ? 'Baja' : 'Activo',
  }));
}

/** Filas tabulares del reporte de pagos del periodo. */
export function filasPagos(pagos, alumnosPorId) {
  return pagos.map((p) => {
    const alumno = alumnosPorId.get(p.alumno_id);
    return {
      Alumno: alumno ? [alumno.nombre, alumno.apellidos].filter(Boolean).join(' ') : '—',
      Matrícula: alumno?.codigo ?? '',
      Nivel: alumno?.nivel?.nombre ?? '',
      Periodo: `${p.mes}/${p.anio}`,
      Monto: p.monto,
      Estado: p.estado,
      'Fecha de pago': p.fecha_pago ?? '',
      Método: p.metodo ?? '',
    };
  });
}
