create unique index if not exists conversations_one_per_project_idx
  on public.conversations (owner_id, project_id)
  where project_id is not null;

create unique index if not exists projects_id_owner_id_idx
  on public.projects (id, owner_id);

create table if not exists public.artifacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  project_id uuid references public.projects(id) on delete cascade,
  kind text not null check (kind in ('source', 'generated')),
  name text not null check (char_length(name) between 1 and 240),
  mime_type text not null default 'text/markdown',
  size_bytes bigint not null check (size_bytes between 0 and 10485760),
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  check (storage_path like (owner_id::text || '/%')),
  constraint artifacts_project_owner_fk
    foreign key (project_id, owner_id)
    references public.projects(id, owner_id)
    on delete cascade
);

create index if not exists artifacts_owner_created_idx
  on public.artifacts (owner_id, created_at desc);
create index if not exists artifacts_conversation_created_idx
  on public.artifacts (conversation_id, created_at desc);

alter table public.artifacts enable row level security;

create policy artifacts_select_own on public.artifacts for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy artifacts_insert_own on public.artifacts for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and (
      conversation_id is null
      or exists (
        select 1 from public.conversations c
        where c.id = conversation_id and c.owner_id = (select auth.uid())
      )
    )
    and (
      project_id is null
      or exists (
        select 1 from public.projects p
        where p.id = project_id and p.owner_id = (select auth.uid())
      )
    )
  );
create policy artifacts_delete_own on public.artifacts for delete to authenticated
  using ((select auth.uid()) = owner_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'olyhub-user-files',
  'olyhub-user-files',
  false,
  10485760,
  array['text/plain','text/markdown','text/csv','application/json','application/xml','text/xml','text/html']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy olyhub_storage_select_own on storage.objects for select to authenticated
  using (
    bucket_id = 'olyhub-user-files'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
create policy olyhub_storage_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'olyhub-user-files'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
create policy olyhub_storage_update_own on storage.objects for update to authenticated
  using (
    bucket_id = 'olyhub-user-files'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'olyhub-user-files'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
create policy olyhub_storage_delete_own on storage.objects for delete to authenticated
  using (
    bucket_id = 'olyhub-user-files'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

grant select, insert, delete on public.artifacts to authenticated;
grant all on public.artifacts to service_role;
