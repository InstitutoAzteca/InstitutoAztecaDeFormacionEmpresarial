-- =============================================================================
-- IAFE — Plataforma de Administración del Instituto Azteca de Formación Empresarial
-- Migración 001: esquema base de datos
--
-- Esquema `public` con prefijo `iafe_` (el proyecto expone `public` en la
-- Data API, por lo que no requiere cambiar "Exposed schemas" en el panel).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Esquema privado: helpers de RLS. No se expone en la Data API, por lo que sus
-- funciones no son invocables desde el cliente; sólo se usan dentro de políticas.
-- -----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- -----------------------------------------------------------------------------
-- Trigger genérico para `actualizado_en`
-- -----------------------------------------------------------------------------
create or replace function private.touch_actualizado_en()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Personal (maestras y administradores). `id` referencia auth.users.
-- -----------------------------------------------------------------------------
create table public.iafe_personal (
  id             uuid primary key references auth.users(id) on delete cascade,
  nombre         text not null,
  apellidos      text not null default '',
  email          text not null,
  telefono       text,
  rol            text not null check (rol in ('administrador', 'maestra')),
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create unique index iafe_personal_email_key on public.iafe_personal (lower(email));
create index iafe_personal_rol_idx on public.iafe_personal (rol) where activo;

create trigger iafe_personal_touch
  before update on public.iafe_personal
  for each row execute function private.touch_actualizado_en();

-- -----------------------------------------------------------------------------
-- Niveles academicos (Secundaria, Bachillerato, Licenciatura…)
-- -----------------------------------------------------------------------------
create table public.iafe_niveles (
  id              uuid primary key default gen_random_uuid(),
  clave           text not null unique,
  nombre          text not null,
  mensualidad     numeric(12,2) not null default 0 check (mensualidad >= 0),
  cuota_inscripcion numeric(12,2) not null default 0 check (cuota_inscripcion >= 0),
  dia_limite_pago smallint not null default 10 check (dia_limite_pago between 1 and 31),
  orden           smallint not null default 0,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now()
);

create index iafe_niveles_activo_idx on public.iafe_niveles (activo, orden);

-- -----------------------------------------------------------------------------
-- Grupos (secciones) por nivel y ciclo
-- -----------------------------------------------------------------------------
create table public.iafe_grupos (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  nivel_id        uuid not null references public.iafe_niveles(id) on delete restrict,
  docente_id      uuid references public.iafe_personal(id) on delete set null,
  ciclo           text not null default '',
  horario         text,
  capacidad       smallint check (capacidad is null or capacidad > 0),
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

create index iafe_grupos_nivel_idx on public.iafe_grupos (nivel_id, activo);
create index iafe_grupos_docente_idx on public.iafe_grupos (docente_id);
create unique index iafe_grupos_nombre_ciclo_key on public.iafe_grupos (nombre, ciclo);

create trigger iafe_grupos_touch
  before update on public.iafe_grupos
  for each row execute function private.touch_actualizado_en();

-- -----------------------------------------------------------------------------
-- Alumnos
-- -----------------------------------------------------------------------------
create table public.iafe_alumnos (
  id                uuid primary key default gen_random_uuid(),
  codigo            text not null unique,
  nombre            text not null,
  apellidos         text not null default '',
  curp              text,
  email             text,
  telefono          text,
  direccion         text,
  fecha_nacimiento  date,
  tutor_nombre      text,
  tutor_telefono    text,
  nivel_id          uuid not null references public.iafe_niveles(id) on delete restrict,
  grupo_id          uuid references public.iafe_grupos(id) on delete set null,
  ciclo             text not null default '',
  fecha_inscripcion date not null default current_date,
  estado            text not null default 'activo' check (estado in ('activo', 'baja')),
  becado            boolean not null default false,
  observaciones     text,
  creado_por        uuid references public.iafe_personal(id) on delete set null,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);

create index iafe_alumnos_busqueda_idx on public.iafe_alumnos (lower(apellidos), lower(nombre));
create index iafe_alumnos_nivel_idx on public.iafe_alumnos (nivel_id);
create index iafe_alumnos_grupo_idx on public.iafe_alumnos (grupo_id);
create index iafe_alumnos_estado_idx on public.iafe_alumnos (estado);
create unique index iafe_alumnos_curp_key on public.iafe_alumnos (curp) where curp is not null;

create trigger iafe_alumnos_touch
  before update on public.iafe_alumnos
  for each row execute function private.touch_actualizado_en();

-- -----------------------------------------------------------------------------
-- Inscripciones (altas y reingresos por ciclo)
-- -----------------------------------------------------------------------------
create table public.iafe_inscripciones (
  id          uuid primary key default gen_random_uuid(),
  alumno_id   uuid not null references public.iafe_alumnos(id) on delete cascade,
  ciclo       text not null,
  nivel_id    uuid not null references public.iafe_niveles(id) on delete restrict,
  grupo_id    uuid references public.iafe_grupos(id) on delete set null,
  tipo        text not null default 'nueva' check (tipo in ('nueva', 'reingreso')),
  fecha       date not null default current_date,
  monto       numeric(12,2) not null default 0 check (monto >= 0),
  nota        text,
  creado_por  uuid references public.iafe_personal(id) on delete set null,
  creado_en   timestamptz not null default now()
);

create index iafe_inscripciones_alumno_idx on public.iafe_inscripciones (alumno_id, ciclo desc);
create index iafe_inscripciones_ciclo_idx on public.iafe_inscripciones (ciclo);

-- -----------------------------------------------------------------------------
-- Mensualidades y pagos
--   estado: pagada | pendiente | becado | condonado
--   concepto: mensualidad | inscripcion | materiales | otros
-- -----------------------------------------------------------------------------
create table public.iafe_mensualidades (
  id              uuid primary key default gen_random_uuid(),
  alumno_id       uuid not null references public.iafe_alumnos(id) on delete cascade,
  anio            smallint not null check (anio between 2000 and 2100),
  mes             smallint not null check (mes between 1 and 12),
  ciclo           text not null default '',
  concepto        text not null default 'mensualidad',
  monto           numeric(12,2) not null default 0 check (monto >= 0),
  estado          text not null default 'pendiente'
                    check (estado in ('pagada', 'pendiente', 'becado', 'condonado')),
  fecha_pago      date,
  metodo          text check (metodo is null or metodo in ('efectivo', 'transferencia', 'tarjeta', 'otro')),
  referencia      text,
  nota            text,
  folio           text,
  registrado_por  uuid references public.iafe_personal(id) on delete set null,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  constraint iafe_mensualidades_pago_coherente
    check (estado <> 'pagada' or (fecha_pago is not null and metodo is not null))
);

create unique index iafe_mensualidades_periodo_key
  on public.iafe_mensualidades (alumno_id, anio, mes, concepto);
create index iafe_mensualidades_alumno_idx on public.iafe_mensualidades (alumno_id, anio desc, mes desc);
create index iafe_mensualidades_corte_idx on public.iafe_mensualidades (anio, mes, estado);
create index iafe_mensualidades_estado_idx on public.iafe_mensualidades (estado) where estado = 'pendiente';

create trigger iafe_mensualidades_touch
  before update on public.iafe_mensualidades
  for each row execute function private.touch_actualizado_en();

-- -----------------------------------------------------------------------------
-- Calificaciones (capturadas por la maestra)
--   periodo: parcial_1 | parcial_2 | parcial_3 | final
--   escala 0.00 – 10.00
-- -----------------------------------------------------------------------------
create table public.iafe_calificaciones (
  id           uuid primary key default gen_random_uuid(),
  alumno_id    uuid not null references public.iafe_alumnos(id) on delete cascade,
  grupo_id     uuid references public.iafe_grupos(id) on delete set null,
  materia      text not null,
  periodo      text not null check (periodo in ('parcial_1', 'parcial_2', 'parcial_3', 'final')),
  calificacion numeric(5,2) check (calificacion between 0 and 10),
  docente_id   uuid references public.iafe_personal(id) on delete set null,
  comentario   text,
  fecha        date not null default current_date,
  creado_en    timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create unique index iafe_calificaciones_alumno_materia_periodo_key
  on public.iafe_calificaciones (alumno_id, materia, periodo);
create index iafe_calificaciones_grupo_idx on public.iafe_calificaciones (grupo_id, periodo);
create index iafe_calificaciones_alumno_idx on public.iafe_calificaciones (alumno_id);

create trigger iafe_calificaciones_touch
  before update on public.iafe_calificaciones
  for each row execute function private.touch_actualizado_en();

-- -----------------------------------------------------------------------------
-- Documentos PDF del alumno (INE, acta, CURP, comprobante de domicilio…)
-- -----------------------------------------------------------------------------
create table public.iafe_documentos_alumno (
  id             uuid primary key default gen_random_uuid(),
  alumno_id      uuid not null references public.iafe_alumnos(id) on delete cascade,
  tipo           text not null default 'otro',
  nombre_archivo text not null,
  path           text not null unique,
  mime           text not null default 'application/pdf',
  tamano         integer not null default 0 check (tamano >= 0),
  nota           text,
  subido_por     uuid references public.iafe_personal(id) on delete set null,
  creado_en      timestamptz not null default now()
);

create index iafe_documentos_alumno_idx on public.iafe_documentos_alumno (alumno_id, tipo);

-- -----------------------------------------------------------------------------
-- Constancias y certificados emitidos
--   tipo: estudios | inscripcion | boleta | comprobante | certificado
-- -----------------------------------------------------------------------------
create table public.iafe_constancias (
  id            uuid primary key default gen_random_uuid(),
  alumno_id     uuid not null references public.iafe_alumnos(id) on delete cascade,
  tipo          text not null check (tipo in ('estudios', 'inscripcion', 'boleta', 'comprobante', 'certificado')),
  folio         text not null unique,
  datos         jsonb not null default '{}'::jsonb,
  path          text,
  emitido_por   uuid references public.iafe_personal(id) on delete set null,
  fecha_emision timestamptz not null default now(),
  anulado       boolean not null default false
);

create index iafe_constancias_alumno_idx on public.iafe_constancias (alumno_id, fecha_emision desc);
create index iafe_constancias_tipo_idx on public.iafe_constancias (tipo, fecha_emision desc);

-- -----------------------------------------------------------------------------
-- Bajas
-- -----------------------------------------------------------------------------
create table public.iafe_bajas (
  id             uuid primary key default gen_random_uuid(),
  alumno_id      uuid not null references public.iafe_alumnos(id) on delete cascade,
  fecha_baja     date not null default current_date,
  tipo           text not null default 'voluntaria'
                   check (tipo in ('voluntaria', 'academica', 'economica', 'administrativa', 'otra')),
  motivo         text not null default '',
  adeudo_final   numeric(12,2) not null default 0 check (adeudo_final >= 0),
  nota           text,
  registrado_por uuid references public.iafe_personal(id) on delete set null,
  creado_en      timestamptz not null default now()
);

create index iafe_bajas_alumno_idx on public.iafe_bajas (alumno_id);
create index iafe_bajas_fecha_idx on public.iafe_bajas (fecha_baja desc);

-- -----------------------------------------------------------------------------
-- Configuración editable (datos oficiales, plantillas, ciclo activo…)
-- -----------------------------------------------------------------------------
create table public.iafe_configuracion (
  clave           text primary key,
  valor           jsonb not null default 'null'::jsonb,
  descripcion     text,
  categoria       text not null default 'general',
  actualizado_por uuid references public.iafe_personal(id) on delete set null,
  actualizado_en  timestamptz not null default now()
);

create index iafe_configuracion_categoria_idx on public.iafe_configuracion (categoria);

create trigger iafe_configuracion_touch
  before update on public.iafe_configuracion
  for each row execute function private.touch_actualizado_en();

-- -----------------------------------------------------------------------------
-- Folios oficiales por tipo de documento y año
-- -----------------------------------------------------------------------------
create table public.iafe_folios (
  tipo  text not null,
  anio  smallint not null check (anio between 2000 and 2100),
  ultimo integer not null default 0,
  primary key (tipo, anio)
);

-- -----------------------------------------------------------------------------
-- Datos iniciales
-- -----------------------------------------------------------------------------
insert into public.iafe_niveles (clave, nombre, mensualidad, cuota_inscripcion, dia_limite_pago, orden)
values
  ('secundaria',  'Secundaria',   0, 0, 10, 1),
  ('bachillerato','Bachillerato', 0, 0, 10, 2),
  ('licenciatura','Licenciatura', 0, 0, 10, 3)
on conflict (clave) do nothing;

insert into public.iafe_configuracion (clave, valor, descripcion, categoria)
values
  ('institucion_nombre', '"Instituto Azteca de Formación Empresarial"', 'Razón social que aparece en los documentos', 'institucion'),
  ('institucion_siglas', '"IAFE"', 'Siglas', 'institucion'),
  ('institucion_rfc', '""', 'RFC de la dependencia', 'institucion'),
  ('institucion_direccion', '""', 'Domicilio fiscal / sede', 'institucion'),
  ('institucion_telefono', '""', 'Teléfono de contacto', 'institucion'),
  ('institucion_email', '""', 'Correo de contacto', 'institucion'),
  ('director_nombre', '""', 'Nombre de quien firma los documentos', 'institucion'),
  ('director_cargo', '"Director"', 'Cargo del firmante', 'institucion'),
  ('coordinador_nombre', '""', 'Coordinadora académica', 'institucion'),
  ('pago_banco', '""', 'Banco para transferencias', 'pago'),
  ('pago_clabe', '""', 'CLABE interbancaria', 'pago'),
  ('pago_titular', '""', 'Titular de la cuenta', 'pago'),
  ('pago_concepto', '"Pago de mensualidad"', 'Concepto sugerido en transferencias', 'pago'),
  ('ciclo_activo', '""', 'Ciclo escolar vigente, p. ej. 2026-A', 'general'),
  ('escala_minima', '6', 'Calificación mínima aprobatoria (escala 0-10)', 'general'),
  ('codigo_invitacion', '""', 'Código que permite registrarse como maestra', 'general'),
  ('plantilla_estudios', '"A quien corresponda:\n\nPor este medio se hace constar que el alumno(a) {nombre_completo}, con matrícula {codigo}, se encuentra inscrito(a) en el {nivel} del Instituto Azteca de Formación Empresarial, durante el ciclo {ciclo}.\n\nSe extiende la presente para los fines que al interesado convengan.\n\nAtentamente."', 'Cuerpo de la constancia de estudios', 'plantillas'),
  ('plantilla_inscripcion', '"A quien corresponda:\n\nPor este medio se hace constar que {nombre_completo}, con matrícula {codigo}, fue inscrito(a) el {fecha_inscripcion} en el programa de {nivel} del Instituto Azteca de Formación Empresarial, con un adeudo de {adeudo} y los pagos realizados hasta la fecha por {pagado}.\n\nAtentamente."', 'Cuerpo de la constancia de inscripción', 'plantillas'),
  ('plantilla_certificado', '"A quien corresponda:\n\nSe extiende el presente certificado a {nombre_completo}, por haber concluido satisfactoriamente el programa de {nivel} con un promedio general de {promedio}, correspondiente al ciclo {ciclo}.\n\nSe extiende la presente para los fines que al interesado convengan.\n\nAtentamente."', 'Cuerpo del certificado de conclusión', 'plantillas'),
  ('plantilla_boleta', '"Boleta de calificaciones"', 'Encabezado de la boleta', 'plantillas'),
  ('plantilla_comprobante', '"Comprobante de pago"', 'Encabezado del recibo', 'plantillas')
on conflict (clave) do nothing;
