-- =============================================================================
-- IAFE — Migración 007: clave primaria de la configuración
--
-- `iafe_configuracion` usaba `clave` como clave primaria, mientras que el
-- resto de tablas del módulo usan `id`. Eso rompía el CRUD genérico
-- (update por `id`) y devolvía 400 al guardar la configuración.
--
-- Se agrega `id` como clave primaria y `clave` queda como único.
-- =============================================================================

alter table public.iafe_configuracion
  add column if not exists id uuid;

update public.iafe_configuracion
  set id = gen_random_uuid()
  where id is null;

alter table public.iafe_configuracion
  alter column id set default gen_random_uuid();

alter table public.iafe_configuracion
  alter column id set not null;

alter table public.iafe_configuracion
  drop constraint if exists iafe_configuracion_pkey;

alter table public.iafe_configuracion
  add constraint iafe_configuracion_pkey primary key (id);

alter table public.iafe_configuracion
  drop constraint if exists iafe_configuracion_clave_key;

alter table public.iafe_configuracion
  add constraint iafe_configuracion_clave_key unique (clave);
