drop policy if exists project_files_storage_select on storage.objects;
drop policy if exists project_files_storage_insert on storage.objects;
drop policy if exists project_files_storage_update on storage.objects;
drop policy if exists project_files_storage_delete on storage.objects;

create policy project_files_storage_select on storage.objects
for select to authenticated
using (
  bucket_id='project-files'
  and (storage.foldername(storage.objects.name))[1]=(select auth.uid())::text
  and exists (
    select 1 from public.projects p
    where p.id::text=(storage.foldername(storage.objects.name))[2]
      and p.owner_id=(select auth.uid())
  )
);

create policy project_files_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id='project-files'
  and (storage.foldername(storage.objects.name))[1]=(select auth.uid())::text
  and exists (
    select 1 from public.projects p
    where p.id::text=(storage.foldername(storage.objects.name))[2]
      and p.owner_id=(select auth.uid())
  )
);

create policy project_files_storage_update on storage.objects
for update to authenticated
using (
  bucket_id='project-files'
  and (storage.foldername(storage.objects.name))[1]=(select auth.uid())::text
  and exists (
    select 1 from public.projects p
    where p.id::text=(storage.foldername(storage.objects.name))[2]
      and p.owner_id=(select auth.uid())
  )
)
with check (
  bucket_id='project-files'
  and (storage.foldername(storage.objects.name))[1]=(select auth.uid())::text
  and exists (
    select 1 from public.projects p
    where p.id::text=(storage.foldername(storage.objects.name))[2]
      and p.owner_id=(select auth.uid())
  )
);

create policy project_files_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id='project-files'
  and (storage.foldername(storage.objects.name))[1]=(select auth.uid())::text
  and exists (
    select 1 from public.projects p
    where p.id::text=(storage.foldername(storage.objects.name))[2]
      and p.owner_id=(select auth.uid())
  )
);

create index project_memories_source_message_idx
  on public.project_memories (source_message_id)
  where source_message_id is not null;
