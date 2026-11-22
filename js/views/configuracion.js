// views/configuracion.js — datos oficiales, plantillas, niveles y grupos.

import { TABLAS, ETIQUETA_ROL } from '../config.js';
import { estado, setEstado, cargarConfig } from '../state.js';
import { leerConfiguracion, guardarConfiguracion } from '../services/configuracion.js';
import { listar, insertar, actualizar } from '../services/db.js';
import { listarPersonal } from '../services/auth.js';
import { escapeHTML, aviso, abrirModal, confirmar, ICONO } from '../utils/ui.js';
import { dinero } from '../utils/dates.js';

const CAMPOS_INSTITUCION = [
  { clave: 'institucion_nombre', etiqueta: 'Nombre de la dependencia', tipo: 'texto' },
  { clave: 'institucion_siglas', etiqueta: 'Siglas', tipo: 'texto' },
  { clave: 'institucion_rfc', etiqueta: 'RFC', tipo: 'texto' },
  { clave: 'institucion_direccion', etiqueta: 'Domicilio', tipo: 'texto' },
  { clave: 'institucion_telefono', etiqueta: 'Teléfono', tipo: 'texto' },
  { clave: 'institucion_email', etiqueta: 'Correo de contacto', tipo: 'texto' },
  { clave: 'director_nombre', etiqueta: 'Nombre de quien firma', tipo: 'texto' },
  { clave: 'director_cargo', etiqueta: 'Cargo del firmante', tipo: 'texto' },
  { clave: 'coordinador_nombre', etiqueta: 'Coordinación académica', tipo: 'texto' },
];

const CAMPOS_PAGO = [
  { clave: 'pago_banco', etiqueta: 'Banco', tipo: 'texto' },
  { clave: 'pago_clabe', etiqueta: 'CLABE', tipo: 'texto', mono: true },
  { clave: 'pago_titular', etiqueta: 'Titular de la cuenta', tipo: 'texto' },
  { clave: 'pago_concepto', etiqueta: 'Concepto sugerido', tipo: 'texto' },
];

const PLANTILLAS = [
  { clave: 'plantilla_estudios', etiqueta: 'Constancia de estudios' },
  { clave: 'plantilla_inscripcion', etiqueta: 'Constancia de inscripción' },
  { clave: 'plantilla_certificado', etiqueta: 'Certificado de conclusión' },
];

const MARCADORES = [
  '{nombre_completo}', '{codigo}', '{curp}', '{nivel}', '{grupo}', '{ciclo}',
  '{promedio}', '{fecha_inscripcion}', '{fecha_emision}', '{folio}',
];

export async function renderConfiguracion(contenido) {
  const config = await leerConfiguracion();

  contenido.innerHTML = `
    <div class="pagina">
      <div class="pagina__cabecera">
        <div>
          <p class="antetitulo">Administración</p>
          <h1 class="pagina__titulo">Configuración</h1>
          <p class="pagina__sub">Estos datos alimentan los membretes y las constancias que genera la plataforma.</p>
        </div>
      </div>

      <section class="tarjeta">
        <div class="tarjeta__cuerpo tarjeta__cuerpo--liso">
          <nav class="pestanas" style="padding:0 20px" role="tablist">
            <button class="pestana is-activa" type="button" data-tab="institucion">Institución</button>
            <button class="pestana" type="button" data-tab="plantillas">Plantillas</button>
            <button class="pestana" type="button" data-tab="niveles">Niveles</button>
            <button class="pestana" type="button" data-tab="grupos">Grupos</button>
          </nav>
          <div id="tab-config"></div>
        </div>
      </section>
    </div>`;

  const panel = contenido.querySelector('#tab-config');

  const tabs = {
    institucion: () => tabInstitucion(config),
    plantillas: () => tabPlantillas(config),
    niveles: () => tabNiveles(),
    grupos: () => tabGrupos(),
  };

  const mostrar = async (nombre) => {
    panel.innerHTML = '<div class="cargando"><span class="cargando__giro"></span></div>';
    panel.innerHTML = await tabs[nombre]();
    if (nombre === 'institucion' || nombre === 'plantillas') conectarGuardado(contenido);
    if (nombre === 'niveles') conectarNiveles();
    if (nombre === 'grupos') conectarGrupos();
  };

  contenido.querySelectorAll('[data-tab]').forEach((boton) => {
    boton.addEventListener('click', () => {
      contenido.querySelectorAll('[data-tab]').forEach((b) => b.classList.remove('is-activa'));
      boton.classList.add('is-activa');
      mostrar(boton.dataset.tab);
    });
  });

  await mostrar('institucion');
}

// ----------------------------------------------------------- institución ---
function tabInstitucion(config) {
  return `
    <div style="padding:24px">
      <form class="form" id="form-institucion">
        <h3 class="seccion__titulo mb-3">Datos de la dependencia</h3>
        <div class="rejilla">
          ${CAMPOS_INSTITUCION.map((campo) => campoHtml(campo, config[campo.clave])).join('')}
        </div>

        <hr class="separador" />
        <h3 class="seccion__titulo mb-3">Cobranza</h3>
        <div class="rejilla">
          ${CAMPOS_PAGO.map((campo) => campoHtml(campo, config[campo.clave])).join('')}
        </div>

        <hr class="separador" />
        <h3 class="seccion__titulo mb-3">Ciclo escolar</h3>
        <div class="rejilla">
          <div class="campo">
            <label class="etiqueta" for="cf-ciclo">Ciclo activo</label>
            <input class="input" id="cf-ciclo" name="ciclo_activo" value="${escapeHTML(config.ciclo_activo || '')}" placeholder="2026-A" />
          </div>
          <div class="campo">
            <label class="etiqueta" for="cf-escala">Calificación mínima aprobatoria</label>
            <input class="input" type="number" step="0.5" min="0" max="10" id="cf-escala" name="escala_minima" value="${escapeHTML(config.escala_minima || '6')}" />
          </div>
        </div>

        <div class="mt-4">
          <button class="btn btn--primario" type="submit">Guardar configuración</button>
        </div>
      </form>
    </div>`;
}

function campoHtml(campo, valor) {
  const clase = campo.mono ? 'input input--mono' : 'input';
  return `
    <div class="campo">
      <label class="etiqueta" for="cf-${campo.clave}">${escapeHTML(campo.etiqueta)}</label>
      <input class="${clase}" id="cf-${campo.clave}" name="${campo.clave}" value="${escapeHTML(valor || '')}" />
    </div>`;
}

// ------------------------------------------------------------ plantillas ---
function tabPlantillas(config) {
  return `
    <div style="padding:24px">
      <div class="alerta alerta--info mb-4">
        <div>
          <strong>Marcadores disponibles:</strong>
          ${MARCADORES.map((m) => `<span class="mono">${m}</span>`).join(' · ')}
        </div>
      </div>
      <form class="form" id="form-plantillas">
        ${PLANTILLAS.map(
          (plantilla) => `
          <div class="campo">
            <label class="etiqueta" for="cf-${plantilla.clave}">${escapeHTML(plantilla.etiqueta)}</label>
            <textarea class="textarea" id="cf-${plantilla.clave}" name="${plantilla.clave}" rows="6">${escapeHTML(
              config[plantilla.clave] || '',
            )}</textarea>
          </div>`,
        ).join('')}
        <div class="mt-4">
          <button class="btn btn--primario" type="submit">Guardar plantillas</button>
        </div>
      </form>
    </div>`;
}

// --------------------------------------------------------------- niveles ---
async function tabNiveles() {
  const niveles = await listar(TABLAS.niveles, { orden: { columna: 'orden', asc: true } });

  return `
    <div style="padding:24px">
      <div class="fila--separada mb-4">
        <div>
          <h3 class="seccion__titulo">Niveles y mensualidades</h3>
          <p class="pequeno tenue">El monto se propone al registrar el pago de cada alumno.</p>
        </div>
        <button class="btn btn--primario" type="button" id="btn-nuevo-nivel">${ICONO.agregar} Agregar nivel</button>
      </div>
      <div class="tabla-envoltura">
        <table class="tabla">
          <thead><tr><th>Nivel</th><th>Clave</th><th class="tabla__num">Mensualidad</th><th class="tabla__num">Inscripción</th><th class="tabla__num">Día límite</th><th class="tabla__acciones"></th></tr></thead>
          <tbody>
            ${niveles
              .map(
                (n) => `
              <tr>
                <td class="celda-principal__titulo">${escapeHTML(n.nombre)}</td>
                <td class="mono pequeno">${escapeHTML(n.clave)}</td>
                <td class="tabla__num mono">${dinero(n.mensualidad)}</td>
                <td class="tabla__num mono">${dinero(n.cuota_inscripcion)}</td>
                <td class="tabla__num mono">${n.dia_limite_pago}</td>
                <td class="tabla__acciones">
                  <button class="btn btn--sm btn--borde" type="button" data-editar-nivel="${n.id}">Editar</button>
                </td>
              </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function conectarNiveles() {
  const abrir = (nivel = null) => {
    const modal = abrirModal({
      titulo: nivel ? 'Editar nivel' : 'Nuevo nivel',
      cuerpo: `
        <form class="form" id="form-nivel" novalidate>
          <div class="rejilla">
            <div class="campo">
              <label class="etiqueta" for="nv-nombre">Nombre <span class="etiqueta__req">*</span></label>
              <input class="input" id="nv-nombre" name="nombre" value="${escapeHTML(nivel?.nombre ?? '')}" required />
            </div>
            <div class="campo">
              <label class="etiqueta" for="nv-clave">Clave <span class="etiqueta__req">*</span></label>
              <input class="input input--mono" id="nv-clave" name="clave" value="${escapeHTML(nivel?.clave ?? '')}" placeholder="SEC" maxlength="12" required />
            </div>
          </div>
          <div class="rejilla rejilla--3">
            <div class="campo">
              <label class="etiqueta" for="nv-mensualidad">Mensualidad</label>
              <input class="input" type="number" step="0.01" min="0" id="nv-mensualidad" name="mensualidad" value="${nivel?.mensualidad ?? 0}" />
            </div>
            <div class="campo">
              <label class="etiqueta" for="nv-cuota">Cuota de inscripción</label>
              <input class="input" type="number" step="0.01" min="0" id="nv-cuota" name="cuota_inscripcion" value="${nivel?.cuota_inscripcion ?? 0}" />
            </div>
            <div class="campo">
              <label class="etiqueta" for="nv-dia">Día límite de pago</label>
              <input class="input" type="number" min="1" max="31" id="nv-dia" name="dia_limite_pago" value="${nivel?.dia_limite_pago ?? 10}" />
            </div>
          </div>
          <p class="alerta alerta--error" id="nv-error" hidden></p>
        </form>`,
      pie: `
        <button class="btn btn--borde" type="button" data-cerrar>Cancelar</button>
        <button class="btn btn--primario" type="submit" form="form-nivel">${nivel ? 'Guardar' : 'Agregar'}</button>`,
    });

    modal.panel.querySelector('[data-cerrar]').addEventListener('click', () => modal.close());

    const form = modal.panel.querySelector('#form-nivel');
    const error = modal.panel.querySelector('#nv-error');

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      error.setAttribute('hidden', '');
      const datos = Object.fromEntries(new FormData(form).entries());
      if (!datos.nombre?.trim() || !datos.clave?.trim()) {
        error.textContent = 'El nombre y la clave son obligatorios.';
        error.removeAttribute('hidden');
        return;
      }
      try {
        const fila = {
          nombre: datos.nombre.trim(),
          clave: datos.clave.trim().toUpperCase(),
          mensualidad: Number(datos.mensualidad || 0),
          cuota_inscripcion: Number(datos.cuota_inscripcion || 0),
          dia_limite_pago: Number(datos.dia_limite_pago || 10),
        };
        if (nivel) await actualizar(TABLAS.niveles, nivel.id, fila);
        else await insertar(TABLAS.niveles, { ...fila, orden: 99 });
        aviso(nivel ? 'Nivel actualizado' : 'Nivel agregado', 'exito');
        modal.close();
        renderConfiguracion(document.getElementById('contenido'));
      } catch (errorNivel) {
        error.textContent = errorNivel.message || 'No se pudo guardar el nivel.';
        error.removeAttribute('hidden');
      }
    });
  };

  document.querySelector('#btn-nuevo-nivel')?.addEventListener('click', () => abrir());
  document.querySelectorAll('[data-editar-nivel]').forEach((boton) => {
    boton.addEventListener('click', async () => {
      const niveles = await listar(TABLAS.niveles);
      const nivel = niveles.find((n) => n.id === boton.dataset.editarNivel);
      if (nivel) abrir(nivel);
    });
  });
}

// ---------------------------------------------------------------- grupos ---
async function tabGrupos() {
  const [grupos, niveles, personal] = await Promise.all([
    listar(TABLAS.grupos, { orden: { columna: 'nombre', asc: true } }),
    listar(TABLAS.niveles, { orden: { columna: 'orden', asc: true } }),
    listarPersonal(),
  ]);

  return `
    <div style="padding:24px">
      <div class="fila--separada mb-4">
        <div>
          <h3 class="seccion__titulo">Grupos</h3>
          <p class="pequeno tenue">Secciones de alumnos por nivel y ciclo. La maestra captura calificaciones por grupo.</p>
        </div>
        <button class="btn btn--primario" type="button" id="btn-nuevo-grupo">${ICONO.agregar} Agregar grupo</button>
      </div>
      ${
        grupos.length
          ? `<div class="tabla-envoltura">
              <table class="tabla">
                <thead><tr><th>Grupo</th><th>Nivel</th><th>Docente</th><th>Ciclo</th><th>Horario</th><th class="tabla__acciones"></th></tr></thead>
                <tbody>
                  ${grupos
                    .map(
                      (g) => `
                    <tr>
                      <td class="celda-principal__titulo">${escapeHTML(g.nombre)}</td>
                      <td class="pequeno">${escapeHTML(niveles.find((n) => n.id === g.nivel_id)?.nombre ?? '—')}</td>
                      <td class="pequeno">${escapeHTML(personal.find((p) => p.id === g.docente_id)?.nombre ?? '—')}</td>
                      <td class="mono pequeno">${escapeHTML(g.ciclo || '—')}</td>
                      <td class="pequeno">${escapeHTML(g.horario || '—')}</td>
                      <td class="tabla__acciones">
                        <button class="btn btn--sm btn--borde" type="button" data-editar-grupo="${g.id}">Editar</button>
                        <button class="btn btn--sm btn--fantasma" type="button" data-borrar-grupo="${g.id}" aria-label="Eliminar grupo">${ICONO.borrar}</button>
                      </td>
                    </tr>`,
                    )
                    .join('')}
                </tbody>
              </table>
            </div>`
          : `<div class="vacio" style="border:0">
              <h3 class="vacio__titulo">Sin grupos</h3>
              <p class="vacio__texto">Crea el primer grupo para empezar a capturar calificaciones.</p>
            </div>`
      }
    </div>`;
}

function conectarGrupos() {
  const abrir = async (grupo = null) => {
    const [niveles, personal] = await Promise.all([
      listar(TABLAS.niveles, { orden: { columna: 'orden', asc: true } }),
      listarPersonal(),
    ]);

    const modal = abrirModal({
      titulo: grupo ? 'Editar grupo' : 'Nuevo grupo',
      cuerpo: `
        <form class="form" id="form-grupo" novalidate>
          <div class="rejilla">
            <div class="campo">
              <label class="etiqueta" for="gr-nombre">Nombre <span class="etiqueta__req">*</span></label>
              <input class="input" id="gr-nombre" name="nombre" value="${escapeHTML(grupo?.nombre ?? '')}" placeholder="Secundaria A" required />
            </div>
            <div class="campo">
              <label class="etiqueta" for="gr-nivel">Nivel <span class="etiqueta__req">*</span></label>
              <select class="select" id="gr-nivel" name="nivel_id" required>
                <option value="">Selecciona…</option>
                ${niveles
                  .map(
                    (n) =>
                      `<option value="${n.id}" ${grupo?.nivel_id === n.id ? 'selected' : ''}>${escapeHTML(n.nombre)}</option>`,
                  )
                  .join('')}
              </select>
            </div>
          </div>
          <div class="rejilla">
            <div class="campo">
              <label class="etiqueta" for="gr-docente">Docente</label>
              <select class="select" id="gr-docente" name="docente_id">
                <option value="">Sin asignar</option>
                ${personal
                  .map(
                    (p) =>
                      `<option value="${p.id}" ${grupo?.docente_id === p.id ? 'selected' : ''}>${escapeHTML(
                        [p.nombre, p.apellidos].filter(Boolean).join(' '),
                      )}</option>`,
                  )
                  .join('')}
              </select>
            </div>
            <div class="campo">
              <label class="etiqueta" for="gr-ciclo">Ciclo</label>
              <input class="input" id="gr-ciclo" name="ciclo" value="${escapeHTML(grupo?.ciclo || estado.config?.ciclo_activo || '')}" placeholder="2026-A" />
            </div>
          </div>
          <div class="campo">
            <label class="etiqueta" for="gr-horario">Horario</label>
            <input class="input" id="gr-horario" name="horario" value="${escapeHTML(grupo?.horario ?? '')}" placeholder="Lunes a viernes · 8:00 a 13:00" />
          </div>
          <p class="alerta alerta--error" id="gr-error" hidden></p>
        </form>`,
      pie: `
        <button class="btn btn--borde" type="button" data-cerrar>Cancelar</button>
        <button class="btn btn--primario" type="submit" form="form-grupo">${grupo ? 'Guardar' : 'Agregar'}</button>`,
    });

    modal.panel.querySelector('[data-cerrar]').addEventListener('click', () => modal.close());

    const form = modal.panel.querySelector('#form-grupo');
    const error = modal.panel.querySelector('#gr-error');

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      error.setAttribute('hidden', '');
      const datos = Object.fromEntries(new FormData(form).entries());
      if (!datos.nombre?.trim() || !datos.nivel_id) {
        error.textContent = 'El nombre y el nivel son obligatorios.';
        error.removeAttribute('hidden');
        return;
      }
      try {
        const fila = {
          nombre: datos.nombre.trim(),
          nivel_id: datos.nivel_id,
          docente_id: datos.docente_id || null,
          ciclo: datos.ciclo?.trim() || '',
          horario: datos.horario?.trim() || null,
        };
        if (grupo) await actualizar(TABLAS.grupos, grupo.id, fila);
        else await insertar(TABLAS.grupos, fila);
        aviso(grupo ? 'Grupo actualizado' : 'Grupo agregado', 'exito');
        modal.close();
        renderConfiguracion(document.getElementById('contenido'));
      } catch (errorGrupo) {
        error.textContent = errorGrupo.message || 'No se pudo guardar el grupo.';
        error.removeAttribute('hidden');
      }
    });
  };

  document.querySelector('#btn-nuevo-grupo')?.addEventListener('click', () => abrir());
  document.querySelectorAll('[data-editar-grupo]').forEach((boton) => {
    boton.addEventListener('click', async () => {
      const grupos = await listar(TABLAS.grupos);
      const grupo = grupos.find((g) => g.id === boton.dataset.editarGrupo);
      if (grupo) abrir(grupo);
    });
  });
  document.querySelectorAll('[data-borrar-grupo]').forEach((boton) => {
    boton.addEventListener('click', async () => {
      const ok = await confirmar({
        titulo: 'Eliminar grupo',
        mensaje: 'Se eliminará el grupo. Los alumnos asignados quedarán sin grupo.',
        textoOk: 'Eliminar',
        peligro: true,
      });
      if (!ok) return;
      const { eliminar } = await import('../services/db.js');
      await eliminar(TABLAS.grupos, boton.dataset.borrarGrupo);
      aviso('Grupo eliminado', 'exito');
      renderConfiguracion(document.getElementById('contenido'));
    });
  });
}

// --------------------------------------------------------------- guardado ---
export function conectarGuardado(contenido) {
  contenido.querySelector('#form-institucion')?.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const datos = Object.fromEntries(new FormData(evento.target).entries());
    try {
      for (const [clave, valor] of Object.entries(datos)) {
        await guardarConfiguracion(clave, valor, estado.perfil?.id ?? null);
      }
      setEstado({ config: null });
      await cargarConfig();
      aviso('Configuración guardada', 'exito');
    } catch (error) {
      aviso(error.message || 'No se pudo guardar la configuración', 'error');
    }
  });

  contenido.querySelector('#form-plantillas')?.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const datos = Object.fromEntries(new FormData(evento.target).entries());
    try {
      for (const [clave, valor] of Object.entries(datos)) {
        await guardarConfiguracion(clave, valor, estado.perfil?.id ?? null);
      }
      setEstado({ config: null });
      await cargarConfig();
      aviso('Plantillas guardadas', 'exito');
    } catch (error) {
      aviso(error.message || 'No se pudieron guardar las plantillas', 'error');
    }
  });
}
