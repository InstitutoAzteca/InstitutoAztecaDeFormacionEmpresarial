// views/alumnos.js — listado, alta y edición de alumnos.

import { ROL, TABLAS } from '../config.js';
import { listarAlumnos, crearAlumno, actualizarAlumno, generarCodigo } from '../services/alumnos.js';
import { listar } from '../services/db.js';
import { estado } from '../state.js';
import { escapeHTML, aviso, abrirModal, confirmar, normalizar, retrasar, ICONO } from '../utils/ui.js';
import { formatoFecha } from '../utils/dates.js';
import { renderFicha } from './ficha.js';

export async function renderAlumnos(contenido, { parametro, rol }) {
  if (parametro) {
    await renderFicha(contenido, { alumnoId: parametro, rol });
    return;
  }

  const esAdmin = rol === ROL.ADMIN;
  const niveles = await listar(TABLAS.niveles, { orden: { columna: 'orden', asc: true } });
  const grupos = await listar(TABLAS.grupos, { orden: { columna: 'nombre', asc: true } });

  const filtros = { busqueda: '', nivelId: '', estado: 'activo' };

  contenido.innerHTML = `
    <div class="pagina">
      <div class="pagina__cabecera">
        <div>
          <p class="antetitulo">Matrícula</p>
          <h1 class="pagina__titulo">Alumnos</h1>
          <p class="pagina__sub">Expedientes, documentación y pagos de cada estudiante del instituto.</p>
        </div>
        ${
          esAdmin
            ? `<div class="pagina__acciones">
                 <button class="btn btn--primario" type="button" id="btn-nuevo-alumno">${ICONO.agregar} Nuevo alumno</button>
               </div>`
            : ''
        }
      </div>

      <section class="tarjeta">
        <div class="tarjeta__cabecera">
          <div class="filtros crece">
            <div class="buscador">
              <span class="buscador__lupa">${ICONO.buscar}</span>
              <input class="input" type="search" id="filtro-busqueda" placeholder="Buscar por nombre, matrícula o CURP" aria-label="Buscar alumnos" />
            </div>
            <select class="select" id="filtro-nivel" aria-label="Filtrar por nivel">
              <option value="">Todos los niveles</option>
              ${niveles.map((n) => `<option value="${n.id}">${escapeHTML(n.nombre)}</option>`).join('')}
            </select>
            <select class="select" id="filtro-estado" aria-label="Filtrar por estado">
              <option value="activo">Activos</option>
              <option value="baja">Bajas</option>
              <option value="">Todos</option>
            </select>
          </div>
          <span class="pequeno tenue nowrap" id="conteo-alumnos"></span>
        </div>
        <div class="tarjeta__cuerpo tarjeta__cuerpo--liso" id="tabla-alumnos">
          <div class="cargando"><span class="cargando__giro"></span></div>
        </div>
      </section>
    </div>`;

  const buscador = contenido.querySelector('#filtro-busqueda');
  const selNivel = contenido.querySelector('#filtro-nivel');
  const selEstado = contenido.querySelector('#filtro-estado');
  const tabla = contenido.querySelector('#tabla-alumnos');
  const conteo = contenido.querySelector('#conteo-alumnos');

  const pintar = async () => {
    const alumnos = await listarAlumnos({
      estado: selEstado.value || null,
      nivelId: selNivel.value || null,
      busqueda: buscador.value.trim(),
    });

    conteo.textContent = `${alumnos.length} alumno(s)`;

    if (!alumnos.length) {
      tabla.innerHTML = `
        <div class="vacio" style="border:0">
          <h3 class="vacio__titulo">Sin resultados</h3>
          <p class="vacio__texto">Ajusta los filtros o registra un alumno nuevo para comenzar.</p>
        </div>`;
      return;
    }

    tabla.innerHTML = `
      <div class="tabla-envoltura">
        <table class="tabla">
          <thead>
            <tr>
              <th>Alumno</th>
              <th>Nivel</th>
              <th>Grupo</th>
              <th>Ciclo</th>
              <th>Contacto</th>
              <th>Estado</th>
              <th class="tabla__acciones"></th>
            </tr>
          </thead>
          <tbody>
            ${alumnos
              .map(
                (alumno) => `
              <tr>
                <td>
                  <div class="celda-principal">
                    <span class="celda-principal__titulo">${escapeHTML([alumno.nombre, alumno.apellidos].filter(Boolean).join(' '))}</span>
                    <span class="celda-principal__meta">${escapeHTML(alumno.codigo)}${alumno.curp ? ` · ${escapeHTML(alumno.curp)}` : ''}</span>
                  </div>
                </td>
                <td>${escapeHTML(alumno.nivel?.nombre ?? '—')}</td>
                <td>${escapeHTML(alumno.grupo?.nombre ?? '—')}</td>
                <td class="mono pequeno">${escapeHTML(alumno.ciclo || '—')}</td>
                <td class="pequeno">
                  ${alumno.telefono ? escapeHTML(alumno.telefono) : '—'}
                  ${alumno.email ? `<br><span class="tenue">${escapeHTML(alumno.email)}</span>` : ''}
                </td>
                <td>
                  ${
                    alumno.estado === 'baja'
                      ? '<span class="pastilla pastilla--error">Baja</span>'
                      : alumno.becado
                        ? '<span class="pastilla pastilla--info">Becado</span>'
                        : '<span class="pastilla pastilla--exito">Activo</span>'
                  }
                </td>
                <td class="tabla__acciones">
                  <a class="btn btn--sm btn--borde" href="#/alumnos/${alumno.id}">Ver expediente</a>
                </td>
              </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>`;
  };

  buscador.addEventListener('input', retrasar(pintar));
  selNivel.addEventListener('change', pintar);
  selEstado.addEventListener('change', pintar);

  contenido.querySelector('#btn-nuevo-alumno')?.addEventListener('click', () => {
    abrirFormularioAlumno({ niveles, grupos, alGuardar: pintar });
  });

  await pintar();
}

/**
 * Formulario de alta / edición de alumno.
 */
export async function abrirFormularioAlumno({ niveles, grupos, alumno = null, alGuardar }) {
  const esEdicion = Boolean(alumno);
  const cicloActivo = estado.config?.ciclo_activo || '';

  const gruposDeNivel = grupos.filter(
    (g) => !alumno?.nivel_id || g.nivel_id === alumno.nivel_id,
  );

  const modal = abrirModal({
    titulo: esEdicion ? 'Editar alumno' : 'Nuevo alumno',
    subtitulo: esEdicion
      ? `Matrícula ${alumno.codigo}`
      : 'Se generará la matrícula automáticamente si la dejas vacía.',
    tamano: 'ancho',
    cuerpo: `
      <form class="form" id="form-alumno" novalidate>
        <div class="rejilla">
          <div class="campo">
            <label class="etiqueta" for="al-nombre">Nombre(s) <span class="etiqueta__req">*</span></label>
            <input class="input" id="al-nombre" name="nombre" value="${escapeHTML(alumno?.nombre ?? '')}" required />
          </div>
          <div class="campo">
            <label class="etiqueta" for="al-apellidos">Apellidos</label>
            <input class="input" id="al-apellidos" name="apellidos" value="${escapeHTML(alumno?.apellidos ?? '')}" />
          </div>
        </div>

        <div class="rejilla">
          <div class="campo">
            <label class="etiqueta" for="al-codigo">Matrícula</label>
            <input class="input input--mono" id="al-codigo" name="codigo" value="${escapeHTML(alumno?.codigo ?? '')}" placeholder="Se genera al guardar" />
          </div>
          <div class="campo">
            <label class="etiqueta" for="al-curp">CURP</label>
            <input class="input input--mono" id="al-curp" name="curp" maxlength="18" value="${escapeHTML(alumno?.curp ?? '')}" />
          </div>
        </div>

        <div class="rejilla">
          <div class="campo">
            <label class="etiqueta" for="al-email">Correo electrónico</label>
            <input class="input" type="email" id="al-email" name="email" value="${escapeHTML(alumno?.email ?? '')}" />
          </div>
          <div class="campo">
            <label class="etiqueta" for="al-telefono">Teléfono</label>
            <input class="input" id="al-telefono" name="telefono" value="${escapeHTML(alumno?.telefono ?? '')}" />
          </div>
        </div>

        <div class="rejilla">
          <div class="campo">
            <label class="etiqueta" for="al-nivel">Nivel <span class="etiqueta__req">*</span></label>
            <select class="select" id="al-nivel" name="nivel_id" required>
              <option value="">Selecciona…</option>
              ${niveles
                .map(
                  (n) =>
                    `<option value="${n.id}" ${alumno?.nivel_id === n.id ? 'selected' : ''}>${escapeHTML(n.nombre)} — ${dineroLocal(n.mensualidad)}/mes</option>`,
                )
                .join('')}
            </select>
          </div>
          <div class="campo">
            <label class="etiqueta" for="al-grupo">Grupo</label>
            <select class="select" id="al-grupo" name="grupo_id">
              <option value="">Sin asignar</option>
              ${gruposDeNivel
                .map(
                  (g) =>
                    `<option value="${g.id}" ${alumno?.grupo_id === g.id ? 'selected' : ''}>${escapeHTML(g.nombre)}${g.ciclo ? ` · ${escapeHTML(g.ciclo)}` : ''}</option>`,
                )
                .join('')}
            </select>
          </div>
        </div>

        <div class="rejilla">
          <div class="campo">
            <label class="etiqueta" for="al-ciclo">Ciclo</label>
            <input class="input" id="al-ciclo" name="ciclo" value="${escapeHTML(alumno?.ciclo ?? cicloActivo)}" placeholder="2026-A" />
          </div>
          <div class="campo">
            <label class="etiqueta" for="al-fecha">Fecha de inscripción</label>
            <input class="input" type="date" id="al-fecha" name="fecha_inscripcion" value="${escapeHTML(alumno?.fecha_inscripcion ?? new Date().toISOString().slice(0, 10))}" />
          </div>
        </div>

        <div class="rejilla">
          <div class="campo">
            <label class="etiqueta" for="al-direccion">Domicilio</label>
            <input class="input" id="al-direccion" name="direccion" value="${escapeHTML(alumno?.direccion ?? '')}" />
          </div>
          <div class="campo">
            <label class="etiqueta" for="al-nacimiento">Fecha de nacimiento</label>
            <input class="input" type="date" id="al-nacimiento" name="fecha_nacimiento" value="${escapeHTML(alumno?.fecha_nacimiento ?? '')}" />
          </div>
        </div>

        <div class="rejilla">
          <div class="campo">
            <label class="etiqueta" for="al-tutor">Tutor o responsable</label>
            <input class="input" id="al-tutor" name="tutor_nombre" value="${escapeHTML(alumno?.tutor_nombre ?? '')}" />
          </div>
          <div class="campo">
            <label class="etiqueta" for="al-tutor-tel">Teléfono del tutor</label>
            <input class="input" id="al-tutor-tel" name="tutor_telefono" value="${escapeHTML(alumno?.tutor_telefono ?? '')}" />
          </div>
        </div>

        <div class="campo">
          <label class="etiqueta" for="al-obs">Observaciones</label>
          <textarea class="textarea" id="al-obs" name="observaciones">${escapeHTML(alumno?.observaciones ?? '')}</textarea>
        </div>

        <label class="check">
          <input type="checkbox" name="becado" ${alumno?.becado ? 'checked' : ''} />
          <span class="check__texto">Alumno becado (las mensualidades se registran como becado).</span>
        </label>

        <p class="alerta alerta--error" id="al-error" hidden></p>
      </form>`,
    pie: `
      <button class="btn btn--borde" type="button" data-cerrar>Cancelar</button>
      <button class="btn btn--primario" type="submit" form="form-alumno">${esEdicion ? 'Guardar cambios' : 'Registrar alumno'}</button>`,
  });

  modal.panel.querySelector('[data-cerrar]').addEventListener('click', () => modal.close());

  const form = modal.panel.querySelector('#form-alumno');
  const error = modal.panel.querySelector('#al-error');

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    error.setAttribute('hidden', '');

    const datos = Object.fromEntries(new FormData(form).entries());
    datos.becado = form.becado.checked;

    if (!datos.nombre?.trim()) {
      error.textContent = 'El nombre es obligatorio.';
      error.removeAttribute('hidden');
      return;
    }
    if (!datos.nivel_id) {
      error.textContent = 'Selecciona el nivel del alumno.';
      error.removeAttribute('hidden');
      return;
    }
    if (datos.curp && datos.curp.length !== 18) {
      error.textContent = 'El CURP debe tener 18 caracteres.';
      error.removeAttribute('hidden');
      return;
    }

    try {
      if (esEdicion) {
        await actualizarAlumno(alumno.id, datos);
        aviso('Alumno actualizado', 'exito');
      } else {
        if (!datos.codigo?.trim()) {
          const nivel = niveles.find((n) => n.id === datos.nivel_id);
          datos.codigo = await generarCodigo((nivel?.clave ?? 'EST').slice(0, 3).toUpperCase());
        }
        await crearAlumno(datos, estado.perfil?.id ?? null);
        aviso('Alumno registrado', 'exito');
      }
      modal.close();
      if (alGuardar) alGuardar();
    } catch (errorGuardado) {
      error.textContent = errorGuardado.message || 'No se pudo guardar el alumno.';
      error.removeAttribute('hidden');
    }
  });
}

function dineroLocal(valor) {
  return `$${Number(valor ?? 0).toLocaleString('es-MX')}`;
}
