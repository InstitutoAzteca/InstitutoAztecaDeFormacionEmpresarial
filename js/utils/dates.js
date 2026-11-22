// utils/dates.js — fechas, ciclos y formato de moneda.

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** YYYY-MM-DD en hora local (no UTC) para evitar desfases de un día. */
export function hoyISO(fecha = new Date()) {
  const d = new Date(fecha);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Convierte 'YYYY-MM-DD' a Date local (evita el parseo UTC por defecto). */
export function aFecha(iso) {
  if (!iso) return null;
  if (iso instanceof Date) return iso;
  const soloFecha = String(iso).slice(0, 10);
  const [a, m, d] = soloFecha.split('-').map(Number);
  if (!a || !m || !d) return null;
  return new Date(a, m - 1, d);
}

export function formatoFecha(iso) {
  const d = aFecha(iso);
  if (!d) return '—';
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fechaLarga(iso) {
  const d = aFecha(iso);
  if (!d) return '—';
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatoFechaHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function nombreMes(mes) {
  return MESES[Number(mes) - 1] ?? '';
}

export function nombreMesCorto(mes) {
  return MESES_CORTOS[Number(mes) - 1] ?? '';
}

export function mesActual() {
  return new Date().getMonth() + 1;
}

export function anioActual() {
  return new Date().getFullYear();
}

/** Etiqueta de un periodo mensual: "Agosto 2026". */
export function etiquetaMes(mes, anio) {
  return `${nombreMes(mes)} ${anio}`;
}

/** Formato monetario MXN sin decimales. */
export function dinero(numero) {
  const valor = Number(numero ?? 0);
  return valor.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/** Sólo el número con separador de miles (para tablas). */
export function numero(numero_, decimales = 0) {
  const valor = Number(numero_ ?? 0);
  return valor.toLocaleString('es-MX', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

/** Promedio redondeado a un decimal. */
export function promedio(lista = []) {
  const validos = lista.map(Number).filter((n) => Number.isFinite(n));
  if (!validos.length) return null;
  return Math.round((validos.reduce((a, b) => a + b, 0) / validos.length) * 100) / 100;
}

/** ¿La fecha ISO corresponde al mes en curso? */
export function esMesActual(iso, mes = mesActual(), anio = anioActual()) {
  const d = aFecha(iso);
  if (!d) return false;
  return d.getMonth() + 1 === mes && d.getFullYear() === anio;
}

/** Días transcurridos desde una fecha ISO (0 = hoy). */
export function diasDesde(iso) {
  const d = aFecha(iso);
  if (!d) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.floor((hoy - d) / 86400000);
}

/** Normaliza un teléfono mexicano a un enlace de WhatsApp. */
export function enlaceWhatsApp(telefono = '') {
  const digitos = String(telefono).replace(/\D/g, '');
  if (!digitos) return '';
  if (digitos.length === 10) return `https://wa.me/52${digitos}`;
  if (digitos.startsWith('52') && digitos.length >= 12) return `https://wa.me/${digitos}`;
  return `https://wa.me/${digitos}`;
}

/** Devuelve el nombre completo de un alumno. */
export function nombreCompleto(alumno = {}) {
  return [alumno.nombre, alumno.apellidos].filter(Boolean).join(' ').trim();
}
