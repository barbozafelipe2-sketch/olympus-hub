create schema if not exists app_private;
revoke all on schema app_private from public;
revoke all on schema app_private from anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 100),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  goal text not null default '' check (char_length(goal) <= 5000),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  title text not null default 'New chat' check (char_length(title) between 1 and 160),
  mode text not null default 'zeus' check (mode in ('zeus', 'olympus', 'openai', 'claude', 'google')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 50000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 240),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  priority smallint not null default 1 check (priority between 0 and 3),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_owner_updated_idx on public.projects (owner_id, updated_at desc);
create index conversations_owner_updated_idx on public.conversations (owner_id, updated_at desc);
create index conversations_project_idx on public.conversations (project_id, updated_at desc) where project_id is not null;
create index messages_conversation_created_idx on public.messages (conversation_id, created_at);
create index messages_owner_created_idx on public.messages (owner_id, created_at desc);
create index project_tasks_project_status_idx on public.project_tasks (project_id, status, created_at desc);

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function app_private.set_updated_at() from public, anon, authenticated;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function app_private.set_updated_at();
create trigger projects_set_updated_at before update on public.projects
for each row execute function app_private.set_updated_at();
create trigger conversations_set_updated_at before update on public.conversations
for each row execute function app_private.set_updated_at();
create trigger project_tasks_set_updated_at before update on public.project_tasks
for each row execute function app_private.set_updated_at();

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 100), ''),
    nullif(left(coalesce(new.raw_user_meta_data ->> 'avatar_url', ''), 2048), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function app_private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
for each row execute function app_private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.project_tasks enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated
using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated
using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy projects_select_own on public.projects for select to authenticated
using ((select auth.uid()) = owner_id);
create policy projects_insert_own on public.projects for insert to authenticated
with check ((select auth.uid()) = owner_id);
create policy projects_update_own on public.projects for update to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy projects_delete_own on public.projects for delete to authenticated
using ((select auth.uid()) = owner_id);

create policy conversations_select_own on public.conversations for select to authenticated
using ((select auth.uid()) = owner_id);
create policy conversations_insert_own on public.conversations for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and (
    project_id is null
    or exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = (select auth.uid())
    )
  )
);
create policy conversations_update_own on public.conversations for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and (
    project_id is null
    or exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = (select auth.uid())
    )
  )
);
create policy conversations_delete_own on public.conversations for delete to authenticated
using ((select auth.uid()) = owner_id);

create policy messages_select_own on public.messages for select to authenticated
using (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.owner_id = (select auth.uid())
  )
);
create policy messages_insert_own on public.messages for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.owner_id = (select auth.uid())
  )
);
create policy messages_update_own on public.messages for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.owner_id = (select auth.uid())
  )
);
create policy messages_delete_own on public.messages for delete to authenticated
using ((select auth.uid()) = owner_id);

create policy project_tasks_select_own on public.project_tasks for select to authenticated
using (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  )
);
create policy project_tasks_insert_own on public.project_tasks for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  )
);
create policy project_tasks_update_own on public.project_tasks for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  )
);
create policy project_tasks_delete_own on public.project_tasks for delete to authenticated
using ((select auth.uid()) = owner_id);

revoke all on table public.profiles from anon;
revoke all on table public.projects from anon;
revoke all on table public.conversations from anon;
revoke all on table public.messages from anon;
revoke all on table public.project_tasks from anon;

grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.projects to authenticated;
grant select, insert, update, delete on table public.conversations to authenticated;
grant select, insert, update, delete on table public.messages to authenticated;
grant select, insert, update, delete on table public.project_tasks to authenticated;

grant all on table public.profiles to service_role;
grant all on table public.projects to service_role;
grant all on table public.conversations to service_role;
grant all on table public.messages to service_role;
grant all on table public.project_tasks to service_role;
