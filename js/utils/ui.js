// utils/ui.js — utilidades de interfaz: escape, avisos, modales, paneles e iconos.

export function escapeHTML(valor = '') {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function iniciales(nombre = '', apellidos = '') {
  const a = String(nombre).trim().charAt(0);
  const b = String(apellidos).trim().charAt(0);
  return `${a}${b}`.toUpperCase() || '··';
}

/** Color estable derivado del nombre (para los avatares). */
export function colorAvatar(texto = '') {
  const paleta = ['#0B2F5B', '#14457F', '#0F7B5A', '#A96A12', '#5B3A8E', '#8A3B2E', '#1F5FA8'];
  let suma = 0;
  for (const c of String(texto)) suma += c.charCodeAt(0);
  return paleta[suma % paleta.length];
}

// --------------------------------------------------------------- avisos ---
const ICONOS_AVISO = {
  exito: '<svg class="aviso__icono" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z" clip-rule="evenodd"/></svg>',
  error: '<svg class="aviso__icono" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.7 7.3a1 1 0 00-1.4 1.4L8.6 10l-1.3 1.3a1 1 0 101.4 1.4L10 11.4l1.3 1.3a1 1 0 001.4-1.4L11.4 10l1.3-1.3a1 1 0 00-1.4-1.4L10 8.6 8.7 7.3z" clip-rule="evenodd"/></svg>',
  info: '<svg class="aviso__icono" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>',
};

export function aviso(mensaje, tipo = 'info', duracion = 4000) {
  const raiz = document.getElementById('toast-root');
  if (!raiz) return;
  const el = document.createElement('div');
  el.className = `aviso aviso--${tipo}`;
  el.innerHTML = `${ICONOS_AVISO[tipo] ?? ICONOS_AVISO.info}<span>${escapeHTML(mensaje)}</span>`;
  raiz.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 160ms, transform 160ms';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 180);
  }, duracion);
}

// --------------------------------------------------------------- modales ---
/**
 * Abre un modal. Devuelve { close, panel }.
 */
export function abrirModal({ titulo, subtitulo, cuerpo, pie, tamano = 'md', alCerrar }) {
  const raiz = document.getElementById('modal-root');
  if (!raiz) return { close() {}, panel: null };

  raiz.innerHTML = '';
  const previo = document.activeElement;
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  fondo.setAttribute('role', 'dialog');
  fondo.setAttribute('aria-modal', 'true');
  fondo.setAttribute('aria-label', titulo || 'Diálogo');

  const claseTamano = {
    angosto: 'modal--angosto',
    ancho: 'modal--ancho',
    'ancho-2': 'modal--ancho-2',
  }[tamano] ?? '';

  fondo.innerHTML = `
    <div class="modal ${claseTamano}">
      <div class="modal__cabecera">
        <div>
          <h2 class="modal__titulo">${escapeHTML(titulo || '')}</h2>
          ${subtitulo ? `<p class="modal__sub">${escapeHTML(subtitulo)}</p>` : ''}
        </div>
        <button class="modal__cerrar" type="button" data-cerrar aria-label="Cerrar">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M4.3 4.3a1 1 0 011.4 0L10 8.6l4.3-4.3a1 1 0 011.4 1.4L11.4 10l4.3 4.3a1 1 0 01-1.4 1.4L10 11.4l-4.3 4.3a1 1 0 01-1.4-1.4L8.6 10 4.3 5.7a1 1 0 010-1.4z" clip-rule="evenodd"/></svg>
        </button>
      </div>
      <div class="modal__cuerpo">${cuerpo}</div>
      ${pie ? `<div class="modal__pie">${pie}</div>` : ''}
    </div>`;

  raiz.appendChild(fondo);

  const cerrar = () => {
    raiz.innerHTML = '';
    document.removeEventListener('keydown', alTeclear);
    if (previo && typeof previo.focus === 'function') previo.focus();
    if (alCerrar) alCerrar();
  };

  function alTeclear(e) {
    if (e.key === 'Escape') { e.preventDefault(); cerrar(); return; }
    if (e.key === 'Tab') {
      const focusables = fondo.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const primero = focusables[0];
      const ultimo = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    }
  }

  document.addEventListener('keydown', alTeclear);
  fondo.addEventListener('click', (e) => { if (e.target === fondo) cerrar(); });
  fondo.querySelector('[data-cerrar]')?.addEventListener('click', cerrar);

  setTimeout(() => {
    fondo.querySelector('input:not([type=hidden]), select, textarea, button')?.focus();
  }, 60);

  return { close: cerrar, panel: fondo.querySelector('.modal') };
}

/** Confirmación con promesa. */
export function confirmar({
  titulo = '¿Confirmar?',
  mensaje = '',
  textoOk = 'Confirmar',
  textoCancelar = 'Cancelar',
  peligro = false,
}) {
  return new Promise((resolver) => {
    const m = abrirModal({
      titulo,
      tamano: 'angosto',
      cuerpo: `<p class="pequeno">${escapeHTML(mensaje)}</p>`,
      pie: `
        <button class="btn btn--borde" type="button" data-cancelar>${escapeHTML(textoCancelar)}</button>
        <button class="btn ${peligro ? 'btn--peligro' : 'btn--primario'}" type="button" data-ok>${escapeHTML(textoOk)}</button>`,
    });
    m.panel.querySelector('[data-cancelar]').addEventListener('click', () => { m.close(); resolver(false); });
    m.panel.querySelector('[data-ok]').addEventListener('click', () => { m.close(); resolver(true); });
  });
}

/**
 * Panel lateral derecho. Devuelve { close, panel }.
 */
export function abrirPanel({ titulo, subtitulo, cuerpo, pie, ancho = false, alCerrar }) {
  const raiz = document.getElementById('modal-root');
  if (!raiz) return { close() {}, panel: null };

  raiz.innerHTML = '';
  const previo = document.activeElement;
  const fondo = document.createElement('div');
  fondo.className = 'drawer-fondo';
  fondo.setAttribute('role', 'dialog');
  fondo.setAttribute('aria-modal', 'true');
  fondo.setAttribute('aria-label', titulo || 'Panel');

  fondo.innerHTML = `
    <div class="drawer ${ancho ? 'drawer--ancho' : ''}">
      <div class="drawer__cabecera">
        <div>
          <h2 class="modal__titulo">${escapeHTML(titulo || '')}</h2>
          ${subtitulo ? `<p class="modal__sub">${escapeHTML(subtitulo)}</p>` : ''}
        </div>
        <button class="modal__cerrar" type="button" data-cerrar aria-label="Cerrar">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M4.3 4.3a1 1 0 011.4 0L10 8.6l4.3-4.3a1 1 0 011.4 1.4L11.4 10l4.3 4.3a1 1 0 01-1.4 1.4L10 11.4l-4.3 4.3a1 1 0 01-1.4-1.4L8.6 10 4.3 5.7a1 1 0 010-1.4z" clip-rule="evenodd"/></svg>
        </button>
      </div>
      <div class="drawer__cuerpo">${cuerpo}</div>
      ${pie ? `<div class="drawer__pie">${pie}</div>` : ''}
    </div>`;

  raiz.appendChild(fondo);

  const cerrar = () => {
    raiz.innerHTML = '';
    document.removeEventListener('keydown', alTeclear);
    if (previo && typeof previo.focus === 'function') previo.focus();
    if (alCerrar) alCerrar();
  };

  function alTeclear(e) {
    if (e.key === 'Escape') { e.preventDefault(); cerrar(); }
  }

  document.addEventListener('keydown', alTeclear);
  fondo.addEventListener('click', (e) => { if (e.target === fondo) cerrar(); });
  fondo.querySelector('[data-cerrar]')?.addEventListener('click', cerrar);

  return { close: cerrar, panel: fondo.querySelector('.drawer') };
}

// --------------------------------------------------------------- iconos ---
export const ICONO = {
  panel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  alumnos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>',
  pagos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/></svg>',
  calificaciones: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l3-4 3 3 5-7"/></svg>',
  documentos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h6"/></svg>',
  estadisticas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="8"/><rect x="13" y="6" width="3" height="12"/></svg>',
  usuarios: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>',
  ajustes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H7a1.7 1.7 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V7a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" transform="translate(1.5 1.5) scale(0.87)"/></svg>',
  descargar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  agregar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  buscar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>',
  editar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  borrar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
  documento: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  carpeta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h5l2 3h9v13H4z"/></svg>',
  sello: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="5"/><path d="M9 13.5 7 22l5-2 5 2-2-8.5"/></svg>',
  vacio: '<svg class="vacio__icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"/><path d="M4 10h16"/><path d="M10 4v16"/></svg>',
  salir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.2-1.8-.9-2-1-.3-.1-.5-.2-.7.1s-.8 1-1 1.2c-.2.2-.3.2-.6.1-1.3-.6-2.1-1.2-3-2.7-.2-.4.2-.4.6-1.2.1-.2 0-.4 0-.6s-.7-1.6-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.4-1.2 1.2-1.2 2.9s1.2 3.3 1.4 3.6c.2.2 2.4 3.7 5.9 5.2.8.4 1.5.6 2 .7.8.3 1.6.2 2.2.1.7-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.2-.3-.2-.6-.4z"/><path d="M12 2a10 10 0 00-8.6 15L2 22l5.2-1.4A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1112 20.2z"/></svg>',
  reloj: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
};

/** Copia texto al portapapeles con aviso. */
export async function copiar(texto, mensaje = 'Copiado al portapapeles') {
  try {
    await navigator.clipboard.writeText(texto);
    aviso(mensaje, 'exito', 2200);
  } catch {
    const area = document.createElement('textarea');
    area.value = texto;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    aviso(mensaje, 'exito', 2200);
  }
}

/** Descarga un Blob como archivo. */
export function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Normaliza texto para búsquedas: sin acentos, minúsculas. */
export function normalizar(texto = '') {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/** Retrasa la ejecución de una función (para búsquedas en vivo). */
export function retrasar(fn, ms = 220) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
