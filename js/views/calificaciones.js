// views/calificaciones.js — captura de calificaciones por grupo y materia.

import { ROL, TABLAS, PERIODOS } from '../config.js';
import { estado } from '../state.js';
import { listarAlumnos } from '../services/alumnos.js';
import { listar } from '../services/db.js';
import { guardarCalificacion, calificacionesDeGrupo, materiasConocidas, etiquetaPeriodo } from '../services/calificaciones.js';
import { escapeHTML, aviso, retrasar, ICONO } from '../utils/ui.js';
import { promedio } from '../utils/dates.js';

export async function renderCalificaciones(contenido, { rol }) {
  const esAdmin = rol === ROL.ADMIN;
  const grupos = await listar(TABLAS.grupos, { orden: { columna: 'nombre', asc: true } });
  const niveles = await listar(TABLAS.niveles, { orden: { columna: 'orden', asc: true } });
  const materias = await materiasConocidas();

  if (!grupos.length) {
    contenido.innerHTML = `
      <div class="pagina">
        <div class="pagina__cabecera">
          <div>
            <p class="antetitulo">Académico</p>
            <h1 class="pagina__titulo">Calificaciones</h1>
          </div>
        </div>
        <div class="vacio">
          <h2 class="vacio__titulo">Aún no hay grupos</h2>
          <p class="vacio__texto">El administrador debe registrar los grupos del ciclo para poder capturar calificaciones.</p>
        </div>
      </div>`;
    return;
  }

  const seleccion = { grupoId: grupos[0].id, materia: '', periodo: 'parcial_1' };

  contenido.innerHTML = `
    <div class="pagina">
      <div class="pagina__cabecera">
        <div>
          <p class="antetitulo">Académico</p>
          <h1 class="pagina__titulo">Calificaciones</h1>
          <p class="pagina__sub">Captura por grupo, materia y periodo. Las notas se guardan solas al escribirlas.</p>
        </div>
        <div class="pagina__acciones">
          ${
            esAdmin
              ? `<button class="btn btn--borde" type="button" id="btn-grupos">${ICONO.ajustes} Administrar grupos</button>`
              : ''
          }
        </div>
      </div>

      <section class="tarjeta">
        <div class="tarjeta__cabecera">
          <div class="filtros crece">
            <select class="select" id="sel-grupo" aria-label="Grupo">
              ${grupos
                .map(
                  (g) =>
                    `<option value="${g.id}">${escapeHTML(g.nombre)} · ${escapeHTML(
                      niveles.find((n) => n.id === g.nivel_id)?.nombre ?? '',
                    )}${g.ciclo ? ` · ${escapeHTML(g.ciclo)}` : ''}</option>`,
                )
                .join('')}
            </select>
            <input class="input" id="sel-materia" list="lista-materias" placeholder="Materia" aria-label="Materia" style="min-width:200px" />
            <datalist id="lista-materias">
              ${materias.map((m) => `<option value="${escapeHTML(m)}"></option>`).join('')}
            </datalist>
            <select class="select" id="sel-periodo" aria-label="Periodo">
              ${PERIODOS.map((p) => `<option value="${p.valor}">${p.etiqueta}</option>`).join('')}
            </select>
          </div>
          <span class="pequeno tenue nowrap" id="resumen-captura"></span>
        </div>
        <div class="tarjeta__cuerpo tarjeta__cuerpo--liso" id="tabla-calificaciones">
          <div class="cargando"><span class="cargando__giro"></span></div>
        </div>
      </section>
    </div>`;

  const selGrupo = contenido.querySelector('#sel-grupo');
  const selMateria = contenido.querySelector('#sel-materia');
  const selPeriodo = contenido.querySelector('#sel-periodo');
  const tabla = contenido.querySelector('#tabla-calificaciones');
  const resumen = contenido.querySelector('#resumen-captura');

  const pintar = async () => {
    seleccion.grupoId = selGrupo.value;
    seleccion.materia = selMateria.value.trim();
    seleccion.periodo = selPeriodo.value;

    if (!seleccion.materia) {
      tabla.innerHTML = `
        <div class="vacio" style="border:0">
          <h3 class="vacio__titulo">Elige una materia</h3>
          <p class="vacio__texto">Escribe o selecciona la materia para capturar las calificaciones del grupo.</p>
        </div>`;
      resumen.textContent = '';
      return;
    }

    const [alumnos, existentes] = await Promise.all([
      listarAlumnos({ estado: 'activo', grupoId: seleccion.grupoId }),
      calificacionesDeGrupo(seleccion.grupoId),
    ]);

    const porAlumno = new Map();
    for (const c of existentes) {
      if (!porAlumno.has(c.alumno_id)) porAlumno.set(c.alumno_id, {});
      porAlumno.get(c.alumno_id)[`${c.materia}|${c.periodo}`] = c;
    }

    if (!alumnos.length) {
      tabla.innerHTML = `
        <div class="vacio" style="border:0">
          <h3 class="vacio__titulo">El grupo no tiene alumnos</h3>
          <p class="vacio__texto">Asigna alumnos a este grupo desde su expediente.</p>
        </div>`;
      return;
    }

    tabla.innerHTML = `
      <div class="tabla-envoltura">
        <table class="tabla">
          <thead>
            <tr>
              <th style="min-width:240px">Alumno</th>
              ${PERIODOS.map((p) => `<th class="tabla__num">${p.etiqueta}</th>`).join('')}
              <th class="tabla__num">Final</th>
            </tr>
          </thead>
          <tbody>
            ${alumnos
              .map((alumno) => {
                const notas = porAlumno.get(alumno.id) ?? {};
                const celdas = PERIODOS.map((p) => {
                  const registro = notas[`${seleccion.materia}|${p.valor}`];
                  const valor = registro?.calificacion ?? '';
                  return `<td class="tabla__num">
                      <input class="input input--nota" type="number" min="0" max="10" step="0.1"
                             value="${valor === '' ? '' : valor}"
                             data-alumno="${alumno.id}" data-periodo="${p.valor}"
                             aria-label="Calificación de ${escapeHTML(alumno.nombre)} en ${p.etiqueta}" />
                    </td>`;
                }).join('');

                const notasMateria = PERIODOS.map((p) => notas[`${seleccion.materia}|${p.valor}`]?.calificacion).filter(
                  (n) => n !== null && n !== undefined,
                );
                const media = promedio(notasMateria);

                return `
                  <tr>
                    <td>
                      <div class="celda-principal">
                        <span class="celda-principal__titulo">${escapeHTML([alumno.nombre, alumno.apellidos].filter(Boolean).join(' '))}</span>
                        <span class="celda-principal__meta">${escapeHTML(alumno.codigo)}</span>
                      </div>
                    </td>
                    ${celdas}
                    <td class="tabla__num mono" data-final="${alumno.id}">${media ?? '—'}</td>
                  </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </div>`;

    const guardar = retrasar(async (input) => {
      const alumnoId = input.dataset.alumno;
      const periodo = input.dataset.periodo;
      const valor = input.value === '' ? null : Number(input.value);

      if (valor !== null && (Number.isNaN(valor) || valor < 0 || valor > 10)) {
        aviso('La calificación debe estar entre 0 y 10', 'error');
        input.value = '';
        return;
      }

      try {
        await guardarCalificacion({
          alumno_id: alumnoId,
          grupo_id: seleccion.grupoId,
          materia: seleccion.materia,
          periodo,
          calificacion: valor,
          docente_id: estado.perfil?.id ?? null,
          fecha: new Date().toISOString().slice(0, 10),
        });

        const fila = input.closest('tr');
        const notas = [...fila.querySelectorAll('.input--nota')]
          .map((i) => (i.value === '' ? null : Number(i.value)))
          .filter((n) => n !== null);
        const media = promedio(notas);
        const celdaFinal = fila.querySelector(`[data-final="${alumnoId}"]`);
        if (celdaFinal) celdaFinal.textContent = media ?? '—';
      } catch (error) {
        aviso(error.message || 'No se pudo guardar la calificación', 'error');
      }
    }, 550);

    tabla.querySelectorAll('.input--nota').forEach((input) => {
      input.addEventListener('input', () => guardar(input));
      input.addEventListener('blur', () => guardar(input));
    });

    const capturadas = [...porAlumno.values()].filter(
      (notas) => notas[`${seleccion.materia}|${seleccion.periodo}`]?.calificacion !== undefined,
    ).length;
    resumen.textContent = `${capturadas} de ${alumnos.length} capturadas en ${etiquetaPeriodo(seleccion.periodo)}`;
  };

  selGrupo.addEventListener('change', pintar);
  selPeriodo.addEventListener('change', pintar);
  selMateria.addEventListener('input', retrasar(pintar, 400));
  selMateria.addEventListener('change', pintar);

  contenido.querySelector('#btn-grupos')?.addEventListener('click', () => {
    window.location.hash = '#/configuracion';
  });

  await pintar();
}
