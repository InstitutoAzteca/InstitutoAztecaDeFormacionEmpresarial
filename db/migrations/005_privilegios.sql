-- =============================================================================
-- IAFE — Migración 005: privilegios de acceso a la Data API
--
-- El proyecto no aplica los privilegios completos por omisión sobre las tablas
-- nuevas: `anon`, `authenticated` y `service_role` sólo reciben
-- REFERENCES/TRIGGER/TRUNCATE, por lo que las consultas del cliente fallan con
-- "permission denied" aunque las políticas RLS sean correctas.
--
-- Aquí se otorgan explícitamente los privilegios de lectura y escritura.
--
--   authenticated → la aplicación (tras iniciar sesión)
--   service_role  → la Edge Function `iafe-personal` (desde el servidor)
--
-- `anon` NO recibe privilegios: sin sesión no hay acceso a los datos.
-- La protección real sigue siendo RLS.
-- =============================================================================

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete
  on all tables in schema public
  to authenticated, service_role;

grant usage, select
  on all sequences in schema public
  to authenticated, service_role;

-- Para que las tablas que se agreguen en el futuro hereden los mismos permisos.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;

-- El bucket de Storage lo administra el rol `storage`, no el de la Data API.
grant usage on schema storage to authenticated;
