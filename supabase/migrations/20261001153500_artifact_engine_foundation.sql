create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  kind text not null default 'document'
    check (kind in ('document','report','code','data','note')),
  mime_type text not null default 'text/markdown'
    check (char_length(mime_type) between 1 and 100),
  status text not null default 'active'
    check (status in ('active','archived')),
  current_version integer not null default 1 check (current_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.artifact_versions (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references public.artifacts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  version integer not null check (version >= 1),
  content text not null check (char_length(content) between 1 and 200000),
  provider text check (provider is null or char_length(provider) <= 100),
  model text check (model is null or char_length(model) <= 200),
  request_id text check (request_id is null or char_length(request_id) <= 255),
  created_at timestamptz not null default now(),
  unique (artifact_id, version)
);

create index artifacts_owner_updated_idx
  on public.artifacts (owner_id, updated_at desc);
create index artifacts_project_updated_idx
  on public.artifacts (project_id, updated_at desc)
  where project_id is not null;
create index artifact_versions_artifact_version_idx
  on public.artifact_versions (artifact_id, version desc);
create index artifact_versions_owner_created_idx
  on public.artifact_versions (owner_id, created_at desc);

create trigger artifacts_set_updated_at
before update on public.artifacts
for each row execute function app_private.set_updated_at();

alter table public.artifacts enable row level security;
alter table public.artifact_versions enable row level security;

create policy artifacts_select_own on public.artifacts
for select to authenticated
using (
  (select auth.uid()) = owner_id
  and (
    project_id is null
    or exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = (select auth.uid())
    )
  )
);

create policy artifacts_insert_own on public.artifacts
for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and (
    project_id is null
    or exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = (select auth.uid())
    )
  )
  and (
    conversation_id is null
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.owner_id = (select auth.uid())
        and (project_id is null or c.project_id = project_id)
    )
  )
);

create policy artifacts_update_own on public.artifacts
for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy artifacts_delete_own on public.artifacts
for delete to authenticated
using ((select auth.uid()) = owner_id);

create policy artifact_versions_select_own on public.artifact_versions
for select to authenticated
using (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.artifacts a
    where a.id = artifact_id and a.owner_id = (select auth.uid())
  )
);

create policy artifact_versions_insert_own on public.artifact_versions
for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.artifacts a
    where a.id = artifact_id and a.owner_id = (select auth.uid())
  )
);

create policy artifact_versions_delete_own on public.artifact_versions
for delete to authenticated
using ((select auth.uid()) = owner_id);

revoke all on table public.artifacts from anon;
revoke all on table public.artifact_versions from anon;
grant select, insert, update, delete on table public.artifacts to authenticated;
grant select, insert, delete on table public.artifact_versions to authenticated;
grant all on table public.artifacts to service_role;
grant all on table public.artifact_versions to service_role;

create or replace function public.create_artifact_with_version(
  p_project_id uuid,
  p_conversation_id uuid,
  p_title text,
  p_kind text,
  p_mime_type text,
  p_content text,
  p_provider text default null,
  p_model text default null,
  p_request_id text default null
)
returns table (artifact_id uuid, version_id uuid, version integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_artifact uuid;
  v_version uuid;
begin
  if v_owner is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  insert into public.artifacts (
    owner_id, project_id, conversation_id, title, kind, mime_type, current_version
  )
  values (
    v_owner, p_project_id, p_conversation_id, p_title, p_kind, p_mime_type, 1
  )
  returning id into v_artifact;

  insert into public.artifact_versions (
    artifact_id, owner_id, version, content, provider, model, request_id
  )
  values (
    v_artifact, v_owner, 1, p_content, p_provider, p_model, p_request_id
  )
  returning id into v_version;

  return query select v_artifact, v_version, 1;
end;
$$;

revoke all on function public.create_artifact_with_version(
  uuid, uuid, text, text, text, text, text, text, text
) from public, anon;
grant execute on function public.create_artifact_with_version(
  uuid, uuid, text, text, text, text, text, text, text
) to authenticated;

create or replace function public.append_artifact_version(
  p_artifact_id uuid,
  p_content text,
  p_provider text default null,
  p_model text default null,
  p_request_id text default null
)
returns table (version_id uuid, version integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_next integer;
  v_version_id uuid;
begin
  if v_owner is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select a.current_version + 1
  into v_next
  from public.artifacts a
  where a.id = p_artifact_id and a.owner_id = v_owner
  for update;

  if v_next is null then
    raise exception using errcode = '42501', message = 'artifact_unavailable';
  end if;

  insert into public.artifact_versions (
    artifact_id, owner_id, version, content, provider, model, request_id
  )
  values (
    p_artifact_id, v_owner, v_next, p_content, p_provider, p_model, p_request_id
  )
  returning id into v_version_id;

  update public.artifacts
  set current_version = v_next
  where id = p_artifact_id and owner_id = v_owner;

  return query select v_version_id, v_next;
end;
$$;

revoke all on function public.append_artifact_version(
  uuid, text, text, text, text
) from public, anon;
grant execute on function public.append_artifact_version(
  uuid, text, text, text, text
) to authenticated;
