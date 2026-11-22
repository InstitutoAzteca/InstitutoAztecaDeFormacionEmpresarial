// views/usuarios.js — gestión de cuentas del equipo (administradores y maestras).

import { ROL, ETIQUETA_ROL } from '../config.js';
import { estado } from '../state.js';
import { listarPersonal, crearCuenta, restablecerContrasena, cambiarActivo, cambiarRol } from '../services/auth.js';
import { escapeHTML, aviso, abrirModal, confirmar, iniciales, colorAvatar, ICONO } from '../utils/ui.js';
import { formatoFecha } from '../utils/dates.js';

export async function renderUsuarios(contenido) {
  const personal = await listarPersonal();

  contenido.innerHTML = `
    <div class="pagina">
      <div class="pagina__cabecera">
        <div>
          <p class="antetitulo">Administración</p>
          <h1 class="pagina__titulo">Usuarios</h1>
          <p class="pagina__sub">Cuentas con acceso a la plataforma. La maestra captura calificaciones; el administrador gestiona todo.</p>
        </div>
        <div class="pagina__acciones">
          <button class="btn btn--primario" type="button" id="btn-nueva-cuenta">${ICONO.agregar} Nueva cuenta</button>
        </div>
      </div>

      <section class="tarjeta">
        <div class="tarjeta__cabecera">
          <h2 class="tarjeta__titulo">Equipo</h2>
          <span class="pequeno tenue">${personal.length} cuenta(s)</span>
        </div>
        <div class="tarjeta__cuerpo tarjeta__cuerpo--liso" id="lista-usuarios">
          <div class="cargando"><span class="cargando__giro"></span></div>
        </div>
      </section>
    </div>`;

  const lista = contenido.querySelector('#lista-usuarios');

  const pintar = () => {
    if (!personal.length) {
      lista.innerHTML = `
        <div class="vacio" style="border:0">
          <h3 class="vacio__titulo">Sin cuentas registradas</h3>
          <p class="vacio__texto">Crea la primera cuenta de maestra para que pueda capturar calificaciones.</p>
        </div>`;
      return;
    }

    lista.innerHTML = `
      <div class="tabla-envoltura">
        <table class="tabla">
          <thead>
            <tr><th>Cuenta</th><th>Rol</th><th>Alta</th><th>Estado</th><th class="tabla__acciones"></th></tr>
          </thead>
          <tbody>
            ${personal
              .map((persona) => {
                const nombre = [persona.nombre, persona.apellidos].filter(Boolean).join(' ');
                const esPropia = persona.id === estado.perfil?.id;
                return `
                <tr>
                  <td>
                    <div class="fila">
                      <span class="avatar" style="background:${colorAvatar(nombre)}">${escapeHTML(iniciales(persona.nombre, persona.apellidos))}</span>
                      <div class="celda-principal">
                        <span class="celda-principal__titulo">${escapeHTML(nombre)}${esPropia ? ' · tú' : ''}</span>
                        <span class="celda-principal__meta">${escapeHTML(persona.email)}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <select class="select select--corta" data-rol="${persona.id}" ${esPropia ? 'disabled' : ''}>
                      <option value="maestra" ${persona.rol === 'maestra' ? 'selected' : ''}>Maestra</option>
                      <option value="administrador" ${persona.rol === 'administrador' ? 'selected' : ''}>Administrador</option>
                    </select>
                  </td>
                  <td class="pequeno tenue">${escapeHTML(formatoFecha(persona.creado_en))}</td>
                  <td>${
                    persona.activo
                      ? '<span class="pastilla pastilla--exito">Activo</span>'
                      : '<span class="pastilla pastilla--neutro">Desactivado</span>'
                  }</td>
                  <td class="tabla__acciones">
                    <button class="btn btn--sm btn--borde" type="button" data-password="${persona.id}">Contraseña</button>
                    ${esPropia ? '' : `<button class="btn btn--sm btn--fantasma" type="button" data-activo="${persona.id}" data-estado="${persona.activo}">${persona.activo ? 'Desactivar' : 'Activar'}</button>`}
                  </td>
                </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </div>`;

    lista.querySelectorAll('[data-rol]').forEach((select) => {
      select.addEventListener('change', async () => {
        try {
          await cambiarRol(select.dataset.rol, select.value, estado.sesion?.access_token);
          aviso('Rol actualizado', 'exito');
        } catch (error) {
          aviso(error.message, 'error');
        }
      });
    });

    lista.querySelectorAll('[data-password]').forEach((boton) => {
      boton.addEventListener('click', () => {
        const persona = personal.find((p) => p.id === boton.dataset.password);
        abrirFormularioPassword(persona);
      });
    });

    lista.querySelectorAll('[data-activo]').forEach((boton) => {
      boton.addEventListener('click', async () => {
        const persona = personal.find((p) => p.id === boton.dataset.activo);
        const nuevoEstado = boton.dataset.estado !== 'true';
        const ok = await confirmar({
          titulo: nuevoEstado ? 'Activar cuenta' : 'Desactivar cuenta',
          mensaje: nuevoEstado
            ? `${persona.nombre} podrá volver a entrar a la plataforma.`
            : `${persona.nombre} perderá el acceso de inmediato.`,
          textoOk: nuevoEstado ? 'Activar' : 'Desactivar',
          peligro: !nuevoEstado,
        });
        if (!ok) return;
        try {
          await cambiarActivo(persona.id, nuevoEstado, estado.sesion?.access_token);
          persona.activo = nuevoEstado;
          aviso(`Cuenta ${nuevoEstado ? 'activada' : 'desactivada'}`, 'exito');
          pintar();
        } catch (error) {
          aviso(error.message, 'error');
        }
      });
    });
  };

  contenido.querySelector('#btn-nueva-cuenta').addEventListener('click', () => {
    abrirFormularioCuenta(async () => {
      const actualizado = await listarPersonal();
      personal.length = 0;
      personal.push(...actualizado);
      pintar();
    });
  });

  pintar();
}

function abrirFormularioCuenta(alGuardar) {
  const modal = abrirModal({
    titulo: 'Nueva cuenta',
    subtitulo: 'La cuenta se crea activada y con una contraseña temporal.',
    cuerpo: `
      <form class="form" id="form-cuenta" novalidate>
        <div class="rejilla">
          <div class="campo">
            <label class="etiqueta" for="cu-nombre">Nombre(s) <span class="etiqueta__req">*</span></label>
            <input class="input" id="cu-nombre" name="nombre" required />
          </div>
          <div class="campo">
            <label class="etiqueta" for="cu-apellidos">Apellidos</label>
            <input class="input" id="cu-apellidos" name="apellidos" />
          </div>
        </div>
        <div class="rejilla">
          <div class="campo">
            <label class="etiqueta" for="cu-email">Correo electrónico <span class="etiqueta__req">*</span></label>
            <input class="input" type="email" id="cu-email" name="email" required />
          </div>
          <div class="campo">
            <label class="etiqueta" for="cu-telefono">Teléfono</label>
            <input class="input" id="cu-telefono" name="telefono" />
          </div>
        </div>
        <div class="rejilla">
          <div class="campo">
            <label class="etiqueta" for="cu-rol">Rol</label>
            <select class="select" id="cu-rol" name="rol">
              <option value="maestra">Maestra</option>
              <option value="administrador">Administrador</option>
            </select>
          </div>
          <div class="campo">
            <label class="etiqueta" for="cu-password">Contraseña temporal <span class="etiqueta__req">*</span></label>
            <input class="input" id="cu-password" name="password" minlength="8" required />
            <span class="ayuda">Mínimo 8 caracteres. Compártela con la persona y pídele que la cambie al entrar.</span>
          </div>
        </div>
        <p class="alerta alerta--error" id="cu-error" hidden></p>
      </form>`,
    pie: `
      <button class="btn btn--borde" type="button" data-cerrar>Cancelar</button>
      <button class="btn btn--primario" type="submit" form="form-cuenta">Crear cuenta</button>`,
  });

  modal.panel.querySelector('[data-cerrar]').addEventListener('click', () => modal.close());

  const form = modal.panel.querySelector('#form-cuenta');
  const error = modal.panel.querySelector('#cu-error');

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    error.setAttribute('hidden', '');

    const datos = Object.fromEntries(new FormData(form).entries());
    if (!datos.nombre?.trim() || !datos.email?.trim() || datos.password.length < 8) {
      error.textContent = 'Completa nombre, correo y una contraseña de al menos 8 caracteres.';
      error.removeAttribute('hidden');
      return;
    }

    try {
      await crearCuenta(datos, estado.sesion?.access_token);
      aviso('Cuenta creada', 'exito');
      modal.close();
      if (alGuardar) alGuardar();
    } catch (errorCuenta) {
      error.textContent = errorCuenta.message || 'No se pudo crear la cuenta.';
      error.removeAttribute('hidden');
    }
  });
}

function abrirFormularioPassword(persona) {
  const modal = abrirModal({
    titulo: 'Restablecer contraseña',
    subtitulo: persona.email,
    tamano: 'angosto',
    cuerpo: `
      <form class="form" id="form-password" novalidate>
        <div class="campo">
          <label class="etiqueta" for="pw-nueva">Contraseña nueva <span class="etiqueta__req">*</span></label>
          <input class="input" id="pw-nueva" name="password" minlength="8" required />
          <span class="ayuda">Mínimo 8 caracteres.</span>
        </div>
        <p class="alerta alerta--error" id="pw-error" hidden></p>
      </form>`,
    pie: `
      <button class="btn btn--borde" type="button" data-cerrar>Cancelar</button>
      <button class="btn btn--primario" type="submit" form="form-password">Restablecer</button>`,
  });

  modal.panel.querySelector('[data-cerrar]').addEventListener('click', () => modal.close());

  const form = modal.panel.querySelector('#form-password');
  const error = modal.panel.querySelector('#pw-error');

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    error.setAttribute('hidden', '');
    const password = form.password.value;
    if (password.length < 8) {
      error.textContent = 'La contraseña debe tener al menos 8 caracteres.';
      error.removeAttribute('hidden');
      return;
    }
    try {
      await restablecerContrasena({ email: persona.email, password }, estado.sesion?.access_token);
      aviso('Contraseña restablecida', 'exito');
      modal.close();
    } catch (errorPassword) {
      error.textContent = errorPassword.message || 'No se pudo restablecer la contraseña.';
      error.removeAttribute('hidden');
    }
  });
}
