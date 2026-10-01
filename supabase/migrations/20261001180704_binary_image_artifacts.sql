alter table public.artifacts
  drop constraint if exists artifacts_kind_check;

alter table public.artifacts
  add constraint artifacts_kind_check
  check (kind in ('document','report','code','data','note','image'));

create table public.artifact_files (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references public.artifacts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  version integer not null check (version >= 1),
  bucket_id text not null default 'artifact-files'
    check (bucket_id = 'artifact-files'),
  storage_path text not null unique
    check (char_length(storage_path) between 1 and 1024),
  mime_type text not null
    check (mime_type in ('image/png','image/webp','image/jpeg')),
  size_bytes bigint not null
    check (size_bytes between 1 and 20971520),
  created_at timestamptz not null default now(),
  unique (artifact_id, version)
);

create index artifact_files_owner_created_idx
  on public.artifact_files (owner_id, created_at desc);
create index artifact_files_artifact_version_idx
  on public.artifact_files (artifact_id, version desc);

alter table public.artifact_files enable row level security;

create policy artifact_files_select_own on public.artifact_files
for select to authenticated
using (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.artifacts a
    where a.id = artifact_id and a.owner_id = (select auth.uid())
  )
);

create policy artifact_files_insert_own on public.artifact_files
for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and split_part(storage_path, '/', 1) = (select auth.uid())::text
  and split_part(storage_path, '/', 2) = artifact_id::text
  and exists (
    select 1 from public.artifacts a
    where a.id = artifact_id and a.owner_id = (select auth.uid())
  )
);

create policy artifact_files_delete_own on public.artifact_files
for delete to authenticated
using ((select auth.uid()) = owner_id);

revoke all on table public.artifact_files from anon;
grant select, insert, delete on table public.artifact_files to authenticated;
grant all on table public.artifact_files to service_role;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'artifact-files',
  'artifact-files',
  false,
  20971520,
  array['image/png','image/webp','image/jpeg']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();

create policy artifact_files_storage_select on storage.objects
for select to authenticated
using (
  bucket_id = 'artifact-files'
  and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.artifacts a
    where a.id::text = (storage.foldername(storage.objects.name))[2]
      and a.owner_id = (select auth.uid())
  )
);

create policy artifact_files_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'artifact-files'
  and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.artifacts a
    where a.id::text = (storage.foldername(storage.objects.name))[2]
      and a.owner_id = (select auth.uid())
  )
);

create policy artifact_files_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'artifact-files'
  and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.artifacts a
    where a.id::text = (storage.foldername(storage.objects.name))[2]
      and a.owner_id = (select auth.uid())
  )
);
