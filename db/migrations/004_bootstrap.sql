-- =============================================================================
-- IAFE — Migración 004: arranque de la plataforma y limpieza
--
-- · `codigo_bootstrap` protege la creación de la PRIMERA cuenta de administrador.
--   Mientras no exista un administrador activo, la Edge Function `iafe-personal`
--   acepta este código para dar de alta la cuenta inicial.
-- · `iafe_registrar_personal` se retira: el alta de personal se centraliza en la
--   Edge Function (no requiere SMTP ni autoconfirm de correo).
-- =============================================================================

insert into public.iafe_configuracion (clave, valor, descripcion, categoria)
values
  ('codigo_bootstrap', '"IAFE-BOOT-89297EE72797"',
   'Código de arranque: habilita la creación de la primera cuenta de administrador',
   'general')
on conflict (clave) do update
  set valor = excluded.valor,
      descripcion = excluded.descripcion;

drop function if exists public.iafe_registrar_personal(text, text, text, text, text);
