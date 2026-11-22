// supabase-client.js — instancia única de Supabase para la aplicación.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storageKey: 'iafe-admin-session',
  },
});

/** Cierra la sesión local y revoca el refresh token en el servidor. */
export async function cerrarSesion() {
  try {
    await supabase.auth.signOut();
  } catch (error) {
    console.warn('[supabase] error al cerrar sesión', error);
  }
}
