// views/pagos.js — matriz de mensualidades y registro de pagos.

import { TABLAS } from '../config.js';
import { estado } from '../state.js';
import { listarAlumnos } from '../services/alumnos.js';
import { matrizPagos, totalesPeriodo, ingresosPorMes, etiquetaConcepto } from '../services/pagos.js';
import { listar } from '../services/db.js';
import { exportarCSV, exportarPDF, filasPagos } from '../services/reportes.js';
import { escapeHTML, aviso, ICONO } from '../utils/ui.js';
import { dinero, nombreMesCorto, mesActual, anioActual, numero } from '../utils/dates.js';
import { abrirFormularioPago } from './ficha.js';

const ESTADO_PILLS = {
  pagada: '<span class="pastilla pastilla--exito">P</span>',
  pendiente: '<span class="pastilla pastilla--aviso">•</span>',
  becado: '<span class="pastilla pastilla--info">B</span>',
  condonado: '<span class="pastilla pastilla--neutro">C</span>',
};

export async function renderPagos(contenido) {
  const niveles = await listar(TABLAS.niveles, { orden: { columna: 'orden', asc: true } });

  let anio = anioActual();
  let filtroNivel = '';
  let filtroEstado = '';

  contenido.innerHTML = `
    <div class="pagina">
      <div class="pagina__cabecera">
        <div>
          <p class="antetitulo">Cobranza</p>
          <h1 class="pagina__titulo">Mensualidades</h1>
          <p class="pagina__sub">Registro de pagos por alumno y mes. Haz clic en una celda para registrar o corregir el cobro.</p>
        </div>
        <div class="pagina__acciones">
          <button class="btn btn--borde" type="button" id="btn-exportar-csv">${ICONO.descargar} CSV</button>
          <button class="btn btn--borde" type="button" id="btn-exportar-pdf">${ICONO.descargar} PDF</button>
        </div>
      </div>

      <section class="kpis" id="pagos-kpis"></section>

      <section class="tarjeta">
        <div class="tarjeta__cabecera">
          <div class="filtros crece">
            <select class="select" id="filtro-anio" aria-label="Año">
              ${[anioActual(), anioActual() - 1, anioActual() + 1]
                .map((a) => `<option value="${a}" ${a === anio ? 'selected' : ''}>${a}</option>`)
                .join('')}
            </select>
            <select class="select" id="filtro-nivel" aria-label="Nivel">
              <option value="">Todos los niveles</option>
              ${niveles.map((n) => `<option value="${n.id}">${escapeHTML(n.nombre)}</option>`).join('')}
            </select>
            <select class="select" id="filtro-estado" aria-label="Estado de pago">
              <option value="">Todos los estados</option>
              <option value="pagada">Pagadas</option>
              <option value="pendiente">Pendientes</option>
              <option value="becado">Becados</option>
            </select>
          </div>
          <span class="pequeno tenue nowrap" id="conteo-pagos"></span>
        </div>
        <div class="tarjeta__cuerpo tarjeta__cuerpo--liso" id="tabla-pagos">
          <div class="cargando"><span class="cargando__giro"></span></div>
        </div>
      </section>
    </div>`;

  const selAnio = contenido.querySelector('#filtro-anio');
  const selNivel = contenido.querySelector('#filtro-nivel');
  const selEstado = contenido.querySelector('#filtro-estado');
  const tabla = contenido.querySelector('#tabla-pagos');
  const kpis = contenido.querySelector('#pagos-kpis');
  const conteo = contenido.querySelector('#conteo-pagos');

  let datosActuales = [];

  const pintar = async () => {
    anio = Number(selAnio.value);
    filtroNivel = selNivel.value;
    filtroEstado = selEstado.value;

    const [alumnos, totales, meses] = await Promise.all([
      listarAlumnos({ estado: 'activo', nivelId: filtroNivel || null }),
      totalesPeriodo(anio, mesActual()),
      ingresosPorMes(anio),
    ]);

    const matriz = await matrizPagos(alumnos, { anio });

    const filtrada = matriz.filter((fila) => {
      if (!filtroEstado) return true;
      return fila.meses.some((m) => m.estado === filtroEstado);
    });

    datosActuales = filtrada;
    conteo.textContent = `${filtrada.length} alumno(s)`;

    kpis.innerHTML = `
      <article class="kpi kpi--exito">
        <span class="kpi__etiqueta">Recaudado del mes</span>
        <strong class="kpi__valor">${dinero(totales.recaudado)}</strong>
        <span class="kpi__nota"><b>${totales.pagados}</b> de ${totales.total} cobrado(s)</span>
      </article>
      <article class="kpi kpi--aviso">
        <span class="kpi__etiqueta">Pendiente</span>
        <strong class="kpi__valor">${dinero(totales.pendiente)}</strong>
        <span class="kpi__nota"><b>${totales.morosos}</b> con adeudo</span>
      </article>
      <article class="kpi kpi--oro">
        <span class="kpi__etiqueta">Avance del mes</span>
        <strong class="kpi__valor">${totales.porcentaje}%</strong>
        <span class="kpi__nota">esperado ${dinero(totales.esperado)}</span>
      </article>
      <article class="kpi kpi--neutro">
        <span class="kpi__etiqueta">Acumulado ${anio}</span>
        <strong class="kpi__valor">${dinero(meses.reduce((s, m) => s + m.recaudado, 0))}</strong>
        <span class="kpi__nota">12 meses</span>
      </article>`;

    if (!filtrada.length) {
      tabla.innerHTML = `
        <div class="vacio" style="border:0">
          <h3 class="vacio__titulo">Sin alumnos que mostrar</h3>
          <p class="vacio__texto">No hay matrícula activa con los filtros seleccionados.</p>
        </div>`;
      return;
    }

    const celda = (fila, mes) => {
      const estadoCelda = fila.meses[mes - 1].estado;
      if (!estadoCelda) return '<td class="tabla__num tenue">·</td>';
      const pago = fila.meses[mes - 1].pago;
      const titulo = pago
        ? `${estadoCelda} · ${dinero(pago.monto)}${pago.fecha_pago ? ` · ${pago.fecha_pago}` : ''}`
        : estadoCelda;
      return `<td class="tabla__num"><button class="celda-pago" type="button" data-alumno="${fila.alumno.id}" data-mes="${mes}" title="${escapeHTML(titulo)}">${
        ESTADO_PILLS[estadoCelda] ?? '<span class="pastilla pastilla--neutro">·</span>'
      }</button></td>`;
    };

    tabla.innerHTML = `
      <div class="tabla-envoltura">
        <table class="tabla tabla--compacta">
          <thead>
            <tr>
              <th style="min-width:220px">Alumno</th>
              ${Array.from({ length: 12 }, (_, i) => `<th class="tabla__num">${nombreMesCorto(i + 1)}</th>`).join('')}
              <th class="tabla__num">Cobrado</th>
              <th class="tabla__num">Saldo</th>
            </tr>
          </thead>
          <tbody>
            ${filtrada
              .map(
                (fila) => `
              <tr>
                <td>
                  <div class="celda-principal">
                    <span class="celda-principal__titulo">${escapeHTML([fila.alumno.nombre, fila.alumno.apellidos].filter(Boolean).join(' '))}</span>
                    <span class="celda-principal__meta">${escapeHTML(fila.alumno.codigo)} · ${escapeHTML(fila.alumno.nivel?.nombre ?? '')}</span>
                  </div>
                </td>
                ${Array.from({ length: 12 }, (_, i) => celda(fila, i + 1)).join('')}
                <td class="tabla__num mono">${dinero(
                  fila.meses
                    .filter((m) => m.pago?.estado === 'pagada')
                    .reduce((s, m) => s + Number(m.pago.monto ?? 0), 0),
                )}</td>
                <td class="tabla__num mono">${dinero(
                  fila.meses
                    .filter((m) => m.pago?.estado === 'pendiente')
                    .reduce((s, m) => s + Number(m.pago.monto ?? 0), 0),
                )}</td>
              </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>
      <div class="tarjeta__pie fila--separada">
        <span class="pequeno tenue">P = pagada · • = pendiente · B = becado · C = condonado</span>
        <span class="pequeno tenue">Clic en una celda para registrar el pago</span>
      </div>`;

    tabla.querySelectorAll('.celda-pago').forEach((boton) => {
      boton.addEventListener('click', () => {
        const alumno = filtrada
          .flatMap((f) => f.meses.map((m) => ({ alumno: f.alumno, mes: m })))
          .find((x) => x.alumno.id === boton.dataset.alumno && x.mes.mes === Number(boton.dataset.mes));
        if (!alumno) return;
        abrirFormularioPago(alumno.alumno, pintar, alumno.mes.pago);
      });
    });
  };

  selAnio.addEventListener('change', pintar);
  selNivel.addEventListener('change', pintar);
  selEstado.addEventListener('change', pintar);

  contenido.querySelector('#btn-exportar-csv').addEventListener('click', () => {
    const filas = [];
    for (const fila of datosActuales) {
      for (const mes of fila.meses) {
        if (!mes.pago) continue;
        filas.push({
          Matrícula: fila.alumno.codigo,
          Alumno: [fila.alumno.nombre, fila.alumno.apellidos].filter(Boolean).join(' '),
          Nivel: fila.alumno.nivel?.nombre ?? '',
          Mes: nombreMesCorto(mes.mes),
          Año: anio,
          Concepto: etiquetaConcepto(mes.pago.concepto),
          Monto: mes.pago.monto,
          Estado: mes.pago.estado,
          'Fecha de pago': mes.pago.fecha_pago ?? '',
          Método: mes.pago.metodo ?? '',
          Referencia: mes.pago.referencia ?? '',
        });
      }
    }
    if (!filas.length) {
      aviso('No hay pagos para exportar', 'info');
      return;
    }
    exportarCSV(filas, `mensualidades-${anio}.csv`);
    aviso('Archivo CSV generado', 'exito');
  });

  contenido.querySelector('#btn-exportar-pdf').addEventListener('click', () => {
    const filas = [];
    for (const fila of datosActuales) {
      for (const mes of fila.meses) {
        if (!mes.pago) continue;
        filas.push([
          [fila.alumno.nombre, fila.alumno.apellidos].filter(Boolean).join(' '),
          fila.alumno.codigo,
          nombreMesCorto(mes.mes),
          dinero(mes.pago.monto),
          mes.pago.estado,
          mes.pago.fecha_pago ?? '—',
        ]);
      }
    }
    if (!filas.length) {
      aviso('No hay pagos para exportar', 'info');
      return;
    }
    exportarPDF({
      titulo: 'Mensualidades',
      subtitulo: `Ciclo ${estado.config?.ciclo_activo || anio} · generado el ${new Date().toLocaleDateString('es-MX')}`,
      columnas: ['Alumno', 'Matrícula', 'Mes', 'Monto', 'Estado', 'Fecha de pago'],
      filas,
      nombre: `mensualidades-${anio}.pdf`,
      orientacion: 'landscape',
    });
  });

  await pintar();
}
