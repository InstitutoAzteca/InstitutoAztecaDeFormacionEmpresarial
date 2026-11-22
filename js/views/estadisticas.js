// views/estadisticas.js — análisis de ingresos, matrícula y cobranza.

import { TABLAS } from '../config.js';
import { estado } from '../state.js';
import { listarAlumnos } from '../services/alumnos.js';
import { ingresosPorMes, totalesPeriodo, adeudosPorAlumno } from '../services/pagos.js';
import { listar } from '../services/db.js';
import { exportarCSV, exportarPDF, filasAlumnos } from '../services/reportes.js';
import { escapeHTML, aviso, ICONO } from '../utils/ui.js';
import { dinero, numero, nombreMesCorto, mesActual, anioActual } from '../utils/dates.js';
import { barrasComparadas, barrasHorizontales, lineaTendencia } from './graficas.js';

export async function renderEstadisticas(contenido) {
  const anio = anioActual();

  const [alumnos, niveles, totales, meses, todosAlumnos] = await Promise.all([
    listarAlumnos({ estado: 'activo' }),
    listar(TABLAS.niveles, { orden: { columna: 'orden', asc: true } }),
    totalesPeriodo(anio, mesActual()),
    ingresosPorMes(anio),
    listarAlumnos({ estado: null }),
  ]);

  const porNivel = new Map();
  for (const alumno of alumnos) {
    const clave = alumno.nivel?.nombre ?? 'Sin nivel';
    porNivel.set(clave, (porNivel.get(clave) ?? 0) + 1);
  }

  const ingresosAnuales = meses.reduce((s, m) => s + m.recaudado, 0);
  const esperadoAnual = meses.reduce((s, m) => s + m.esperado, 0);
  const bajas = todosAlumnos.filter((a) => a.estado === 'baja');
  const adeudos = await adeudosPorAlumno(anio);

  const kpis = [
    { etiqueta: `Ingresos ${anio}`, valor: dinero(ingresosAnuales), nota: `esperado ${dinero(esperadoAnual)}`, tono: 'exito' },
    {
      etiqueta: 'Eficiencia de cobranza',
      valor: `${esperadoAnual ? Math.round((ingresosAnuales / esperadoAnual) * 100) : 0}%`,
      nota: 'del total esperado',
      tono: 'oro',
    },
    { etiqueta: 'Alumnos activos', valor: numero(alumnos.length), nota: `${bajas.length} baja(s)`, tono: 'neutro' },
    {
      etiqueta: 'Cartera vencida',
      valor: dinero([...adeudos.values()].reduce((s, a) => s + a.monto, 0)),
      nota: `${adeudos.size} alumno(s) con adeudo`,
      tono: adeudos.size ? 'aviso' : 'neutro',
    },
  ];

  contenido.innerHTML = `
    <div class="pagina">
      <div class="pagina__cabecera">
        <div>
          <p class="antetitulo">Análisis</p>
          <h1 class="pagina__titulo">Estadísticas</h1>
          <p class="pagina__sub">Ingresos, matrícula y cartera del ciclo ${escapeHTML(estado.config?.ciclo_activo || anio)}.</p>
        </div>
        <div class="pagina__acciones">
          <button class="btn btn--borde" type="button" id="btn-csv">${ICONO.descargar} Alumnos (CSV)</button>
          <button class="btn btn--borde" type="button" id="btn-pdf">${ICONO.descargar} Ingresos (PDF)</button>
        </div>
      </div>

      <section class="kpis">
        ${kpis
          .map(
            (kpi) => `
          <article class="kpi kpi--${kpi.tono}">
            <span class="kpi__etiqueta">${escapeHTML(kpi.etiqueta)}</span>
            <strong class="kpi__valor">${kpi.valor}</strong>
            <span class="kpi__nota">${escapeHTML(kpi.nota)}</span>
          </article>`,
          )
          .join('')}
      </section>

      <section class="tarjeta">
        <div class="tarjeta__cabecera">
          <h2 class="tarjeta__titulo">Recaudado vs. esperado</h2>
          <span class="pequeno tenue">${anio}</span>
        </div>
        <div class="tarjeta__cuerpo">
          ${barrasComparadas(
            meses.map((m) => ({
              etiqueta: nombreMesCorto(m.mes),
              recaudado: m.recaudado,
              esperado: m.esperado,
            })),
          )}
        </div>
      </section>

      <div class="rejilla">
        <section class="tarjeta">
          <div class="tarjeta__cabecera">
            <h2 class="tarjeta__titulo">Matrícula por nivel</h2>
          </div>
          <div class="tarjeta__cuerpo">
            ${barrasHorizontales(
              [...porNivel.entries()].map(([etiqueta, valor]) => ({ etiqueta, valor })),
            )}
          </div>
        </section>

        <section class="tarjeta">
          <div class="tarjeta__cabecera">
            <h2 class="tarjeta__titulo">Tendencia de cobranza</h2>
          </div>
          <div class="tarjeta__cuerpo">
            ${lineaTendencia(
              meses
                .filter((m) => m.mes <= mesActual())
                .map((m) => ({ etiqueta: nombreMesCorto(m.mes), valor: m.recaudado })),
            )}
          </div>
        </section>
      </div>

      <section class="tarjeta">
        <div class="tarjeta__cabecera">
          <h2 class="tarjeta__titulo">Detalle por mes</h2>
        </div>
        <div class="tarjeta__cuerpo tarjeta__cuerpo--liso">
          <div class="tabla-envoltura">
            <table class="tabla">
              <thead>
                <tr><th>Mes</th><th class="tabla__num">Alumnos con pago</th><th class="tabla__num">Recaudado</th><th class="tabla__num">Pendiente</th></tr>
              </thead>
              <tbody>
                ${meses
                  .map(
                    (m) => `
                  <tr>
                    <td>${escapeHTML(nombreMesCorto(m.mes))}</td>
                    <td class="tabla__num mono">${m.pagado}</td>
                    <td class="tabla__num mono">${dinero(m.recaudado)}</td>
                    <td class="tabla__num mono">${dinero(m.pendiente)}</td>
                  </tr>`,
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>`;

  contenido.querySelector('#btn-csv').addEventListener('click', () => {
    exportarCSV(filasAlumnos(todosAlumnos), `alumnos-${anio}.csv`);
    aviso('Archivo CSV generado', 'exito');
  });

  contenido.querySelector('#btn-pdf').addEventListener('click', () => {
    exportarPDF({
      titulo: 'Ingresos mensuales',
      subtitulo: `Instituto Azteca de Formación Empresarial · ${anio}`,
      columnas: ['Mes', 'Alumnos con pago', 'Recaudado', 'Pendiente'],
      filas: meses.map((m) => [
        nombreMesCorto(m.mes),
        m.pagado,
        dinero(m.recaudado),
        dinero(m.pendiente),
      ]),
      nombre: `ingresos-${anio}.pdf`,
    });
  });
}
