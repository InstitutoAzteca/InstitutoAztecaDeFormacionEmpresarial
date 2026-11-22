// app.js — punto de entrada: sesión, navegación por hash y montaje de vistas.

import { supabase } from './supabase-client.js';
import { ROL } from './config.js';
import { estado, setEstado, cargarConfig, pintarCiclo } from './state.js';
import { entrar, salir, cargarPerfil } from './services/auth.js';
import { aviso, ICONO, iniciales, colorAvatar, escapeHTML } from './utils/ui.js';
import { montarLogin } from './views/login.js';
import { renderPanel } from './views/panel.js';
import { renderAlumnos } from './views/alumnos.js';
import { renderPagos } from './views/pagos.js';
import { renderCalificaciones } from './views/calificaciones.js';
import { renderDocumentos } from './views/documentos.js';
import { renderEstadisticas } from './views/estadisticas.js';
import { renderUsuarios } from './views/usuarios.js';
import { renderConfiguracion } from './views/configuracion.js';

const NAV = [
  {
    grupo: 'Operación',
    items: [
      { ruta: 'panel', etiqueta: 'Panel', icono: ICONO.panel, roles: [ROL.ADMIN, ROL.MAESTRA], vista: renderPanel },
      { ruta: 'alumnos', etiqueta: 'Alumnos', icono: ICONO.alumnos, roles: [ROL.ADMIN, ROL.MAESTRA], vista: renderAlumnos },
      { ruta: 'pagos', etiqueta: 'Mensualidades', icono: ICONO.pagos, roles: [ROL.ADMIN], vista: renderPagos },
      { ruta: 'calificaciones', etiqueta: 'Calificaciones', icono: ICONO.calificaciones, roles: [ROL.ADMIN, ROL.MAESTRA], vista: renderCalificaciones },
      { ruta: 'documentos', etiqueta: 'Documentos', icono: ICONO.documentos, roles: [ROL.ADMIN], vista: renderDocumentos },
    ],
  },
  {
    grupo: 'Análisis',
    items: [
      { ruta: 'estadisticas', etiqueta: 'Estadísticas', icono: ICONO.estadisticas, roles: [ROL.ADMIN], vista: renderEstadisticas },
    ],
  },
  {
    grupo: 'Administración',
    items: [
      { ruta: 'usuarios', etiqueta: 'Usuarios', icono: ICONO.usuarios, roles: [ROL.ADMIN], vista: renderUsuarios },
      { ruta: 'configuracion', etiqueta: 'Configuración', icono: ICONO.ajustes, roles: [ROL.ADMIN], vista: renderConfiguracion },
    ],
  },
];

// ------------------------------------------------------------- navegación --
function rutaActual() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const partes = hash.split('/').filter(Boolean);
  return { seccion: partes[0] || 'panel', parametro: partes[1] ?? null };
}

function itemsVisibles() {
  const rol = estado.perfil?.rol;
  return NAV
    .map((grupo) => ({
      ...grupo,
      items: grupo.items.filter((item) => item.roles.includes(rol)),
    }))
    .filter((grupo) => grupo.items.length);
}

function pintarNavegacion() {
  const nav = document.getElementById('lateral-nav');
  if (!nav) return;

  const { seccion } = rutaActual();
  nav.innerHTML = itemsVisibles()
    .map(
      (grupo) => `
      <div class="lateral__grupo">
        <p class="lateral__grupo-titulo">${escapeHTML(grupo.grupo)}</p>
        ${grupo.items
          .map(
            (item) => `
          <button class="lateral__enlace ${item.ruta === seccion ? 'is-activo' : ''}" type="button" data-ruta="${item.ruta}">
            ${item.icono}
            <span>${escapeHTML(item.etiqueta)}</span>
          </button>`,
          )
          .join('')}
      </div>`,
    )
    .join('');

  nav.querySelectorAll('[data-ruta]').forEach((boton) => {
    boton.addEventListener('click', () => {
      window.location.hash = `#/${boton.dataset.ruta}`;
      cerrarMenuMovil();
    });
  });
}

function pintarUsuario() {
  const perfil = estado.perfil;
  if (!perfil) return;
  const avatar = document.getElementById('usuario-avatar');
  const nombre = document.getElementById('usuario-nombre');
  const rol = document.getElementById('usuario-rol');

  const nombreCompleto = [perfil.nombre, perfil.apellidos].filter(Boolean).join(' ');
  avatar.textContent = iniciales(perfil.nombre, perfil.apellidos);
  avatar.style.background = colorAvatar(nombreCompleto);
  nombre.textContent = nombreCompleto || perfil.correo || '';
  rol.textContent = perfil.rol === ROL.ADMIN ? 'Administrador' : 'Maestra';

  const chip = document.getElementById('ciclo-valor');
  if (chip) chip.textContent = estado.config?.ciclo_activo || 'Sin definir';
  pintarCiclo();
}

function cerrarMenuMovil() {
  document.getElementById('lateral')?.classList.remove('is-abierto');
  document.getElementById('app-velo')?.setAttribute('hidden', '');
  document.getElementById('btn-menu')?.setAttribute('aria-expanded', 'false');
}

// ---------------------------------------------------------------- vistas ---
async function renderRuta() {
  const contenido = document.getElementById('contenido');
  if (!contenido) return;

  const { seccion, parametro } = rutaActual();
  const rol = estado.perfil?.rol;

  const item = itemsVisibles()
    .flatMap((g) => g.items)
    .find((i) => i.ruta === seccion);

  if (!item) {
    window.location.hash = '#/panel';
    return;
  }

  const titulo = item.etiqueta;
  document.getElementById('miga-actual').textContent = titulo;
  pintarNavegacion();

  contenido.innerHTML = `
    <div class="cargando">
      <span class="cargando__giro"></span>
      <span>Cargando…</span>
    </div>`;

  try {
    await item.vista(contenido, { parametro, rol, perfil: estado.perfil });
  } catch (error) {
    console.error('[app] error al renderizar la vista', error);
    contenido.innerHTML = `
      <div class="vacio">
        <h2 class="vacio__titulo">No se pudo cargar esta sección</h2>
        <p class="vacio__texto">${escapeHTML(error.message || 'Ocurrió un error inesperado.')}</p>
        <button class="btn btn--borde" type="button" onclick="location.reload()">Recargar</button>
      </div>`;
  }
}

// --------------------------------------------------------------- sesión ---
function mostrarLogin() {
  document.getElementById('app-view').setAttribute('hidden', '');
  document.getElementById('login-view').removeAttribute('hidden');
  montarLogin({
    alEntrar: async ({ user, session }) => {
      const perfil = await cargarPerfil(user);
      if (!perfil) {
        await salir();
        aviso('Tu cuenta no está registrada en la plataforma. Contacta al administrador.', 'error', 6000);
        return;
      }
      setEstado({ sesion: session, usuario: user, perfil, cargando: false });
      await mostrarApp();
    },
  });
}

async function mostrarApp() {
  document.getElementById('login-view').setAttribute('hidden', '');
  document.getElementById('app-view').removeAttribute('hidden');

  await cargarConfig();
  pintarUsuario();
  pintarNavegacion();

  if (!window.location.hash) window.location.hash = '#/panel';
  await renderRuta();
}

async function manejarSesion(sesion) {
  if (!sesion) {
    setEstado({ sesion: null, usuario: null, perfil: null, cargando: false });
    mostrarLogin();
    return;
  }
  const perfil = await cargarPerfil(sesion.user);
  if (!perfil) {
    await salir();
    setEstado({ sesion: null, usuario: null, perfil: null, cargando: false });
    mostrarLogin();
    aviso('Tu cuenta no está registrada en la plataforma. Contacta al administrador.', 'error', 6000);
    return;
  }
  setEstado({ sesion, usuario: sesion.user, perfil, cargando: false });
  await mostrarApp();
}

// ---------------------------------------------------------------- inicio ---
async function iniciar() {
  document.getElementById('btn-menu')?.addEventListener('click', () => {
    const lateral = document.getElementById('lateral');
    const velo = document.getElementById('app-velo');
    const abierto = lateral.classList.toggle('is-abierto');
    velo.toggleAttribute('hidden', !abierto);
    document.getElementById('btn-menu').setAttribute('aria-expanded', String(abierto));
  });

  document.getElementById('app-velo')?.addEventListener('click', cerrarMenuMovil);

  document.getElementById('btn-salir')?.addEventListener('click', async () => {
    await salir();
    setEstado({ sesion: null, usuario: null, perfil: null, config: null });
    window.location.hash = '';
    mostrarLogin();
    aviso('Sesión cerrada', 'info', 2500);
  });

  window.addEventListener('hashchange', () => {
    if (estado.sesion) renderRuta();
  });

  supabase.auth.onAuthStateChange((evento, sesion) => {
    if (evento === 'SIGNED_OUT') {
      setEstado({ sesion: null, usuario: null, perfil: null });
      mostrarLogin();
    }
  });

  const { data } = await supabase.auth.getSession();
  await manejarSesion(data?.session ?? null);
}

iniciar().catch((error) => {
  console.error('[app] error al iniciar', error);
  aviso('No se pudo iniciar la aplicación. Recarga la página.', 'error', 6000);
});
