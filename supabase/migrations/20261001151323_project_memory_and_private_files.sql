create table public.project_memories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  kind text not null default 'fact'
    check (kind in ('fact','preference','decision','outcome','instruction')),
  content text not null check (char_length(content) between 1 and 1500),
  importance smallint not null default 3 check (importance between 1 and 5),
  source_message_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index project_memories_scope_rank_idx
  on public.project_memories (owner_id, project_id, importance desc, updated_at desc);
create index project_memories_project_idx
  on public.project_memories (project_id, updated_at desc)
  where project_id is not null;
create unique index project_memories_dedupe_idx
  on public.project_memories (
    owner_id,
    coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
    md5(lower(trim(content)))
  );

create or replace function app_private.enforce_memory_budget()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing_count integer;
  existing_chars integer;
begin
  select count(*)::integer, coalesce(sum(char_length(m.content)), 0)::integer
  into existing_count, existing_chars
  from public.project_memories m
  where m.owner_id = new.owner_id
    and m.project_id is not distinct from new.project_id
    and m.id <> new.id;

  if existing_count >= 40 then
    raise exception using errcode = 'P0001', message = 'memory_item_limit';
  end if;

  if existing_chars + char_length(new.content) > 15000 then
    raise exception using errcode = 'P0001', message = 'memory_character_limit';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_memory_budget() from public, anon, authenticated;

create trigger project_memories_enforce_budget
before insert or update on public.project_memories
for each row execute function app_private.enforce_memory_budget();

create trigger project_memories_set_updated_at
before update on public.project_memories
for each row execute function app_private.set_updated_at();

alter table public.project_memories enable row level security;

create policy project_memories_select_own on public.project_memories
for select to authenticated
using ((select auth.uid()) = owner_id and (
  project_id is null or exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  )
));

create policy project_memories_insert_own on public.project_memories
for insert to authenticated
with check ((select auth.uid()) = owner_id and (
  project_id is null or exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  )
));

create policy project_memories_update_own on public.project_memories
for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id and (
  project_id is null or exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  )
));

create policy project_memories_delete_own on public.project_memories
for delete to authenticated
using ((select auth.uid()) = owner_id);

revoke all on table public.project_memories from anon;
grant select, insert, update, delete on table public.project_memories to authenticated;
grant all on table public.project_memories to service_role;

create table public.project_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  bucket_id text not null default 'project-files' check (bucket_id = 'project-files'),
  storage_path text not null unique check (char_length(storage_path) between 1 and 1024),
  name text not null check (char_length(name) between 1 and 255),
  mime_type text not null check (char_length(mime_type) between 1 and 200),
  size_bytes bigint not null check (size_bytes between 0 and 20971520),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index project_files_project_created_idx on public.project_files (project_id, created_at desc);
create index project_files_owner_created_idx on public.project_files (owner_id, created_at desc);

create trigger project_files_set_updated_at
before update on public.project_files
for each row execute function app_private.set_updated_at();

alter table public.project_files enable row level security;

create policy project_files_select_own on public.project_files
for select to authenticated
using ((select auth.uid()) = owner_id and exists (
  select 1 from public.projects p
  where p.id = project_id and p.owner_id = (select auth.uid())
));

create policy project_files_insert_own on public.project_files
for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.projects p
    where p.id = project_id and p.owner_id = (select auth.uid()))
  and split_part(storage_path, '/', 1) = (select auth.uid())::text
  and split_part(storage_path, '/', 2) = project_id::text
);

create policy project_files_update_own on public.project_files
for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.projects p
    where p.id = project_id and p.owner_id = (select auth.uid()))
  and split_part(storage_path, '/', 1) = (select auth.uid())::text
  and split_part(storage_path, '/', 2) = project_id::text
);

create policy project_files_delete_own on public.project_files
for delete to authenticated
using ((select auth.uid()) = owner_id);

revoke all on table public.project_files from anon;
grant select, insert, update, delete on table public.project_files to authenticated;
grant all on table public.project_files to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-files','project-files',false,20971520,
  array[
    'application/pdf','text/plain','text/markdown','text/csv','application/json',
    'image/jpeg','image/png','image/webp','image/gif',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'audio/mpeg','audio/mp4','audio/wav','audio/x-m4a','video/mp4'
  ]::text[]
)
on conflict (id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types,
  updated_at=now();

create policy project_files_storage_select on storage.objects
for select to authenticated
using (
  bucket_id='project-files'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists (
    select 1 from public.projects p
    where p.id::text=(storage.foldername(name))[2]
      and p.owner_id=(select auth.uid())
  )
);

create policy project_files_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id='project-files'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists (
    select 1 from public.projects p
    where p.id::text=(storage.foldername(name))[2]
      and p.owner_id=(select auth.uid())
  )
);

create policy project_files_storage_update on storage.objects
for update to authenticated
using (bucket_id='project-files' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check (
  bucket_id='project-files'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists (
    select 1 from public.projects p
    where p.id::text=(storage.foldername(name))[2]
      and p.owner_id=(select auth.uid())
  )
);

create policy project_files_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id='project-files'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists (
    select 1 from public.projects p
    where p.id::text=(storage.foldername(name))[2]
      and p.owner_id=(select auth.uid())
  )
);
