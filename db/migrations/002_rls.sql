-- =============================================================================
-- IAFE — Migración 002: seguridad (RLS), funciones helper y políticas por rol
--
-- Modelo de acceso:
--   administrador → control total (alumnos, pagos, constancias, bajas, config)
--   maestra       → lectura de alumnos/pagos + captura de calificaciones
--
-- Las funciones de apoyo viven en el esquema `private`, que NO se expone en la
-- Data API: son inaccesibles desde el cliente y sólo se evalúan dentro de las
-- políticas de RLS. Se usa SECURITY DEFINER para evitar recursión de RLS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers de rol
-- -----------------------------------------------------------------------------
create or replace function private.rol_actual()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.rol
  from public.iafe_personal p
  where p.id = (select auth.uid())
    and p.activo;
$$;

create or replace function private.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.iafe_personal p
    where p.id = (select auth.uid())
      and p.activo
      and p.rol = 'administrador'
  );
$$;

create or replace function private.es_personal()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.iafe_personal p
    where p.id = (select auth.uid())
      and p.activo
  );
$$;

grant execute on function private.rol_actual() to authenticated;
grant execute on function private.es_admin()    to authenticated;
grant execute on function private.es_personal() to authenticated;

-- -----------------------------------------------------------------------------
-- Folios oficiales (IAFE-<TIPO>-<AÑO>-<CONSECUTIVO>)
-- Exposta en `public` para poder invocarla por RPC desde el cliente.
-- -----------------------------------------------------------------------------
create or replace function public.iafe_siguiente_folio(p_tipo text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anio  smallint := extract(year from now())::smallint;
  v_next  integer;
  v_codigo text;
begin
  if not (select private.es_admin()) then
    raise exception 'Solo el administrador puede emitir folios oficiales'
      using errcode = '42501';
  end if;

  insert into public.iafe_folios as f (tipo, anio, ultimo)
  values (upper(p_tipo), v_anio, 1)
  on conflict (tipo, anio)
    do update set ultimo = f.ultimo + 1
  returning ultimo into v_next;

  v_codigo := 'IAFE-' || upper(p_tipo) || '-' || v_anio || '-' || lpad(v_next::text, 6, '0');
  return v_codigo;
end;
$$;

revoke all on function public.iafe_siguiente_folio(text) from public, anon;
grant execute on function public.iafe_siguiente_folio(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Alta de personal.
--   · La PRIMERA cuenta creada en la plataforma queda como administrador
--     (arranque en frío, sin intervention manual).
--   · Las siguientes requieren el código de invitación configurado en
--     `iafe_configuracion` y se registran como maestra.
-- -----------------------------------------------------------------------------
create or replace function public.iafe_registrar_personal(
  p_nombre    text,
  p_apellidos text,
  p_email     text,
  p_telefono  text,
  p_codigo    text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_existe_admin boolean;
  v_codigo_valido boolean := false;
  v_codigo_config text;
  v_rol      text;
  v_id       uuid;
begin
  if v_uid is null then
    raise exception 'Sesión no válida' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.iafe_personal p
    where p.rol = 'administrador' and p.activo
  ) into v_existe_admin;

  if not v_existe_admin then
    v_rol := 'administrador';
  else
    select coalesce((select valor #>> '{}' from public.iafe_configuracion where clave = 'codigo_invitacion'), '')
      into v_codigo_config;

    if v_codigo_config <> '' and p_codigo is not null
       and lower(trim(v_codigo_config)) = lower(trim(p_codigo)) then
      v_codigo_valido := true;
    end if;

    if not v_codigo_valido then
      raise exception 'El código de invitación no es válido'
        using errcode = '42501';
    end if;

    v_rol := 'maestra';
  end if;

  insert into public.iafe_personal (id, nombre, apellidos, email, telefono, rol)
  values (v_uid, trim(p_nombre), trim(coalesce(p_apellidos, '')), lower(trim(p_email)), p_telefono, v_rol)
  on conflict (id) do update
    set nombre        = excluded.nombre,
        apellidos     = excluded.apellidos,
        email         = excluded.email,
        telefono      = excluded.telefono,
        rol           = excluded.rol,
        actualizado_en = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.iafe_registrar_personal(text, text, text, text, text) from public, anon;
grant execute on function public.iafe_registrar_personal(text, text, text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- RLS: habilitar en todas las tablas de la plataforma
-- -----------------------------------------------------------------------------
alter table public.iafe_personal          enable row level security;
alter table public.iafe_niveles           enable row level security;
alter table public.iafe_grupos            enable row level security;
alter table public.iafe_alumnos           enable row level security;
alter table public.iafe_inscripciones     enable row level security;
alter table public.iafe_mensualidades     enable row level security;
alter table public.iafe_calificaciones    enable row level security;
alter table public.iafe_documentos_alumno enable row level security;
alter table public.iafe_constancias       enable row level security;
alter table public.iafe_bajas             enable row level security;
alter table public.iafe_configuracion     enable row level security;
alter table public.iafe_folios            enable row level security;

-- -----------------------------------------------------------------------------
-- Políticas: iafe_personal
-- -----------------------------------------------------------------------------
create policy "personal: lectura propia" on public.iafe_personal
  for select to authenticated
  using (id = (select auth.uid()));

create policy "personal: lectura del equipo" on public.iafe_personal
  for select to authenticated
  using ((select private.es_personal()));

create policy "personal: alta por administrador" on public.iafe_personal
  for insert to authenticated
  with check ((select private.es_admin()));

create policy "personal: edición por administrador" on public.iafe_personal
  for update to authenticated
  using ((select private.es_admin()))
  with check ((select private.es_admin()));

create policy "personal: baja por administrador" on public.iafe_personal
  for delete to authenticated
  using ((select private.es_admin()));

-- -----------------------------------------------------------------------------
-- Políticas: catálogo (niveles)
-- -----------------------------------------------------------------------------
create policy "niveles: lectura" on public.iafe_niveles
  for select to authenticated
  using ((select private.es_personal()));

create policy "niveles: escritura" on public.iafe_niveles
  for all to authenticated
  using ((select private.es_admin()))
  with check ((select private.es_admin()));

-- -----------------------------------------------------------------------------
-- Políticas: grupos
-- -----------------------------------------------------------------------------
create policy "grupos: lectura" on public.iafe_grupos
  for select to authenticated
  using ((select private.es_personal()));

create policy "grupos: escritura" on public.iafe_grupos
  for all to authenticated
  using ((select private.es_admin()))
  with check ((select private.es_admin()));

-- -----------------------------------------------------------------------------
-- Políticas: alumnos
-- -----------------------------------------------------------------------------
create policy "alumnos: lectura" on public.iafe_alumnos
  for select to authenticated
  using ((select private.es_personal()));

create policy "alumnos: escritura" on public.iafe_alumnos
  for all to authenticated
  using ((select private.es_admin()))
  with check ((select private.es_admin()));

-- -----------------------------------------------------------------------------
-- Políticas: inscripciones
-- -----------------------------------------------------------------------------
create policy "inscripciones: lectura" on public.iafe_inscripciones
  for select to authenticated
  using ((select private.es_personal()));

create policy "inscripciones: escritura" on public.iafe_inscripciones
  for all to authenticated
  using ((select private.es_admin()))
  with check ((select private.es_admin()));

-- -----------------------------------------------------------------------------
-- Políticas: mensualidades / pagos
-- -----------------------------------------------------------------------------
create policy "mensualidades: lectura" on public.iafe_mensualidades
  for select to authenticated
  using ((select private.es_personal()));

create policy "mensualidades: escritura" on public.iafe_mensualidades
  for all to authenticated
  using ((select private.es_admin()))
  with check ((select private.es_admin()));

-- -----------------------------------------------------------------------------
-- Políticas: calificaciones (ambas roles escriben; la maestra captura)
-- -----------------------------------------------------------------------------
create policy "calificaciones: lectura" on public.iafe_calificaciones
  for select to authenticated
  using ((select private.es_personal()));

create policy "calificaciones: escritura" on public.iafe_calificaciones
  for all to authenticated
  using ((select private.es_personal()))
  with check ((select private.es_personal()));

-- -----------------------------------------------------------------------------
-- Políticas: documentos del alumno
-- -----------------------------------------------------------------------------
create policy "documentos: lectura" on public.iafe_documentos_alumno
  for select to authenticated
  using ((select private.es_personal()));

create policy "documentos: escritura" on public.iafe_documentos_alumno
  for all to authenticated
  using ((select private.es_personal()))
  with check ((select private.es_personal()));

-- -----------------------------------------------------------------------------
-- Políticas: constancias (solo administrador)
-- -----------------------------------------------------------------------------
create policy "constancias: lectura" on public.iafe_constancias
  for select to authenticated
  using ((select private.es_admin()));

create policy "constancias: escritura" on public.iafe_constancias
  for all to authenticated
  using ((select private.es_admin()))
  with check ((select private.es_admin()));

-- -----------------------------------------------------------------------------
-- Políticas: bajas (solo administrador)
-- -----------------------------------------------------------------------------
create policy "bajas: lectura" on public.iafe_bajas
  for select to authenticated
  using ((select private.es_admin()));

create policy "bajas: escritura" on public.iafe_bajas
  for all to authenticated
  using ((select private.es_admin()))
  with check ((select private.es_admin()));

-- -----------------------------------------------------------------------------
-- Políticas: configuración
-- -----------------------------------------------------------------------------
create policy "configuracion: lectura" on public.iafe_configuracion
  for select to authenticated
  using ((select private.es_personal()));

create policy "configuracion: escritura" on public.iafe_configuracion
  for all to authenticated
  using ((select private.es_admin()))
  with check ((select private.es_admin()));

-- -----------------------------------------------------------------------------
-- Políticas: folios (sólo lectura para el personal; la escritura es interna)
-- -----------------------------------------------------------------------------
create policy "folios: lectura" on public.iafe_folios
  for select to authenticated
  using ((select private.es_personal()));

-- -----------------------------------------------------------------------------
-- Real-time: sincroniza las vistas entre maestra y administrador
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'iafe_alumnos', 'iafe_mensualidades', 'iafe_calificaciones',
    'iafe_constancias', 'iafe_grupos', 'iafe_niveles'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then
      null;
    end;
  end loop;
end;
$$;
