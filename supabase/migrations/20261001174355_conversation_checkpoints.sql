create table public.conversation_checkpoints (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  content text not null default ''
    check (char_length(content) <= 50000),
  covered_message_count integer not null default 0
    check (covered_message_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversation_checkpoints_owner_updated_idx
  on public.conversation_checkpoints (owner_id, updated_at desc);

create index conversation_checkpoints_project_updated_idx
  on public.conversation_checkpoints (project_id, updated_at desc);

create trigger conversation_checkpoints_set_updated_at
before update on public.conversation_checkpoints
for each row execute function app_private.set_updated_at();

alter table public.conversation_checkpoints enable row level security;

create policy conversation_checkpoints_select_own
on public.conversation_checkpoints
for select to authenticated
using (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and c.owner_id = (select auth.uid())
      and c.project_id = project_id
  )
);

create policy conversation_checkpoints_insert_own
on public.conversation_checkpoints
for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and c.owner_id = (select auth.uid())
      and c.project_id = project_id
  )
);

create policy conversation_checkpoints_update_own
on public.conversation_checkpoints
for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and c.owner_id = (select auth.uid())
      and c.project_id = project_id
  )
);

create policy conversation_checkpoints_delete_own
on public.conversation_checkpoints
for delete to authenticated
using ((select auth.uid()) = owner_id);

revoke all on table public.conversation_checkpoints from anon;
grant select, insert, update, delete
on table public.conversation_checkpoints to authenticated;
grant all on table public.conversation_checkpoints to service_role;
