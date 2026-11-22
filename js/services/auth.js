// services/auth.js — autenticación, perfil y gestión de cuentas.

import { supabase } from '../supabase-client.js';
import { EDGE_FUNCTIONS, ROL, SUPABASE_KEY, TABLAS } from '../config.js';
import { listar, obtener } from './db.js';

/** Traduce los errores de Supabase a mensajes comprensibles. */
function traducirError(mensaje = '') {
  const m = mensaje.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'Tu cuenta todavía no ha sido confirmada.';
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'Ya existe una cuenta con ese correo electrónico.';
  }
  if (m.includes('password should be at least')) return 'La contraseña debe tener al menos 8 caracteres.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos. Espera un momento e intenta de nuevo.';
  if (m.includes('failed to fetch')) return 'No se pudo contactar al servidor. Revisa tu conexión.';
  return mensaje || 'Ocurrió un error inesperado.';
}

/** Inicia sesión con correo y contraseña. Devuelve { user, session }. */
export async function entrar(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email).trim().toLowerCase(),
    password,
  });
  if (error) throw new Error(traducirError(error.message));
  return { user: data.user, session: data.session };
}

/** Cierra la sesión. */
export async function salir() {
  await supabase.auth.signOut();
}

/** Carga el perfil de personal del usuario autenticado. */
export async function cargarPerfil(usuario) {
  if (!usuario) return null;
  const perfil = await obtener(TABLAS.personal, usuario.id);
  if (!perfil) return null;
  return { ...perfil, correo: usuario.email };
}

/** Lista el equipo de trabajo (administradores y maestras). */
export async function listarPersonal() {
  return listar(TABLAS.personal, {
    orden: { columna: 'nombre', asc: true },
  });
}

/** Invoca la Edge Function de gestión de personal. */
async function invocarFuncion(cuerpo, token = null) {
  const headers = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_KEY,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let respuesta;
  try {
    respuesta = await fetch(EDGE_FUNCTIONS, {
      method: 'POST',
      headers,
      body: JSON.stringify(cuerpo),
    });
  } catch (error) {
    throw new Error('No se pudo contactar al servidor de cuentas. Revisa tu conexión.');
  }

  let datos = {};
  try {
    datos = await respuesta.json();
  } catch {
    datos = {};
  }

  if (!respuesta.ok || datos.ok === false) {
    throw new Error(datos.error || 'La operación no se pudo completar.');
  }
  return datos;
}

/** Estado de arranque: ¿ya existe una cuenta de administrador? */
export async function estadoPlataforma() {
  try {
    return await invocarFuncion({ accion: 'status' });
  } catch (error) {
    console.warn('[auth] no se pudo leer el estado de la plataforma', error);
    return { hayAdmin: true, requiereBootstrap: false };
  }
}

/** Crea la primera cuenta de administrador (requiere el código de arranque). */
export async function crearAdministradorInicial(datos) {
  return invocarFuncion({ accion: 'bootstrap-admin', ...datos });
}

/** Crea una cuenta de maestra o administrador (requiere sesión de administrador). */
export async function crearCuenta(datos, sesion) {
  return invocarFuncion({ accion: 'create-user', ...datos }, sesion);
}

/** Restablece la contraseña de una cuenta. */
export async function restablecerContrasena(datos, sesion) {
  return invocarFuncion({ accion: 'reset-password', ...datos }, sesion);
}

/** Activa o desactiva una cuenta. */
export async function cambiarActivo(id, activo, sesion) {
  return invocarFuncion({ accion: 'set-active', id, activo }, sesion);
}

/** Cambia el rol de una cuenta. */
export async function cambiarRol(id, rol, sesion) {
  return invocarFuncion({ accion: 'set-role', id, rol }, sesion);
}

/** La cuenta autenticada cambia su propia contraseña. */
export async function cambiarMiContrasena(actual, nueva, sesion) {
  return invocarFuncion({ accion: 'cambiar-mi-contrasena', actual, password: nueva }, sesion);
}

/** ¿La sesión actual tiene permisos de administrador? */
export function esAdmin(perfil) {
  return perfil?.rol === ROL.ADMIN && perfil?.activo !== false;
}

/** ¿La sesión actual es del personal de la plataforma? */
export function esPersonal(perfil) {
  return Boolean(perfil?.rol) && perfil?.activo !== false;
}
