// services/constancias.js — generación automática de documentos oficiales en PDF.
//
// Plantillas: el cuerpo del documento vive en `iafe_configuracion` y se
// completa con marcadores {nombre_completo}, {codigo}, {nivel}, {ciclo}, etc.
// El membrete (logotipo, datos de la dependencia, folio y firma) se arma aquí.

import { TABLAS, TIPOS_DOCUMENTO } from '../config.js';
import { rpc, insertar, subirArchivo } from './db.js';
import { leerConfiguracionCompleta } from './configuracion.js';
import { resumenAcademico } from './calificaciones.js';
import { dinero, fechaLarga, hoyISO, mesActual, anioActual, nombreMes } from '../utils/dates.js';

const NAVY = [11, 47, 91];
const ORO = [176, 138, 60];
const TINTA = [18, 22, 31];
const GRIS = [105, 115, 127];

const LOGO = 'assets/png-clipart-instituto-azteca-de-formacion-empresarial-organization-institute-education-university-aztec-thumbnail-removebg-preview.png';

let cacheLogo = null;

/** Carga el logotipo como data URL (para incrustarlo en el PDF). */
async function cargarLogo() {
  if (cacheLogo !== null) return cacheLogo;
  try {
    const respuesta = await fetch(LOGO);
    if (!respuesta.ok) throw new Error('no encontrado');
    const blob = await respuesta.blob();
    const dataUrl = await new Promise((resolver, rechazar) => {
      const lector = new FileReader();
      lector.onload = () => resolver(lector.result);
      lector.onerror = rechazar;
      lector.readAsDataURL(blob);
    });
    cacheLogo = { data: dataUrl, esPNG: blob.type.includes('png') };
  } catch (error) {
    console.warn('[constancias] no se pudo cargar el logotipo', error);
    cacheLogo = false;
  }
  return cacheLogo;
}

/** Sustituye los marcadores {clave} de una plantilla. */
export function completarPlantilla(plantilla, valores = {}) {
  return String(plantilla ?? '').replace(/\{(\w+)\}/g, (_, clave) => {
    const valor = valores[clave];
    return valor === undefined || valor === null ? '' : String(valor);
  });
}

/** Membrete institucional. */
async function dibujarMembrete(doc, config, folio) {
  const logo = await cargarLogo();
  const margen = 42;
  const ancho = doc.internal.pageSize.getWidth();
  let y = 42;

  if (logo) {
    try {
      doc.addImage(logo.data, logo.esPNG ? 'PNG' : 'JPEG', margen, y, 46, 46);
    } catch (error) {
      console.warn('[constancias] no se pudo insertar el logotipo', error);
    }
  }

  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(config.institucion_nombre, margen + 58, y + 12, { maxWidth: ancho - margen * 2 - 120 });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GRIS);
  const datos = [];
  if (config.institucion_direccion) datos.push(config.institucion_direccion);
  if (config.institucion_telefono) datos.push(`Tel. ${config.institucion_telefono}`);
  if (config.institucion_email) datos.push(config.institucion_email);
  if (config.institucion_rfc) datos.push(`RFC ${config.institucion_rfc}`);
  if (datos.length) doc.text(datos.join('  ·  '), margen + 58, y + 26, { maxWidth: ancho - margen * 2 - 100 });

  // filete dorado
  doc.setDrawColor(...ORO);
  doc.setLineWidth(1.4);
  doc.line(margen, y + 58, ancho - margen, y + 58);
  doc.setLineWidth(0.6);
  doc.setDrawColor(...GRIS);
  doc.line(margen, y + 61, ancho - margen, y + 61);

  if (folio) {
    doc.setFont('courier', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...NAVY);
    doc.text(folio, ancho - margen, y + 12, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS);
    doc.text('FOLIO', ancho - margen, y + 23, { align: 'right' });
  }

  return y + 84;
}

/** Pie institucional con datos bancarios (opcional). */
function dibujarPie(doc, config) {
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const margen = 42;

  doc.setDrawColor(226, 231, 236);
  doc.setLineWidth(0.5);
  doc.line(margen, alto - 54, ancho - margen, alto - 54);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRIS);
  const partes = [];
  if (config.institucion_direccion) partes.push(config.institucion_direccion);
  if (config.pago_banco) partes.push(`${config.pago_banco}${config.pago_clabe ? ` · CLABE ${config.pago_clabe}` : ''}`);
  doc.text(partes.join('   ·   '), margen, alto - 40, { maxWidth: ancho - margen * 2 });
  doc.text(
    `Generado el ${fechaLarga(hoyISO())} · ${config.institucion_siglas}`,
    ancho - margen,
    alto - 40,
    { align: 'right' },
  );
}

/** Bloque de firma. */
function dibujarFirma(doc, config, cargo, y) {
  const ancho = doc.internal.pageSize.getWidth();
  const margen = 42;
  const centro = margen + (ancho - margen * 2) / 2;

  doc.setDrawColor(...GRIS);
  doc.setLineWidth(0.6);
  doc.line(centro - 90, y, centro + 90, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...TINTA);
  doc.text(config.director_nombre || '—', centro, y + 14, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GRIS);
  doc.text(cargo || config.director_cargo, centro, y + 26, { align: 'center' });
  doc.text(config.institucion_siglas, centro, y + 38, { align: 'center' });
}

/** Recuadro con los datos del alumno. */
function dibujarDatos(doc, filas, y) {
  const ancho = doc.internal.pageSize.getWidth();
  const margen = 42;
  const disponible = ancho - margen * 2;
  const altoFila = 18;
  const alto = filas.length * altoFila + 10;

  doc.setDrawColor(226, 231, 236);
  doc.setFillColor(250, 251, 252);
  doc.setLineWidth(0.5);
  doc.roundedRect(margen, y, disponible, alto, 3, 3, 'FD');

  doc.setFont('helvetica', 'normal');
  filas.forEach((fila, i) => {
    const filaY = y + 16 + i * altoFila;
    doc.setFontSize(8);
    doc.setTextColor(...GRIS);
    doc.text(String(fila[0]).toUpperCase(), margen + 12, filaY);
    doc.setFontSize(9.5);
    doc.setTextColor(...TINTA);
    doc.text(String(fila[1] ?? '—'), margen + 150, filaY, { maxWidth: disponible - 165 });
  });

  return y + alto + 18;
}

/**
 * Genera un documento oficial.
 *
 * @param {object} opciones
 * @param {'estudios'|'inscripcion'|'boleta'|'comprobante'|'certificado'} opciones.tipo
 * @param {object} opciones.alumno
 * @param {object} [opciones.pago]      mensualidad asociada (para el comprobante)
 * @param {object[]} [opciones.calificaciones]
 * @param {object} [opciones.config]
 * @param {string} [opciones.emisorId]
 * @returns {Promise<{ folio: string, pdf: Blob, datos: object }>}
 */
export async function generarDocumento({
  tipo,
  alumno,
  pago = null,
  calificaciones = [],
  config = null,
  emisorId = null,
  folio = null,
}) {
  const { jsPDF } = window.jspdf ?? {};
  if (!jsPDF) throw new Error('No se pudo cargar el generador de PDF.');

  const cfg = config ?? (await leerConfiguracionCompleta());
  const numeroFolio = folio ?? (await rpc('iafe_siguiente_folio', { p_tipo: tipo }));

  const nombre = [alumno.nombre, alumno.apellidos].filter(Boolean).join(' ');
  const nivel = alumno.nivel?.nombre ?? alumno.nivel_nombre ?? '';
  const ciclo = alumno.ciclo || cfg.ciclo_activo || '';
  const grupo = alumno.grupo?.nombre ?? '';

  const resumen = resumenAcademico(calificaciones, cfg.escala_minima);
  const promedioTexto = resumen.promedioGeneral !== null ? String(resumen.promedioGeneral) : '—';

  const valores = {
    nombre_completo: nombre,
    codigo: alumno.codigo ?? '',
    curp: alumno.curp ?? '',
    nivel,
    ciclo,
    grupo,
    promedio: promedioTexto,
    fecha_inscripcion: fechaLarga(alumno.fecha_inscripcion),
    adeudo: dinero(0),
    pagado: dinero(0),
    fecha_emision: fechaLarga(hoyISO()),
    folio: numeroFolio,
  };

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const ancho = doc.internal.pageSize.getWidth();
  const margen = 42;
  const maxAncho = ancho - margen * 2;

  let y = await dibujarMembrete(doc, cfg, numeroFolio);

  // Título del documento
  const titulos = {
    estudios: 'CONSTANCIA DE ESTUDIOS',
    inscripcion: 'CONSTANCIA DE INSCRIPCIÓN',
    boleta: 'BOLETA DE CALIFICACIONES',
    comprobante: 'COMPROBANTE DE PAGO',
    certificado: 'CERTIFICADO DE CONCLUSIÓN',
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...NAVY);
  doc.text(titulos[tipo] ?? 'DOCUMENTO', ancho / 2, y, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  doc.text(`${cfg.institucion_siglas} · ${nombre}`, ancho / 2, y + 14, { align: 'center' });

  y += 34;

  // Cuerpo
  const plantillas = {
    estudios: cfg.plantilla_estudios,
    inscripcion: cfg.plantilla_inscripcion,
    certificado: cfg.plantilla_certificado,
  };

  if (tipo === 'boleta' || tipo === 'comprobante') {
    // El cuerpo de estos documentos se arma con tablas, no con párrafo.
  } else {
    const texto = completarPlantilla(plantillas[tipo] ?? '', valores);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...TINTA);
    const lineas = doc.splitTextToSize(texto, maxAncho);
    doc.text(lineas, margen, y, { lineHeightFactor: 1.55 });
    y += lineas.length * 16 + 14;
  }

  // Bloque de datos
  const filasDatos = [
    ['Alumno(a)', nombre],
    ['Matrícula', alumno.codigo ?? ''],
    ['CURP', alumno.curp || '—'],
    ['Nivel', nivel],
    ['Grupo', grupo || '—'],
    ['Ciclo', ciclo || '—'],
  ];

  if (tipo === 'estudios' || tipo === 'certificado') {
    filasDatos.push(['Promedio general', promedioTexto]);
  }

  if (tipo === 'inscripcion') {
    filasDatos.push(['Fecha de inscripción', fechaLarga(alumno.fecha_inscripcion)]);
  }

  if (tipo === 'comprobante' && pago) {
    filasDatos.push(['Concepto', pago.concepto ?? 'mensualidad']);
    filasDatos.push(['Periodo', `${nombreMes(pago.mes)} ${pago.anio}`]);
    filasDatos.push(['Monto', dinero(pago.monto)]);
    filasDatos.push(['Fecha de pago', fechaLarga(pago.fecha_pago)]);
    filasDatos.push(['Método', pago.metodo ?? '—']);
    if (pago.referencia) filasDatos.push(['Referencia', pago.referencia]);
  }

  y = dibujarDatos(doc, filasDatos, y);

  // Tablas específicas
  if (tipo === 'boleta') {
    if (doc.autoTable) {
      doc.autoTable({
        startY: y,
        head: [['Materia', 'Parcial 1', 'Parcial 2', 'Parcial 3', 'Final']],
        body: resumen.filas.map((m) => [
          m.materia,
          m.notas.parcial_1 ?? '—',
          m.notas.parcial_2 ?? '—',
          m.notas.parcial_3 ?? '—',
          m.final ?? '—',
        ]),
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 6, lineColor: [226, 231, 236], lineWidth: 0.5 },
        headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [250, 251, 252] },
        margin: { left: margen, right: margen },
        didDrawPage: () => dibujarPie(doc, cfg),
      });
      y = doc.lastAutoTable.finalY + 22;
    }
  }

  if (tipo === 'comprobante') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...TINTA);
    doc.text(`Importe pagado: ${dinero(pago?.monto ?? 0)}`, margen, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GRIS);
    doc.text(
      `Recibo número ${numeroFolio}. Consérvese este comprobante para cualquier aclaración.`,
      margen,
      y + 16,
      { maxWidth: maxAncho },
    );
    y += 44;
  }

  // Firma
  const altoPagina = doc.internal.pageSize.getHeight();
  if (y > altoPagina - 170) {
    doc.addPage();
    y = 60;
  }
  dibujarFirma(doc, cfg, cfg.director_cargo, y + 40);

  dibujarPie(doc, cfg);

  const pdf = doc.output('blob');

  return {
    folio: numeroFolio,
    pdf,
    datos: {
      ...valores,
      tipo,
      tipo_documento: TIPOS_DOCUMENTO[tipo],
      emitido_en: new Date().toISOString(),
    },
  };
}

/**
 * Genera el documento, lo archiva en Storage y registra la emisión.
 */
export async function emitirDocumento(opciones) {
  const { folio, pdf, datos } = await generarDocumento(opciones);

  const ruta = `constancias/${folio}.pdf`;
  await subirArchivo(ruta, pdf);

  const registro = await insertar(TABLAS.constancias, {
    alumno_id: opciones.alumno.id,
    tipo: opciones.tipo,
    folio,
    datos,
    path: ruta,
    emitido_por: opciones.emisorId ?? null,
  });

  return { folio, pdf, ruta, registro };
}

/** Historial de documentos emitidos de un alumno. */
export async function constanciasDeAlumno(alumnoId) {
  const { listar } = await import('./db.js');
  return listar(TABLAS.constancias, {
    filtros: { alumno_id: alumnoId },
    orden: { columna: 'fecha_emision', asc: false },
  });
}
