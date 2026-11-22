-- =============================================================================
-- IAFE — Migración 006: unicidad de grupos por nivel
--
-- El nombre de un grupo sólo debe ser único dentro de su nivel y ciclo:
-- puede existir "Grupo A" en Secundaria y en Bachillerato el mismo ciclo.
-- =============================================================================

drop index if exists public.iafe_grupos_nombre_ciclo_key;

create unique index if not exists iafe_grupos_nombre_nivel_ciclo_key
  on public.iafe_grupos (nombre, nivel_id, ciclo);
