// views/documentos.js — centro de emisión de constancias y certificados.

import { ROL, TABLAS, TIPOS_DOCUMENTO } from '../config.js';
import { estado } from '../state.js';
import { listarAlumnos } from '../services/alumnos.js';
import { listar } from '../services/db.js';
import { emitirDocumento } from '../services/constancias.js';
import { calificacionesDeAlumno } from '../services/calificaciones.js';
import { pagosDeAlumno } from '../services/pagos.js';
import { escapeHTML, aviso, abrirModal, ICONO, descargar } from '../utils/ui.js';
import { fechaLarga, formatoFecha, dinero } from '../utils/dates.js';

export async function renderDocumentos(contenido, { rol }) {
  const esAdmin = rol === ROL.ADMIN;

  const [documentos, alumnos] = await Promise.all([
    listar(TABLAS.constancias, { orden: { columna: 'fecha_emision', asc: false } }),
    listarAlumnos({ estado: 'activo' }),
  ]);

  const porAlumno = new Map(alumnos.map((a) => [a.id, a]));
  let filtroTipo = '';

  contenido.innerHTML = `
    <div class="pagina">
      <div class="pagina__cabecera">
        <div>
          <p class="antetitulo">Documentos oficiales</p>
          <h1 class="pagina__titulo">Constancias y certificados</h1>
          <p class="pagina__sub">Cada emisión genera un PDF con membrete institucional y folio único, y queda archivada en el expediente del alumno.</p>
        </div>
        ${
          esAdmin
            ? `<div class="pagina__acciones">
                 <button class="btn btn--primario" type="button" id="btn-emitir-nuevo">${ICONO.sello} Emitir documento</button>
               </div>`
            : ''
        }
      </div>

      <section class="tarjeta">
        <div class="tarjeta__cabecera">
          <div class="filtros crece">
            <select class="select" id="filtro-tipo" aria-label="Tipo de documento">
              <option value="">Todos los tipos</option>
              ${Object.entries(TIPOS_DOCUMENTO)
                .map(([valor, etiqueta]) => `<option value="${valor}">${escapeHTML(etiqueta)}</option>`)
                .join('')}
            </select>
          </div>
          <span class="pequeno tenue nowrap" id="conteo-documentos"></span>
        </div>
        <div class="tarjeta__cuerpo tarjeta__cuerpo--liso" id="lista-documentos">
          <div class="cargando"><span class="cargando__giro"></span></div>
        </div>
      </section>
    </div>`;

  const selTipo = contenido.querySelector('#filtro-tipo');
  const lista = contenido.querySelector('#lista-documentos');
  const conteo = contenido.querySelector('#conteo-documentos');

  const pintar = () => {
    const filtrados = documentos.filter((d) => !filtroTipo || d.tipo === filtroTipo);
    conteo.textContent = `${filtrados.length} documento(s)`;

    if (!filtrados.length) {
      lista.innerHTML = `
        <div class="vacio" style="border:0">
          <h3 class="vacio__titulo">Sin documentos emitidos</h3>
          <p class="vacio__texto">Emite la primera constancia para empezar el archivo institucional.</p>
        </div>`;
      return;
    }

    lista.innerHTML = `
      <div class="tabla-envoltura">
        <table class="tabla">
          <thead><tr><th>Folio</th><th>Alumno</th><th>Tipo</th><th>Emitido</th><th class="tabla__acciones"></th></tr></thead>
          <tbody>
            ${filtrados
              .map((doc) => {
                const alumno = porAlumno.get(doc.alumno_id);
                return `
                <tr>
                  <td><span class="folio">${escapeHTML(doc.folio)}</span></td>
                  <td>
                    <div class="celda-principal">
                      <span class="celda-principal__titulo">${escapeHTML(
                        alumno ? [alumno.nombre, alumno.apellidos].filter(Boolean).join(' ') : 'Alumno dado de baja',
                      )}</span>
                      <span class="celda-principal__meta">${escapeHTML(alumno?.codigo ?? '')}</span>
                    </div>
                  </td>
                  <td class="pequeno">${escapeHTML(TIPOS_DOCUMENTO[doc.tipo] ?? doc.tipo)}</td>
                  <td class="pequeno tenue">${escapeHTML(formatoFecha(doc.fecha_emision))}</td>
                  <td class="tabla__acciones">
                    ${doc.path ? `<button class="btn btn--sm btn--borde" type="button" data-ver="${doc.id}">Ver PDF</button>` : ''}
                  </td>
                </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </div>`;

    lista.querySelectorAll('[data-ver]').forEach((boton) => {
      boton.addEventListener('click', async () => {
        const doc = documentos.find((d) => d.id === boton.dataset.ver);
        const { urlFirmada } = await import('../services/db.js');
        const url = await urlFirmada(doc.path);
        window.open(url, '_blank', 'noopener');
      });
    });
  };

  selTipo.addEventListener('change', () => {
    filtroTipo = selTipo.value;
    pintar();
  });

  contenido.querySelector('#btn-emitir-nuevo')?.addEventListener('click', () => {
    abrirEmision(null, alumnos, pintar);
  });

  pintar();
}

/**
 * Modal de emisión de documentos oficiales.
 * @param {object|null} alumno  alumno preseleccionado (opcional)
 * @param {Array} [alumnos]      catálogo para el selector
 * @param {Function} [alTerminar]
 */
export function abrirEmision(alumno = null, alumnos = null, alTerminar = null) {
  const opciones = alumnos ?? [];

  const modal = abrirModal({
    titulo: 'Emitir documento oficial',
    subtitulo: 'Se generará el PDF con el membrete del instituto y se archivará en el expediente.',
    cuerpo: `
      <form class="form" id="form-emision" novalidate>
        <div class="campo">
          <label class="etiqueta" for="em-alumno">Alumno <span class="etiqueta__req">*</span></label>
          <input class="input" id="em-alumno" list="lista-alumnos-emision" placeholder="Busca por nombre o matrícula" ${alumno ? `value="${escapeHTML(alumno.codigo)}"` : ''} required />
          <datalist id="lista-alumnos-emision">
            ${opciones
              .map(
                (a) =>
                  `<option value="${escapeHTML(a.codigo)}">${escapeHTML(
                    [a.nombre, a.apellidos].filter(Boolean).join(' '),
                  )}</option>`,
              )
              .join('')}
          </datalist>
          <span class="ayuda">Escribe la matrícula del alumno.</span>
        </div>

        <div class="campo">
          <label class="etiqueta" for="em-tipo">Tipo de documento <span class="etiqueta__req">*</span></label>
          <select class="select" id="em-tipo" name="tipo" required>
            ${Object.entries(TIPOS_DOCUMENTO)
              .map(([valor, etiqueta]) => `<option value="${valor}">${escapeHTML(etiqueta)}</option>`)
              .join('')}
          </select>
        </div>

        <div class="campo" id="em-pago-wrap" hidden>
          <label class="etiqueta" for="em-pago">Mensualidad a facturar</label>
          <select class="select" id="em-pago"></select>
          <span class="ayuda">Elige el cobro al que corresponde el comprobante.</span>
        </div>

        <p class="alerta alerta--info">
          El texto del documento sale de la plantilla editada en Configuración. Revísala antes de emitir.
        </p>
        <p class="alerta alerta--error" id="em-error" hidden></p>
      </form>`,
    pie: `
      <button class="btn btn--borde" type="button" data-cerrar>Cancelar</button>
      <button class="btn btn--primario" type="submit" form="form-emision">Generar documento</button>`,
  });

  modal.panel.querySelector('[data-cerrar]').addEventListener('click', () => modal.close());

  const form = modal.panel.querySelector('#form-emision');
  const error = modal.panel.querySelector('#em-error');
  const selTipo = form.querySelector('#em-tipo');
  const selPago = form.querySelector('#em-pago');
  const wrapPago = form.querySelector('#em-pago-wrap');
  const inputAlumno = form.querySelector('#em-alumno');

  let alumnoActual = alumno;

  const resolverAlumno = async () => {
    const codigo = inputAlumno.value.trim();
    if (!codigo) return null;
    if (alumnoActual && alumnoActual.codigo === codigo) return alumnoActual;
    const catalogo = opciones.length ? opciones : await listarAlumnos({ estado: 'activo' });
    const encontrado = catalogo.find(
      (a) => a.codigo.toLowerCase() === codigo.toLowerCase() || `${a.nombre} ${a.apellidos}`.toLowerCase() === codigo.toLowerCase(),
    );
    return encontrado ?? null;
  };

  const cargarPagos = async () => {
    if (selTipo.value !== 'comprobante') {
      wrapPago.setAttribute('hidden', '');
      return;
    }
    wrapPago.removeAttribute('hidden');
    if (!alumnoActual) {
      selPago.innerHTML = '<option value="">Selecciona primero al alumno</option>';
      return;
    }
    const pagos = await pagosDeAlumno(alumnoActual.id);
    const pagados = pagos.filter((p) => p.estado === 'pagada');
    selPago.innerHTML = pagados.length
      ? pagados
          .map(
            (p) =>
              `<option value="${p.id}">${escapeHTML(`${p.mes}/${p.anio} · ${dinero(p.monto)} · ${p.folio ?? 'sin folio'}`)}</option>`,
          )
          .join('')
      : '<option value="">No hay pagos registrados para este alumno</option>';
  };

  selTipo.addEventListener('change', cargarPagos);
  inputAlumno.addEventListener('change', async () => {
    alumnoActual = await resolverAlumno();
    if (alumnoActual) {
      inputAlumno.value = alumnoActual.codigo;
      await cargarPagos();
    }
  });

  if (alumno) {
    alumnoActual = alumno;
    cargarPagos();
  }

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    error.setAttribute('hidden', '');

    const boton = modal.panel.querySelector('[type="submit"]');
    boton.disabled = true;
    boton.textContent = 'Generando…';

    try {
      const encontrado = await resolverAlumno();
      if (!encontrado) throw new Error('No se encontró al alumno con esa matrícula.');

      const tipo = selTipo.value;
      const pagos = tipo === 'comprobante' ? await pagosDeAlumno(encontrado.id) : [];
      const pago = selPago.value ? pagos.find((p) => p.id === selPago.value) : null;
      const calificaciones =
        tipo === 'boleta' || tipo === 'certificado' || tipo === 'estudios'
          ? await calificacionesDeAlumno(encontrado.id)
          : [];

      const resultado = await emitirDocumento({
        tipo,
        alumno: encontrado,
        pago,
        calificaciones,
        emisorId: estado.perfil?.id ?? null,
      });

      modal.close();
      aviso(`Documento ${resultado.folio} generado`, 'exito', 5000);
      descargar(resultado.pdf, `${resultado.folio}.pdf`);
      if (alTerminar) alTerminar();
    } catch (errorEmision) {
      error.textContent = errorEmision.message || 'No se pudo generar el documento.';
      error.removeAttribute('hidden');
      boton.disabled = false;
      boton.textContent = 'Generar documento';
    }
  });
}
