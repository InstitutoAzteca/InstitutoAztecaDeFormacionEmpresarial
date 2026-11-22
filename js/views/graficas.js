// views/graficas.js — gráficas SVG ligeras (sin librerías externas).

import { dinero, numero } from '../utils/dates.js';

const ANCHO = 720;
const ALTO = 220;
const MARGEN = { arriba: 18, derecha: 12, abajo: 28, izquierda: 52 };

/** Redondea el eje a un valor "limpio" (1, 2, 2.5, 5 × 10ⁿ). */
function maximoBonito(valor) {
  if (!Number.isFinite(valor) || valor <= 0) return 1;
  const exponente = 10 ** Math.floor(Math.log10(valor));
  const normalizado = valor / exponente;
  const paso = normalizado <= 1 ? 1 : normalizado <= 2 ? 2 : normalizado <= 2.5 ? 2.5 : normalizado <= 5 ? 5 : 10;
  return paso * exponente;
}

/**
 * Gráfica de barras comparadas (recaudado vs esperado).
 * @param {Array<{etiqueta:string, recaudado:number, esperado:number}>} datos
 */
export function barrasComparadas(datos = []) {
  if (!datos.length) return '<p class="pequeno tenue">Sin datos para graficar.</p>';

  const maximo = maximoBonito(Math.max(...datos.flatMap((d) => [d.recaudado, d.esperado])));
  const anchoUtil = ANCHO - MARGEN.izquierda - MARGEN.derecha;
  const altoUtil = ALTO - MARGEN.arriba - MARGEN.abajo;
  const paso = anchoUtil / datos.length;
  const anchoBarra = Math.min(22, paso * 0.3);

  const ejeY = (valor) => MARGEN.arriba + altoUtil - (valor / maximo) * altoUtil;

  const lineas = [];
  for (let i = 0; i <= 4; i += 1) {
    const valor = (maximo / 4) * i;
    const y = ejeY(valor);
    lineas.push(`<line class="grafica__eje" x1="${MARGEN.izquierda}" y1="${y}" x2="${ANCHO - MARGEN.derecha}" y2="${y}" />`);
    lineas.push(
      `<text class="grafica__etiqueta" x="${MARGEN.izquierda - 8}" y="${y + 3}" text-anchor="end">${
        valor >= 1000 ? `${Math.round(valor / 1000)}k` : Math.round(valor)
      }</text>`,
    );
  }

  const barras = datos.map((d, i) => {
    const centro = MARGEN.izquierda + paso * i + paso / 2;
    const yEsperado = ejeY(d.esperado);
    const yRecaudado = ejeY(d.recaudado);
    const alturaEsperado = Math.max(MARGEN.arriba + altoUtil - yEsperado, 0);
    const alturaRecaudado = Math.max(MARGEN.arriba + altoUtil - yRecaudado, 0);

    return `
      <g>
        <rect class="grafica__barra" x="${centro - anchoBarra - 2}" y="${yEsperado}" width="${anchoBarra}" height="${alturaEsperado}" fill="#E4E8ED" rx="2">
          <title>Esperado ${d.etiqueta}: ${dinero(d.esperado)}</title>
        </rect>
        <rect class="grafica__barra" x="${centro + 2}" y="${yRecaudado}" width="${anchoBarra}" height="${alturaRecaudado}" fill="#0B2F5B" rx="2">
          <title>Recaudado ${d.etiqueta}: ${dinero(d.recaudado)}</title>
        </rect>
        <text class="grafica__etiqueta" x="${centro}" y="${ALTO - 10}" text-anchor="middle">${d.etiqueta}</text>
      </g>`;
  });

  return `
    <div class="grafica">
      <svg viewBox="0 0 ${ANCHO} ${ALTO}" role="img" aria-label="Ingresos por mes">
        ${lineas.join('')}
        ${barras.join('')}
      </svg>
    </div>
    <div class="leyenda mt-3">
      <span><i class="leyenda__punto" style="background:#0B2F5B"></i>Recaudado</span>
      <span><i class="leyenda__punto" style="background:#E4E8ED"></i>Esperado</span>
    </div>`;
}

/**
 * Barras horizontales para distribuciones (alumnos por nivel, etc.).
 * @param {Array<{etiqueta:string, valor:number, color?:string}>} datos
 */
export function barrasHorizontales(datos = []) {
  if (!datos.length) return '<p class="pequeno tenue">Sin datos para graficar.</p>';

  const total = datos.reduce((suma, d) => suma + d.valor, 0) || 1;
  const paleta = ['#0B2F5B', '#14457F', '#0F7B5A', '#A96A12', '#5B3A8E', '#8A3B2E', '#1F5FA8', '#B08A3C'];

  const filas = datos.map((d, i) => {
    const porcentaje = Math.round((d.valor / total) * 100);
    const color = d.color ?? paleta[i % paleta.length];
    return `
      <div class="mb-3">
        <div class="fila--separada mb-3">
          <span class="pequeno">${d.etiqueta}</span>
          <span class="pequeno mono">${numero(d.valor)} · ${porcentaje}%</span>
        </div>
        <div class="barra-avance">
          <div class="barra-avance__valor" style="width:${porcentaje}%;background:${color}"></div>
        </div>
      </div>`;
  });

  return filas.join('');
}

/** Línea de tendencia mensual (recaudado acumulado vs meta). */
export function lineaTendencia(datos = []) {
  if (datos.length < 2) return '<p class="pequeno tenue">Se necesitan al menos dos meses para graficar.</p>';

  const maximo = Math.max(...datos.map((d) => d.valor), 1);
  const anchoUtil = ANCHO - MARGEN.izquierda - MARGEN.derecha;
  const altoUtil = ALTO - MARGEN.arriba - MARGEN.abajo;
  const paso = anchoUtil / (datos.length - 1);
  const y = (valor) => MARGEN.arriba + altoUtil - (valor / maximo) * altoUtil;

  const puntos = datos.map((d, i) => `${MARGEN.izquierda + paso * i},${y(d.valor)}`).join(' ');
  const area = `${MARGEN.izquierda},${MARGEN.arriba + altoUtil} ${puntos} ${MARGEN.izquierda + paso * (datos.length - 1)},${MARGEN.arriba + altoUtil}`;

  const etiquetas = datos
    .map(
      (d, i) =>
        `<text class="grafica__etiqueta" x="${MARGEN.izquierda + paso * i}" y="${ALTO - 10}" text-anchor="middle">${d.etiqueta}</text>`,
    )
    .join('');

  const puntosCirculo = datos
    .map((d, i) => `<circle cx="${MARGEN.izquierda + paso * i}" cy="${y(d.valor)}" r="3.5" fill="#0B2F5B"><title>${d.etiqueta}: ${dinero(d.valor)}</title></circle>`)
    .join('');

  return `
    <div class="grafica">
      <svg viewBox="0 0 ${ANCHO} ${ALTO}" role="img" aria-label="Tendencia">
        <polygon points="${area}" fill="#0B2F5B" opacity="0.08" />
        <polyline points="${puntos}" fill="none" stroke="#0B2F5B" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        ${puntosCirculo}
        ${etiquetas}
      </svg>
    </div>`;
}
