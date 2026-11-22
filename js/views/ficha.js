// views/ficha.js — expediente del alumno: datos, documentos, pagos, calificaciones.

import { ROL, TABLAS, TIPOS_DOCUMENTO, TIPOS_ARCHIVO, METODOS_PAGO, CONCEPTOS } from '../config.js';
import { estado } from '../state.js';
import { obtenerAlumno, registrarBaja, reingresarAlumno } from '../services/alumnos.js';
import { listar } from '../services/db.js';
import { documentosDeAlumno, subirDocumento, enlaceDocumento, borrarDocumento, tamanoLegible, etiquetaTipoArchivo } from '../services/documentos.js';
import { pagosDeAlumno, registrarPago, etiquetaMetodo, etiquetaConcepto } from '../services/pagos.js';
import { calificacionesDeAlumno, resumenAcademico, etiquetaPeriodo } from '../services/calificaciones.js';
import { constanciasDeAlumno } from '../services/constancias.js';
import { listar as listarTabla } from '../services/db.js';
import { escapeHTML, aviso, confirmar, abrirModal, ICONO } from '../utils/ui.js';
import { dinero, fechaLarga, formatoFecha, hoyISO, mesActual, anioActual, nombreMes, promedio } from '../utils/dates.js';
import { abrirFormularioAlumno } from './alumnos.js';

export async function renderFicha(contenido, { alumnoId, rol }) {
  const esAdmin = rol === ROL.ADMIN;

  const alumno = await obtenerAlumno(alumnoId);
  if (!alumno) {
    contenido.innerHTML = `
      <div class="vacio">
        <h2 class="vacio__titulo">Alumno no encontrado</h2>
        <p class="vacio__texto">El expediente que buscas ya no existe.</p>
        <a class="btn btn--borde" href="#/alumnos">Volver al listado</a>
      </div>`;
    return;
  }

  const [niveles, grupos] = await Promise.all([
    listarTabla(TABLAS.niveles, { orden: { columna: 'orden', asc: true } }),
    listarTabla(TABLAS.grupos, { orden: { columna: 'nombre', asc: true } }),
  ]);

  const nombre = [alumno.nombre, alumno.apellidos].filter(Boolean).join(' ');

  contenido.innerHTML = `
    <div class="pagina">
      <div class="pagina__cabecera">
        <div>
          <p class="antetitulo"><a href="#/alumnos">Alumnos</a> / Expediente</p>
          <h1 class="pagina__titulo">${escapeHTML(nombre)}</h1>
          <p class="pagina__sub">
            <span class="mono">${escapeHTML(alumno.codigo)}</span>
            ${alumno.curp ? ` · <span class="mono">${escapeHTML(alumno.curp)}</span>` : ''}
            · ${escapeHTML(alumno.nivel?.nombre ?? 'Sin nivel')}
            ${alumno.grupo ? ` · ${escapeHTML(alumno.grupo.nombre)}` : ''}
            · Ciclo ${escapeHTML(alumno.ciclo || '—')}
          </p>
        </div>
        <div class="pagina__acciones">
          <a class="btn btn--borde" href="#/alumnos">Volver</a>
          ${esAdmin ? `<button class="btn btn--borde" type="button" id="btn-editar">${ICONO.editar} Editar</button>` : ''}
          ${esAdmin ? `<button class="btn btn--primario" type="button" id="btn-pago">${ICONO.pagos} Registrar pago</button>` : ''}
        </div>
      </div>

      <section class="kpis" id="ficha-kpis"></section>

      <section class="tarjeta">
        <div class="tarjeta__cuerpo tarjeta__cuerpo--liso">
          <nav class="pestanas" style="padding:0 20px" role="tablist">
            <button class="pestana is-activa" type="button" data-panel="datos" role="tab">Datos</button>
            <button class="pestana" type="button" data-panel="documentos" role="tab">Documentos</button>
            <button class="pestana" type="button" data-panel="pagos" role="tab">Pagos</button>
            <button class="pestana" type="button" data-panel="calificaciones" role="tab">Calificaciones</button>
            <button class="pestana" type="button" data-panel="expediente" role="tab">Documentos oficiales</button>
          </nav>
          <div id="panel-contenido"></div>
        </div>
      </section>
    </div>`;

  const panel = contenido.querySelector('#panel-contenido');
  const kpis = contenido.querySelector('#ficha-kpis');

  const pintarKpis = async () => {
    const [pagos, calificaciones, documentos] = await Promise.all([
      pagosDeAlumno(alumno.id),
      calificacionesDeAlumno(alumno.id),
      documentosDeAlumno(alumno.id),
    ]);

    const pagado = pagos
      .filter((p) => p.estado === 'pagada')
      .reduce((s, p) => s + Number(p.monto ?? 0), 0);
    const pendiente = pagos
      .filter((p) => p.estado === 'pendiente')
      .reduce((s, p) => s + Number(p.monto ?? 0), 0);
    const resumen = resumenAcademico(calificaciones, estado.config?.escala_minima ?? 6);

    kpis.innerHTML = `
      <article class="kpi kpi--exito">
        <span class="kpi__etiqueta">Pagado</span>
        <strong class="kpi__valor">${dinero(pagado)}</strong>
        <span class="kpi__nota">${pagos.filter((p) => p.estado === 'pagada').length} mensualidad(es)</span>
      </article>
      <article class="kpi kpi--${pendiente > 0 ? 'aviso' : 'neutro'}">
        <span class="kpi__etiqueta">Adeudo</span>
        <strong class="kpi__valor">${dinero(pendiente)}</strong>
        <span class="kpi__nota">${pagos.filter((p) => p.estado === 'pendiente').length} pendiente(s)</span>
      </article>
      <article class="kpi kpi--oro">
        <span class="kpi__etiqueta">Promedio general</span>
        <strong class="kpi__valor">${resumen.promedioGeneral ?? '—'}</strong>
        <span class="kpi__nota">${resumen.totalMaterias} materia(s) · ${resumen.aprobado === null ? 'sin evaluations' : resumen.aprobado ? 'aprobado' : 'en riesgo'}</span>
      </article>
      <article class="kpi kpi--neutro">
        <span class="kpi__etiqueta">Documentación</span>
        <strong class="kpi__valor">${documentos.length}</strong>
        <span class="kpi__nota">archivo(s) PDF</span>
      </article>`;
  };

  const paneles = {
    datos: () => panelDatos(alumno, esAdmin),
    documentos: () => panelDocumentos(alumno, esAdmin),
    pagos: () => panelPagos(alumno, esAdmin),
    calificaciones: () => panelCalificaciones(alumno),
    expediente: () => panelExpediente(alumno, esAdmin),
  };

  const mostrar = async (nombre) => {
    panel.innerHTML = '<div class="cargando"><span class="cargando__giro"></span></div>';
    panel.innerHTML = await paneles[nombre]();
    if (nombre === 'datos') conectarDatos(alumno, esAdmin, contenido);
    if (nombre === 'documentos') conectarDocumentos(alumno, esAdmin);
    if (nombre === 'pagos') conectarPagos(alumno, esAdmin);
    if (nombre === 'expediente') conectarExpediente(alumno);
  };

  contenido.querySelectorAll('[data-panel]').forEach((boton) => {
    boton.addEventListener('click', () => {
      contenido.querySelectorAll('[data-panel]').forEach((b) => b.classList.remove('is-activa'));
      boton.classList.add('is-activa');
      mostrar(boton.dataset.panel);
    });
  });

  contenido.querySelector('#btn-editar')?.addEventListener('click', () => {
    abrirFormularioAlumno({
      niveles,
      grupos,
      alumno,
      alGuardar: async () => {
        aviso('Datos actualizados', 'exito');
        window.location.reload();
      },
    });
  });

  contenido.querySelector('#btn-pago')?.addEventListener('click', () => {
    abrirFormularioPago(alumno, async () => {
      await pintarKpis();
      await mostrar('pagos');
    });
  });

  await pintarKpis();
  await mostrar('datos');
}

// ------------------------------------------------------------------ datos --
function panelDatos(alumno, esAdmin) {
  return `
    <div style="padding:24px">
      <div class="rejilla rejilla--3">
        <div>
          <h3 class="seccion__titulo mb-3">Identificación</h3>
          <div class="datos">
            <span class="datos__clave">Nombre</span><span class="datos__valor">${escapeHTML([alumno.nombre, alumno.apellidos].filter(Boolean).join(' '))}</span>
            <span class="datos__clave">Matrícula</span><span class="datos__valor mono">${escapeHTML(alumno.codigo)}</span>
            <span class="datos__clave">CURP</span><span class="datos__valor mono">${escapeHTML(alumno.curp || '—')}</span>
            <span class="datos__clave">Fecha de nacimiento</span><span class="datos__valor">${escapeHTML(alumno.fecha_nacimiento ? fechaLarga(alumno.fecha_nacimiento) : '—')}</span>
          </div>
        </div>
        <div>
          <h3 class="seccion__titulo mb-3">Académico</h3>
          <div class="datos">
            <span class="datos__clave">Nivel</span><span class="datos__valor">${escapeHTML(alumno.nivel?.nombre ?? '—')}</span>
            <span class="datos__clave">Grupo</span><span class="datos__valor">${escapeHTML(alumno.grupo?.nombre ?? '—')}</span>
            <span class="datos__clave">Ciclo</span><span class="datos__valor mono">${escapeHTML(alumno.ciclo || '—')}</span>
            <span class="datos__clave">Inscripción</span><span class="datos__valor">${escapeHTML(fechaLarga(alumno.fecha_inscripcion))}</span>
            <span class="datos__clave">Mensualidad</span><span class="datos__valor">${dinero(alumno.nivel?.mensualidad ?? 0)}</span>
          </div>
        </div>
        <div>
          <h3 class="seccion__titulo mb-3">Contacto</h3>
          <div class="datos">
            <span class="datos__clave">Correo</span><span class="datos__valor">${escapeHTML(alumno.email || '—')}</span>
            <span class="datos__clave">Teléfono</span><span class="datos__valor">${escapeHTML(alumno.telefono || '—')}</span>
            <span class="datos__clave">Domicilio</span><span class="datos__valor">${escapeHTML(alumno.direccion || '—')}</span>
            <span class="datos__clave">Tutor</span><span class="datos__valor">${escapeHTML(alumno.tutor_nombre || '—')}</span>
            <span class="datos__clave">Tel. tutor</span><span class="datos__valor">${escapeHTML(alumno.tutor_telefono || '—')}</span>
          </div>
        </div>
      </div>

      ${alumno.observaciones ? `<div class="mt-5"><h3 class="seccion__titulo mb-3">Observaciones</h3><p class="pequeno">${escapeHTML(alumno.observaciones)}</p></div>` : ''}

      ${
        esAdmin
          ? `<hr class="separador" />
             <div class="fila">
               ${
                 alumno.estado === 'baja'
                   ? '<button class="btn btn--borde" type="button" id="btn-reingresar">Reingresar alumno</button>'
                   : '<button class="btn btn--peligro" type="button" id="btn-baja">Registrar baja</button>'
               }
             </div>`
          : ''
      }
    </div>`;
}

// ------------------------------------------------------------- documentos --
function panelDocumentos(alumno, esAdmin) {
  return `
    <div style="padding:24px">
      <div class="fila--separada mb-4">
        <div>
          <h3 class="seccion__titulo">Documentación del alumno</h3>
          <p class="pequeno tenue">Archivos PDF almacenados de forma segura.</p>
        </div>
        <div>
          <label class="btn btn--primario" for="input-doc-alumno" role="button">
            ${ICONO.agregar} Subir PDF
          </label>
          <input type="file" id="input-doc-alumno" accept="application/pdf,.pdf" hidden />
        </div>
      </div>
      <div id="lista-documentos">
        <div class="cargando"><span class="cargando__giro"></span></div>
      </div>
    </div>`;
}

async function conectarDocumentos(alumno, esAdmin) {
  const lista = document.querySelector('#lista-documentos');
  if (!lista) return;

  const pintar = async () => {
    const documentos = await documentosDeAlumno(alumno.id);
    if (!documentos.length) {
      lista.innerHTML = `
        <div class="vacio" style="border:0">
          <h3 class="vacio__titulo">Sin documentos</h3>
          <p class="vacio__texto">Sube la identificación, el acta de nacimiento o cualquier documento que respalde el expediente.</p>
        </div>`;
      return;
    }

    lista.innerHTML = `
      <div class="tabla-envoltura">
        <table class="tabla">
          <thead><tr><th>Documento</th><th>Tipo</th><th>Tamaño</th><th>Subido</th><th class="tabla__acciones"></th></tr></thead>
          <tbody>
            ${documentos
              .map(
                (doc) => `
              <tr>
                <td>
                  <div class="celda-principal">
                    <span class="celda-principal__titulo">${escapeHTML(doc.nombre_archivo)}</span>
                    ${doc.nota ? `<span class="celda-principal__meta">${escapeHTML(doc.nota)}</span>` : ''}
                  </div>
                </td>
                <td class="pequeno">${escapeHTML(etiquetaTipoArchivo(doc.tipo))}</td>
                <td class="pequeno mono">${escapeHTML(tamanoLegible(doc.tamano))}</td>
                <td class="pequeno tenue">${escapeHTML(formatoFecha(doc.creado_en))}</td>
                <td class="tabla__acciones">
                  <button class="btn btn--sm btn--borde" type="button" data-descargar="${doc.id}">Ver</button>
                  ${esAdmin ? `<button class="btn btn--sm btn--fantasma" type="button" data-borrar="${doc.id}" aria-label="Eliminar documento">${ICONO.borrar}</button>` : ''}
                </td>
              </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>`;

    lista.querySelectorAll('[data-descargar]').forEach((boton) => {
      boton.addEventListener('click', async () => {
        const documento = documentos.find((d) => d.id === boton.dataset.descargar);
        try {
          const url = await enlaceDocumento(documento.path);
          window.open(url, '_blank', 'noopener');
        } catch (error) {
          aviso(error.message, 'error');
        }
      });
    });

    lista.querySelectorAll('[data-borrar]').forEach((boton) => {
      boton.addEventListener('click', async () => {
        const documento = documentos.find((d) => d.id === boton.dataset.borrar);
        const ok = await confirmar({
          titulo: 'Eliminar documento',
          mensaje: `Se eliminará “${documento.nombre_archivo}” de forma permanente.`,
          textoOk: 'Eliminar',
          peligro: true,
        });
        if (!ok) return;
        await borrarDocumento(documento);
        aviso('Documento eliminado', 'exito');
        await pintar();
      });
    });
  };

  await pintar();

  const input = document.querySelector('#input-doc-alumno');
  input?.addEventListener('change', async () => {
    const archivo = input.files?.[0];
    if (!archivo) return;
    try {
      await subirDocumento(alumno.id, archivo, 'otro', estado.perfil?.id ?? null);
      aviso('Documento subido', 'exito');
      input.value = '';
      await pintar();
    } catch (error) {
      aviso(error.message, 'error');
      input.value = '';
    }
  });
}

// ------------------------------------------------------------ baja / alta --
async function conectarDatos(alumno, esAdmin, contenido) {
  if (!esAdmin) return;

  contenido.querySelector('#btn-baja')?.addEventListener('click', async () => {
    const ok = await confirmar({
      titulo: 'Registrar baja',
      mensaje:
        'El alumno dejará de contar como activo y su mensualidad pendiente se conservará en la cartera.',
      textoOk: 'Continuar',
    });
    if (!ok) return;

    const { abrirModal } = await import('../utils/ui.js');
    const modal = abrirModal({
      titulo: 'Baja del alumno',
      subtitulo: [alumno.nombre, alumno.apellidos].filter(Boolean).join(' '),
      cuerpo: `
        <form class="form" id="form-baja" novalidate>
          <div class="rejilla">
            <div class="campo">
              <label class="etiqueta" for="bj-fecha">Fecha de baja</label>
              <input class="input" type="date" id="bj-fecha" name="fecha_baja" value="${hoyISO()}" required />
            </div>
            <div class="campo">
              <label class="etiqueta" for="bj-tipo">Tipo de baja</label>
              <select class="select" id="bj-tipo" name="tipo">
                <option value="voluntaria">Voluntaria</option>
                <option value="academica">Académica</option>
                <option value="economica">Económica</option>
                <option value="administrativa">Administrativa</option>
                <option value="otra">Otra</option>
              </select>
            </div>
          </div>
          <div class="campo">
            <label class="etiqueta" for="bj-adeudo">Adeudo final</label>
            <input class="input" type="number" step="0.01" min="0" id="bj-adeudo" name="adeudo_final" value="0" />
          </div>
          <div class="campo">
            <label class="etiqueta" for="bj-motivo">Motivo</label>
            <textarea class="textarea" id="bj-motivo" name="motivo" required></textarea>
          </div>
          <p class="alerta alerta--error" id="bj-error" hidden></p>
        </form>`,
      pie: `
        <button class="btn btn--borde" type="button" data-cerrar>Cancelar</button>
        <button class="btn btn--peligro" type="submit" form="form-baja">Registrar baja</button>`,
    });

    modal.panel.querySelector('[data-cerrar]').addEventListener('click', () => modal.close());

    const form = modal.panel.querySelector('#form-baja');
    const error = modal.panel.querySelector('#bj-error');

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      error.setAttribute('hidden', '');
      const datos = Object.fromEntries(new FormData(form).entries());

      if (!datos.motivo?.trim()) {
        error.textContent = 'Escribe el motivo de la baja.';
        error.removeAttribute('hidden');
        return;
      }

      try {
        await registrarBaja(alumno.id, datos, estado.perfil?.id ?? null);
        aviso('Baja registrada', 'exito');
        modal.close();
        window.location.reload();
      } catch (errorBaja) {
        error.textContent = errorBaja.message || 'No se pudo registrar la baja.';
        error.removeAttribute('hidden');
      }
    });
  });

  contenido.querySelector('#btn-reingresar')?.addEventListener('click', async () => {
    const ok = await confirmar({
      titulo: 'Reingresar alumno',
      mensaje: 'El alumno volverá a estar activo en la plataforma.',
      textoOk: 'Reingresar',
    });
    if (!ok) return;
    await reingresarAlumno(alumno.id);
    aviso('Alumno reactivado', 'exito');
    window.location.reload();
  });
}

// ------------------------------------------------------------------ pagos --
function panelPagos(alumno, esAdmin) {
  return `
    <div style="padding:24px">
      <div class="fila--separada mb-4">
        <div>
          <h3 class="seccion__titulo">Historial de pagos</h3>
          <p class="pequeno tenue">Mensualidades registradas del ciclo actual.</p>
        </div>
        ${esAdmin ? `<button class="btn btn--primario" type="button" id="btn-agregar-pago">${ICONO.agregar} Registrar pago</button>` : ''}
      </div>
      <div id="lista-pagos"><div class="cargando"><span class="cargando__giro"></span></div></div>
    </div>`;
}

async function conectarPagos(alumno, esAdmin) {
  const lista = document.querySelector('#lista-pagos');
  if (!lista) return;

  const pintar = async () => {
    const pagos = await pagosDeAlumno(alumno.id);
    if (!pagos.length) {
      lista.innerHTML = `
        <div class="vacio" style="border:0">
          <h3 class="vacio__titulo">Sin pagos registrados</h3>
          <p class="vacio__texto">Registra la primera mensualidad para iniciar el historial del alumno.</p>
        </div>`;
      return;
    }

    const porEstado = {
      pagada: '<span class="pastilla pastilla--exito">Pagada</span>',
      pendiente: '<span class="pastilla pastilla--aviso">Pendiente</span>',
      becado: '<span class="pastilla pastilla--info">Becado</span>',
      condonado: '<span class="pastilla pastilla--neutro">Condonado</span>',
    };

    lista.innerHTML = `
      <div class="tabla-envoltura">
        <table class="tabla">
          <thead><tr><th>Periodo</th><th>Concepto</th><th class="tabla__num">Monto</th><th>Estado</th><th>Fecha</th><th>Método</th><th class="tabla__acciones"></th></tr></thead>
          <tbody>
            ${pagos
              .map(
                (p) => `
              <tr>
                <td class="mono pequeno">${escapeHTML(nombreMes(p.mes))} ${p.anio}</td>
                <td class="pequeno">${escapeHTML(etiquetaConcepto(p.concepto))}</td>
                <td class="tabla__num mono">${dinero(p.monto)}</td>
                <td>${porEstado[p.estado] ?? p.estado}</td>
                <td class="pequeno">${escapeHTML(p.fecha_pago ? formatoFecha(p.fecha_pago) : '—')}</td>
                <td class="pequeno">${escapeHTML(etiquetaMetodo(p.metodo))}</td>
                <td class="tabla__acciones">
                  ${p.folio ? `<span class="folio">${escapeHTML(p.folio)}</span>` : ''}
                  ${esAdmin ? `<button class="btn btn--sm btn--fantasma" type="button" data-editar-pago="${p.id}" aria-label="Editar pago">${ICONO.editar}</button>` : ''}
                </td>
              </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>`;

    lista.querySelectorAll('[data-editar-pago]').forEach((boton) => {
      boton.addEventListener('click', () => {
        const pago = pagos.find((p) => p.id === boton.dataset.editarPago);
        abrirFormularioPago(alumno, pintar, pago);
      });
    });
  };

  await pintar();

  document.querySelector('#btn-agregar-pago')?.addEventListener('click', () => {
    abrirFormularioPago(alumno, pintar);
  });
}

/**
 * Formulario de registro de pago (alta o edición).
 */
export function abrirFormularioPago(alumno, alGuardar, pago = null) {
  const nivel = alumno.nivel ?? {};
  const mesSugerido = pago?.mes ?? mesActual();

  const modal = abrirModal({
    titulo: pago ? 'Editar pago' : 'Registrar pago',
    subtitulo: [alumno.nombre, alumno.apellidos].filter(Boolean).join(' '),
    cuerpo: `
      <form class="form" id="form-pago" novalidate>
        <div class="rejilla">
          <div class="campo">
            <label class="etiqueta" for="pg-mes">Mes</label>
            <select class="select" id="pg-mes" name="mes">
              ${Array.from({ length: 12 }, (_, i) => i + 1)
                .map((m) => `<option value="${m}" ${mesSugerido === m ? 'selected' : ''}>${nombreMes(m)}</option>`)
                .join('')}
            </select>
          </div>
          <div class="campo">
            <label class="etiqueta" for="pg-anio">Año</label>
            <input class="input" type="number" id="pg-anio" name="anio" value="${pago?.anio ?? anioActual()}" min="2000" max="2100" />
          </div>
        </div>

        <div class="rejilla">
          <div class="campo">
            <label class="etiqueta" for="pg-concepto">Concepto</label>
            <select class="select" id="pg-concepto" name="concepto">
              ${CONCEPTOS.map(
                (c) => `<option value="${c.valor}" ${pago?.concepto === c.valor ? 'selected' : ''}>${c.etiqueta}</option>`,
              ).join('')}
            </select>
          </div>
          <div class="campo">
            <label class="etiqueta" for="pg-monto">Monto</label>
            <input class="input" type="number" step="0.01" min="0" id="pg-monto" name="monto" value="${pago?.monto ?? nivel.mensualidad ?? 0}" required />
          </div>
        </div>

        <div class="rejilla">
          <div class="campo">
            <label class="etiqueta" for="pg-estado">Estado</label>
            <select class="select" id="pg-estado" name="estado">
              <option value="pagada" ${pago?.estado === 'pagada' || !pago ? 'selected' : ''}>Pagada</option>
              <option value="pendiente" ${pago?.estado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
              <option value="becado" ${pago?.estado === 'becado' ? 'selected' : ''}>Becado</option>
              <option value="condonado" ${pago?.estado === 'condonado' ? 'selected' : ''}>Condonado</option>
            </select>
          </div>
          <div class="campo">
            <label class="etiqueta" for="pg-fecha">Fecha de pago</label>
            <input class="input" type="date" id="pg-fecha" name="fecha_pago" value="${pago?.fecha_pago ?? hoyISO()}" />
          </div>
        </div>

        <div class="rejilla">
          <div class="campo">
            <label class="etiqueta" for="pg-metodo">Método</label>
            <select class="select" id="pg-metodo" name="metodo">
              ${METODOS_PAGO.map(
                (m) => `<option value="${m.valor}" ${pago?.metodo === m.valor ? 'selected' : ''}>${m.etiqueta}</option>`,
              ).join('')}
            </select>
          </div>
          <div class="campo">
            <label class="etiqueta" for="pg-referencia">Referencia</label>
            <input class="input input--mono" id="pg-referencia" name="referencia" value="${escapeHTML(pago?.referencia ?? '')}" placeholder="Folio o nota de la transferencia" />
          </div>
        </div>

        <div class="campo">
          <label class="etiqueta" for="pg-nota">Nota</label>
          <input class="input" id="pg-nota" name="nota" value="${escapeHTML(pago?.nota ?? '')}" />
        </div>

        <p class="alerta alerta--error" id="pg-error" hidden></p>
      </form>`,
    pie: `
      <button class="btn btn--borde" type="button" data-cerrar>Cancelar</button>
      <button class="btn btn--primario" type="submit" form="form-pago">${pago ? 'Guardar cambios' : 'Registrar pago'}</button>`,
  });

  modal.panel.querySelector('[data-cerrar]').addEventListener('click', () => modal.close());

  const form = modal.panel.querySelector('#form-pago');
  const error = modal.panel.querySelector('#pg-error');

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    error.setAttribute('hidden', '');

    const datos = Object.fromEntries(new FormData(form).entries());
    const monto = Number(datos.monto);

    if (!Number.isFinite(monto) || monto < 0) {
      error.textContent = 'El monto debe ser un número válido.';
      error.removeAttribute('hidden');
      return;
    }
    if (datos.estado === 'pagada' && !datos.fecha_pago) {
      error.textContent = 'Indica la fecha del pago.';
      error.removeAttribute('hidden');
      return;
    }

    try {
      await registrarPago({
        alumno_id: alumno.id,
        anio: Number(datos.anio),
        mes: Number(datos.mes),
        ciclo: alumno.ciclo || estado.config?.ciclo_activo || '',
        concepto: datos.concepto,
        monto,
        estado: datos.estado,
        fecha_pago: datos.estado === 'pagada' ? datos.fecha_pago : null,
        metodo: datos.estado === 'pagada' ? datos.metodo : null,
        referencia: datos.referencia,
        nota: datos.nota,
        registrado_por: estado.perfil?.id ?? null,
      });
      aviso(pago ? 'Pago actualizado' : 'Pago registrado', 'exito');
      modal.close();
      if (alGuardar) alGuardar();
    } catch (errorPago) {
      error.textContent = errorPago.message || 'No se pudo registrar el pago.';
      error.removeAttribute('hidden');
    }
  });
}

// --------------------------------------------------------- calificaciones --
async function panelCalificaciones(alumno) {
  const calificaciones = await calificacionesDeAlumno(alumno.id);
  const resumen = resumenAcademico(calificaciones, estado.config?.escala_minima ?? 6);

  if (!calificaciones.length) {
    return `
      <div style="padding:24px">
        <div class="vacio" style="border:0">
          <h3 class="vacio__titulo">Sin calificaciones</h3>
          <p class="vacio__texto">La maestra puede capturar los parciales en la sección Calificaciones.</p>
          <a class="btn btn--borde mt-4" href="#/calificaciones">Ir a calificaciones</a>
        </div>
      </div>`;
  }

  return `
    <div style="padding:24px">
      <div class="fila--separada mb-4">
        <div>
          <h3 class="seccion__titulo">Rendimiento académico</h3>
          <p class="pequeno tenue">Escala de 0 a 10 · mínima aprobatoria ${estado.config?.escala_minima ?? 6}</p>
        </div>
        <span class="folio">Promedio ${resumen.promedioGeneral ?? '—'}</span>
      </div>
      <div class="tabla-envoltura">
        <table class="tabla">
          <thead>
            <tr><th>Materia</th><th>Parcial 1</th><th>Parcial 2</th><th>Parcial 3</th><th>Final</th><th>Estado</th></tr>
          </thead>
          <tbody>
            ${resumen.filas
              .map(
                (fila) => `
              <tr>
                <td class="celda-principal__titulo">${escapeHTML(fila.materia)}</td>
                <td class="mono pequeno">${fila.notas.parcial_1 ?? '—'}</td>
                <td class="mono pequeno">${fila.notas.parcial_2 ?? '—'}</td>
                <td class="mono pequeno">${fila.notas.parcial_3 ?? '—'}</td>
                <td class="mono pequeno">${fila.final ?? '—'}</td>
                <td>${
                  fila.aprobado === null
                    ? '<span class="pastilla pastilla--neutro">Sin nota</span>'
                    : fila.aprobado
                      ? '<span class="pastilla pastilla--exito">Aprobado</span>'
                      : '<span class="pastilla pastilla--error">Reprobado</span>'
                }</td>
              </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

// -------------------------------------------------------------- expediente --
async function panelExpediente(alumno, esAdmin) {
  const constancias = await constanciasDeAlumno(alumno.id);

  return `
    <div style="padding:24px">
      <div class="fila--separada mb-4">
        <div>
          <h3 class="seccion__titulo">Documentos oficiales emitidos</h3>
          <p class="pequeno tenue">Constancias, boletas y comprobantes con folio institucional.</p>
        </div>
        ${esAdmin ? `<button class="btn btn--primario" type="button" id="btn-emitir">${ICONO.sello} Emitir documento</button>` : ''}
      </div>
      <div id="lista-expediente">
        ${
          constancias.length
            ? `<div class="tabla-envoltura"><table class="tabla">
                <thead><tr><th>Folio</th><th>Tipo</th><th>Emitido</th><th class="tabla__acciones"></th></tr></thead>
                <tbody>
                  ${constancias
                    .map(
                      (c) => `
                    <tr>
                      <td><span class="folio">${escapeHTML(c.folio)}</span></td>
                      <td class="pequeno">${escapeHTML(TIPOS_DOCUMENTO[c.tipo] ?? c.tipo)}</td>
                      <td class="pequeno tenue">${escapeHTML(formatoFecha(c.fecha_emision))}</td>
                      <td class="tabla__acciones">
                        ${c.path ? `<button class="btn btn--sm btn--borde" type="button" data-folio="${c.id}">Ver PDF</button>` : ''}
                      </td>
                    </tr>`,
                    )
                    .join('')}
                </tbody>
              </table></div>`
            : `<div class="vacio" style="border:0">
                <h3 class="vacio__titulo">Sin documentos emitidos</h3>
                <p class="vacio__texto">Genera la constancia de estudios o el comprobante de pago con un folio oficial.</p>
              </div>`
        }
      </div>
    </div>`;
}

function conectarExpediente(alumno) {
  const lista = document.querySelector('#lista-expediente');
  if (!lista) return;

  lista.querySelectorAll('[data-folio]').forEach((boton) => {
    boton.addEventListener('click', async () => {
      try {
        const { listar } = await import('../services/db.js');
        const { TABLAS } = await import('../config.js');
        const { urlFirmada } = await import('../services/db.js');
        const [documento] = await listar(TABLAS.constancias, { filtros: { id: boton.dataset.folio } });
        if (!documento?.path) return;
        const url = await urlFirmada(documento.path);
        window.open(url, '_blank', 'noopener');
      } catch (error) {
        aviso(error.message, 'error');
      }
    });
  });

  document.querySelector('#btn-emitir')?.addEventListener('click', () => {
    import('./documentos.js').then(({ abrirEmision }) => abrirEmision(alumno));
  });
}
