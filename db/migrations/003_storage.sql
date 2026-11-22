-- =============================================================================
-- IAFE — Migración 003: almacenamiento de documentos (PDF)
--
-- Bucket privado `iafe-documentos`:
--   alumnos/{alumno_id}/{archivo}   → documentación subida por el personal
--   constancias/{folio}.pdf         → constancias y recibos generados
--
-- El bucket es privado: el acceso se otorga con URLs firmadas de corta duración
-- generadas por el cliente, previa validación de RLS.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'iafe-documentos',
  'iafe-documentos',
  false,
  10485760, -- 10 MB
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- Políticas de storage.objects
-- -----------------------------------------------------------------------------
drop policy if exists "iafe: documentos lectura" on storage.objects;
create policy "iafe: documentos lectura" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'iafe-documentos'
    and (select private.es_personal())
  );

drop policy if exists "iafe: documentos subida" on storage.objects;
create policy "iafe: documentos subida" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'iafe-documentos'
    and (select private.es_personal())
  );

drop policy if exists "iafe: documentos reemplazo" on storage.objects;
create policy "iafe: documentos reemplazo" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'iafe-documentos'
    and (select private.es_personal())
  )
  with check (
    bucket_id = 'iafe-documentos'
    and (select private.es_personal())
  );

drop policy if exists "iafe: documentos borrado" on storage.objects;
create policy "iafe: documentos borrado" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'iafe-documentos'
    and (select private.es_admin())
  );
