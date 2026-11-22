// views/panel.js — tablero principal. Cambia según el rol de la sesión.

import { ROL } from '../config.js';
import { estado } from '../state.js';
import { listarAlumnos } from '../services/alumnos.js';
import { ingresosPorMes, totalesPeriodo, adeudosPorAlumno } from '../services/pagos.js';
import { listar } from '../services/db.js';
import { TABLAS } from '../config.js';
import { dinero, mesActual, anioActual, nombreMes, nombreMesCorto, enlaceWhatsApp, formatoFecha } from '../utils/dates.js';
import { escapeHTML, ICONO } from '../utils/ui.js';
import { barrasComparadas } from './graficas.js';

export async function renderPanel(contenido, { rol }) {
  const esAdmin = rol === ROL.ADMIN;

  const [alumnos, totales, meses, niveles] = await Promise.all([
    listarAlumnos({ estado: 'activo' }),
    totalesPeriodo(),
    ingresosPorMes(),
    listar(TABLAS.niveles, { orden: { columna: 'orden', asc: true } }),
  ]);

  if (esAdmin) {
    contenido.innerHTML = await panelAdmin({ alumnos, totales, meses, niveles });
  } else {
    contenido.innerHTML = await panelMaestra({ alumnos, niveles });
  }

  if (esAdmin) {
    const detalle = await detalleMorosos(alumnos, meses);
    const contenedor = contenido.querySelector('#panel-morosos');
    if (contenedor) contenedor.innerHTML = detalle;
  }
}

// ------------------------------------------------------------------ admin --
async function panelAdmin({ alumnos, totales, meses, niveles }) {
  const mes = mesActual();
  const anio = anioActual();
  const porNivel = new Map();
  for (const alumno of alumnos) {
    const clave = alumno.nivel?.nombre ?? 'Sin nivel';
    porNivel.set(clave, (porNivel.get(clave) ?? 0) + 1);
  }

  const bajas = await listar(TABLAS.alumnos, { filtros: { estado: 'baja' } });

  const kpis = [
    {
      etiqueta: `Recaudado · ${nombreMesCorto(mes)}`,
      valor: dinero(totales.recaudado),
      nota: `<b>${totales.porcentaje}%</b> de lo esperado`,
      tono: 'exito',
    },
    {
      etiqueta: 'Pendiente del mes',
      valor: dinero(totales.pendiente),
      nota: `<b>${totales.morosos}</b> alumno(s) con mensualidad pendiente`,
      tono: totales.pendiente > 0 ? 'aviso' : 'exito',
    },
    {
      etiqueta: 'Alumnos activos',
      valor: String(alumnos.length),
      nota: `<b>${bajas.length}</b> baja(s) registradas`,
      tono: 'neutro',
    },
    {
      etiqueta: 'Ingresos del año',
      valor: dinero(meses.reduce((suma, m) => suma + m.recaudado, 0)),
      nota: `Ciclo ${estado.config?.ciclo_activo || 'sin definir'}`,
      tono: 'oro',
    },
  ];

  const datosGrafica = meses.map((m) => ({
    etiqueta: nombreMesCorto(m.mes),
    recaudado: m.recaudado,
    esperado: m.esperado,
  }));

  return `
    <div class="pagina">
      <div class="pagina__cabecera">
        <div>
          <p class="antetitulo">Instituto Azteca de Formación Empresarial</p>
          <h1 class="pagina__titulo">Panel de administración</h1>
          <p class="pagina__sub">Resumen de ingresos, matrícula y cartera de ${nombreMes(mes).toLowerCase()} de ${anio}.</p>
        </div>
        <div class="pagina__acciones">
          <a class="btn btn--borde" href="#/estadisticas">Ver estadísticas</a>
          <a class="btn btn--primario" href="#/pagos">Registrar pagos</a>
        </div>
      </div>

      <section class="kpis">
        ${kpis
          .map(
            (kpi) => `
          <article class="kpi kpi--${kpi.tono}">
            <span class="kpi__etiqueta">${escapeHTML(kpi.etiqueta)}</span>
            <strong class="kpi__valor">${kpi.valor}</strong>
            <span class="kpi__nota">${kpi.nota}</span>
          </article>`,
          )
          .join('')}
      </section>

      <div class="rejilla rejilla--3">
        <section class="tarjeta rejilla__ancho" style="grid-column:span 2">
          <div class="tarjeta__cabecera">
            <h2 class="tarjeta__titulo">Ingresos mensuales</h2>
            <span class="pequeno tenue">${anio}</span>
          </div>
          <div class="tarjeta__cuerpo">
            ${barrasComparadas(datosGrafica)}
          </div>
        </section>

        <section class="tarjeta">
          <div class="tarjeta__cabecera">
            <h2 class="tarjeta__titulo">Matrícula por nivel</h2>
          </div>
          <div class="tarjeta__cuerpo">
            ${[...porNivel.entries()].length
              ? [...porNivel.entries()]
                  .map(
                    ([nivel, total]) => `
              <div class="fila--separada mb-3">
                <span class="pequeno">${escapeHTML(nivel)}</span>
                <span class="mono pequeno">${total}</span>
              </div>`,
                  )
                  .join('')
              : '<p class="pequeno tenue">Aún no hay alumnos registrados.</p>'}
            <p class="pequeno tenue mt-4">${niveles.length} nivel(es) configurados.</p>
          </div>
        </section>
      </div>

      <section class="tarjeta">
        <div class="tarjeta__cabecera">
          <h2 class="tarjeta__titulo">Cartera con mensualidad pendiente</h2>
          <a class="btn btn--sm btn--borde" href="#/pagos">Abrir mensualidades</a>
        </div>
        <div class="tarjeta__cuerpo tarjeta__cuerpo--liso" id="panel-morosos">
          <div class="cargando"><span class="cargando__giro"></span></div>
        </div>
      </section>
    </div>`;
}

async function detalleMorosos(alumnos, meses) {
  const adeudos = await adeudosPorAlumno();
  if (!adeudos.size) {
    return `
      <div class="vacio" style="border:0;padding:32px">
        <h3 class="vacio__titulo">Sin pendientes</h3>
        <p class="vacio__texto">Todos los alumnos con mensualidad registrada están al corriente.</p>
      </div>`;
  }

  const porId = new Map(alumnos.map((a) => [a.id, a]));
  const filas = [...adeudos.entries()]
    .map(([alumnoId, info]) => ({ alumno: porId.get(alumnoId), info }))
    .filter((f) => f.alumno)
    .sort((a, b) => b.info.monto - a.info.monto);

  return `
    <div class="tabla-envoltura">
      <table class="tabla">
        <thead>
          <tr>
            <th>Alumno</th>
            <th>Mes pendientes</th>
            <th class="tabla__num">Adeudo</th>
            <th class="tabla__acciones">Recordar</th>
          </tr>
        </thead>
        <tbody>
          ${filas
            .map(
              ({ alumno, info }) => `
            <tr>
              <td>
                <div class="celda-principal">
                  <span class="celda-principal__titulo">${escapeHTML([alumno.nombre, alumno.apellidos].filter(Boolean).join(' '))}</span>
                  <span class="celda-principal__meta">${escapeHTML(alumno.codigo)} · ${escapeHTML(alumno.nivel?.nombre ?? '')}</span>
                </div>
              </td>
              <td class="pequeno">${info.meses.map((m) => nombreMesCorto(m)).join(', ')}</td>
              <td class="tabla__num mono">${dinero(info.monto)}</td>
              <td class="tabla__acciones">
                <a class="btn btn--sm btn--borde" href="${enlaceWhatsApp(alumno.telefono)}" target="_blank" rel="noopener">WhatsApp</a>
              </td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

// ---------------------------------------------------------------- maestra --
async function panelMaestra({ alumnos, niveles }) {
  const grupos = await listar(TABLAS.grupos, { orden: { columna: 'nombre', asc: true } });
  const calificaciones = await listar(TABLAS.calificaciones);
  const estaAnio = new Set(calificaciones.map((c) => c.alumno_id)).size;

  const gruposPropios = grupos.filter((g) => !g.docente_id || g.docente_id === estado.perfil?.id);

  const kpis = [
    { etiqueta: 'Alumnos activos', valor: String(alumnos.length), nota: 'Matrícula total', tono: 'neutro' },
    { etiqueta: 'Grupos', valor: String(grupos.length), nota: `${gruposPropios.length} a tu cargo`, tono: 'neutro' },
    { etiqueta: 'Con calificaciones', valor: String(estaAnio), nota: 'Alumnos evaluados', tono: 'exito' },
    { etiqueta: 'Niveles', valor: String(niveles.length), nota: 'Programas disponibles', tono: 'oro' },
  ];

  return `
    <div class="pagina">
      <div class="pagina__cabecera">
        <div>
          <p class="antetitulo">Instituto Azteca de Formación Empresarial</p>
          <h1 class="pagina__titulo">Panel docente</h1>
          <p class="pagina__sub">Alumnos, grupos y avance de calificaciones del ciclo ${escapeHTML(estado.config?.ciclo_activo || 'sin definir')}.</p>
        </div>
        <div class="pagina__acciones">
          <a class="btn btn--primario" href="#/calificaciones">Capturar calificaciones</a>
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
          <h2 class="tarjeta__titulo">Grupos del ciclo</h2>
          <a class="btn btn--sm btn--borde" href="#/calificaciones">Ir a calificaciones</a>
        </div>
        <div class="tarjeta__cuerpo tarjeta__cuerpo--liso">
          ${
            grupos.length
              ? `<div class="tabla-envoltura"><table class="tabla">
                  <thead><tr><th>Grupo</th><th>Nivel</th><th>Ciclo</th><th>Horario</th></tr></thead>
                  <tbody>
                    ${grupos
                      .map(
                        (grupo) => `
                      <tr>
                        <td class="celda-principal__titulo">${escapeHTML(grupo.nombre)}</td>
                        <td>${escapeHTML(niveles.find((n) => n.id === grupo.nivel_id)?.nombre ?? '—')}</td>
                        <td class="mono pequeno">${escapeHTML(grupo.ciclo || '—')}</td>
                        <td class="pequeno">${escapeHTML(grupo.horario || '—')}</td>
                      </tr>`,
                      )
                      .join('')}
                  </tbody>
                </table></div>`
              : `<div class="vacio" style="border:0">
                  <h3 class="vacio__titulo">Aún no hay grupos</h3>
                  <p class="vacio__texto">El administrador debe registrar los grupos antes de capturar calificaciones.</p>
                </div>`
          }
        </div>
      </section>
    </div>`;
}
