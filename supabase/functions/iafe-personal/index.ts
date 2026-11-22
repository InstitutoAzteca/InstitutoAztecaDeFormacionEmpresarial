// =============================================================================
// IAFE — Edge Function `iafe-personal`
//
// Gestión de las cuentas de la plataforma (administradores y maestras) sin
// exponer la clave `service_role` en el cliente y sin depender de SMTP.
//
// Acciones:
//   status           → { hayAdmin, requiereBootstrap }
//   bootstrap-admin  → crea la PRIMERA cuenta de administrador (sólo con código)
//   create-user      → crea maestra/administrador (requiere JWT de administrador)
//   reset-password   → restablece la contraseña (requiere JWT de administrador)
//   set-active       → activa/desactiva una cuenta (requiere JWT de administrador)
//   set-role         → cambia el rol de una cuenta (requiere JWT de administrador)
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-action',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ROLES = ['administrador', 'maestra'];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function fail(message: string, status = 400) {
  return json({ ok: false, error: message }, status);
}

/** Extrae el `sub` (user id) de un JWT sin verificar la firma. */
function jwtSubject(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const data = JSON.parse(json);
    return typeof data.sub === 'string' ? data.sub : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return fail('Método no permitido', 405);
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !serviceKey) {
    return fail('La función no está configurada correctamente', 500);
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const accion = String(body.accion ?? '').trim();
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  // --- utilidades -----------------------------------------------------------
  const leerConfig = async (clave: string): Promise<string> => {
    const { data } = await admin
      .from('iafe_configuracion')
      .select('valor')
      .eq('clave', clave)
      .maybeSingle();
    const valor = (data?.valor ?? null) as unknown;
    if (valor === null || valor === undefined) return '';
    if (typeof valor === 'string') return valor;
    return String(valor);
  };

  const hayAdmin = async (): Promise<boolean> => {
    const { count } = await admin
      .from('iafe_personal')
      .select('id', { count: 'exact', head: true })
      .eq('rol', 'administrador')
      .eq('activo', true);
    return (count ?? 0) > 0;
  };

  /** Devuelve el id del administrador autenticado o null. */
  const adminAutenticado = async (): Promise<string | null> => {
    const uid = jwtSubject(token);
    if (!uid) return null;
    const { data } = await admin
      .from('iafe_personal')
      .select('id, rol, activo')
      .eq('id', uid)
      .maybeSingle();
    if (!data || !data.activo || data.rol !== 'administrador') return null;
    return data.id as string;
  };

  const crearCuenta = async (
    datos: Record<string, unknown>,
    rol: string,
  ): Promise<{ ok: boolean; error?: string; email?: string }> => {
    const email = String(datos.email ?? '').trim().toLowerCase();
    const password = String(datos.password ?? '');
    const nombre = String(datos.nombre ?? '').trim();
    const apellidos = String(datos.apellidos ?? '').trim();
    const telefono = String(datos.telefono ?? '').trim();

    if (!email || !email.includes('@')) return { ok: false, error: 'Correo electrónico inválido' };
    if (password.length < 8) return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres' };
    if (!nombre) return { ok: false, error: 'El nombre es obligatorio' };

    const { data: creado, error: errorAuth } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre, apellidos },
    });
    if (errorAuth) return { ok: false, error: errorAuth.message };

    const { error: errorPerfil } = await admin.from('iafe_personal').insert({
      id: creado.user.id,
      nombre,
      apellidos,
      email,
      telefono: telefono || null,
      rol,
    });
    if (errorPerfil) {
      // Revertir la cuenta de Auth si falla el perfil
      await admin.auth.admin.deleteUser(creado.user.id);
      return { ok: false, error: errorPerfil.message };
    }

    return { ok: true, email };
  };

  // --- acciones -------------------------------------------------------------
  switch (accion) {
    case 'status': {
      const existe = await hayAdmin();
      return json({ ok: true, hayAdmin: existe, requiereBootstrap: !existe });
    }

    case 'bootstrap-admin': {
      if (await hayAdmin()) {
        return fail('La plataforma ya tiene una cuenta de administrador', 409);
      }
      const codigo = String(body.codigo ?? '').trim();
      const esperado = await leerConfig('codigo_bootstrap');
      if (!esperado || codigo.toUpperCase() !== esperado.toUpperCase()) {
        return fail('El código de arranque no es válido', 403);
      }
      const resultado = await crearCuenta(body, 'administrador');
      if (!resultado.ok) return fail(resultado.error ?? 'No fue posible crear la cuenta', 400);
      return json({ ok: true, email: resultado.email });
    }

    case 'create-user': {
      if (!(await adminAutenticado())) {
        return fail('Se requiere una sesión de administrador', 403);
      }
      const rol = String(body.rol ?? 'maestra');
      if (!ROLES.includes(rol)) return fail('Rol inválido', 400);
      const resultado = await crearCuenta(body, rol);
      if (!resultado.ok) return fail(resultado.error ?? 'No fue posible crear la cuenta', 400);
      return json({ ok: true, email: resultado.email });
    }

    case 'reset-password': {
      if (!(await adminAutenticado())) {
        return fail('Se requiere una sesión de administrador', 403);
      }
      const email = String(body.email ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      if (!email) return fail('Falta el correo electrónico');
      if (password.length < 8) return fail('La contraseña debe tener al menos 8 caracteres');

      const { data: lista, error: errorBusqueda } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (errorBusqueda) return fail(errorBusqueda.message, 400);
      const usuario = lista?.users?.find((u) => u.email?.toLowerCase() === email);
      if (!usuario) return fail('No existe una cuenta con ese correo', 404);

      const { error } = await admin.auth.admin.updateUserById(usuario.id, { password });
      if (error) return fail(error.message, 400);
      return json({ ok: true, email });
    }

    case 'set-active': {
      if (!(await adminAutenticado())) {
        return fail('Se requiere una sesión de administrador', 403);
      }
      const id = String(body.id ?? '');
      const activo = Boolean(body.activo);
      if (!id) return fail('Falta el identificador de la cuenta');
      const { error } = await admin
        .from('iafe_personal')
        .update({ activo })
        .eq('id', id);
      if (error) return fail(error.message, 400);
      return json({ ok: true });
    }

    case 'set-role': {
      if (!(await adminAutenticado())) {
        return fail('Se requiere una sesión de administrador', 403);
      }
      const id = String(body.id ?? '');
      const rol = String(body.rol ?? '');
      if (!id) return fail('Falta el identificador de la cuenta');
      if (!ROLES.includes(rol)) return fail('Rol inválido', 400);
      const { error } = await admin
        .from('iafe_personal')
        .update({ rol })
        .eq('id', id);
      if (error) return fail(error.message, 400);
      return json({ ok: true });
    }

    default:
      return fail('Acción no reconocida', 400);
  }
});
