// views/login.js — acceso a la plataforma y arranque de la cuenta administradora.

import { entrar, estadoPlataforma, crearAdministradorInicial } from '../services/auth.js';
import { aviso, abrirModal, escapeHTML } from '../utils/ui.js';

export function montarLogin({ alEntrar }) {
  const form = document.getElementById('login-form');
  const inputEmail = document.getElementById('login-email');
  const inputPassword = document.getElementById('login-password');
  const error = document.getElementById('login-error');
  const boton = document.getElementById('login-enviar');
  const btnVer = document.getElementById('login-ver');
  const btnBootstrap = document.getElementById('btn-bootstrap');

  const mostrarError = (mensaje) => {
    error.textContent = mensaje;
    error.removeAttribute('hidden');
  };

  const limpiarError = () => error.setAttribute('hidden', '');

  form?.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    limpiarError();

    const email = inputEmail.value.trim();
    const password = inputPassword.value;

    if (!email || !password) {
      mostrarError('Escribe tu correo y tu contraseña.');
      return;
    }

    boton.disabled = true;
    boton.textContent = 'Entrando…';

    try {
      const usuario = await entrar(email, password);
      await alEntrar(usuario);
    } catch (errorEntrada) {
      mostrarError(errorEntrada.message);
    } finally {
      boton.disabled = false;
      boton.textContent = 'Entrar';
    }
  });

  btnVer?.addEventListener('click', () => {
    const visible = inputPassword.type === 'text';
    inputPassword.type = visible ? 'password' : 'text';
    btnVer.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
  });

  // ¿La plataforma todavía no tiene administrador?
  (async () => {
    try {
      const info = await estadoPlataforma();
      if (info.requiereBootstrap) {
        btnBootstrap?.removeAttribute('hidden');
        document.getElementById('login-titulo').textContent = 'Primer acceso';
        document.getElementById('login-subtitulo').textContent =
          'Crea la cuenta de administrador que gestionará la plataforma.';
      } else {
        btnBootstrap?.setAttribute('hidden', '');
      }
    } catch {
      /* si no se puede leer el estado, se mantiene el acceso normal */
    }
  })();

  btnBootstrap?.addEventListener('click', () => abrirArranque(alEntrar));
}

function abrirArranque(alEntrar) {
  const modal = abrirModal({
    titulo: 'Cuenta de administrador',
    subtitulo: 'Se creará la primera cuenta de la plataforma. Compártela con tu equipo.',
    cuerpo: `
      <form class="form" id="form-arranque" novalidate>
        <div class="campo">
          <label class="etiqueta" for="arq-codigo">Código de arranque</label>
          <input class="input input--mono" id="arq-codigo" name="codigo" placeholder="IAFE-BOOT-…" required />
          <span class="ayuda">Aparece en el README del proyecto.</span>
        </div>
        <div class="rejilla">
          <div class="campo">
            <label class="etiqueta" for="arq-nombre">Nombre(s) <span class="etiqueta__req">*</span></label>
            <input class="input" id="arq-nombre" name="nombre" required />
          </div>
          <div class="campo">
            <label class="etiqueta" for="arq-apellidos">Apellidos</label>
            <input class="input" id="arq-apellidos" name="apellidos" />
          </div>
        </div>
        <div class="campo">
          <label class="etiqueta" for="arq-email">Correo electrónico <span class="etiqueta__req">*</span></label>
          <input class="input" type="email" id="arq-email" name="email" required />
        </div>
        <div class="campo">
          <label class="etiqueta" for="arq-password">Contraseña <span class="etiqueta__req">*</span></label>
          <input class="input" type="password" id="arq-password" name="password" minlength="8" required />
          <span class="ayuda">Mínimo 8 caracteres.</span>
        </div>
        <p class="alerta alerta--error" id="arq-error" hidden></p>
      </form>`,
    pie: `
      <button class="btn btn--borde" type="button" data-cerrar-modal>Cancelar</button>
      <button class="btn btn--primario" type="submit" form="form-arranque">Crear administrador</button>`,
  });

  const form = modal.panel.querySelector('#form-arranque');
  const error = modal.panel.querySelector('#arq-error');
  const boton = modal.panel.querySelector('[type="submit"]');

  modal.panel.querySelector('[data-cerrar-modal]').addEventListener('click', () => modal.close());

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    error.setAttribute('hidden', '');
    boton.disabled = true;

    const datos = {
      codigo: form.codigo.value.trim(),
      nombre: form.nombre.value.trim(),
      apellidos: form.apellidos.value.trim(),
      email: form.email.value.trim(),
      password: form.password.value,
    };

    try {
      await crearAdministradorInicial(datos);
      modal.close();
      aviso('Cuenta de administrador creada. Ya puedes iniciar sesión.', 'exito', 5000);
      document.getElementById('login-email').value = datos.email;
    } catch (errorArranque) {
      error.textContent = errorArranque.message;
      error.removeAttribute('hidden');
    } finally {
      boton.disabled = false;
    }
  });
}
