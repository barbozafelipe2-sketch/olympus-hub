create table public.executions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  mode text not null check (mode in ('zeus','olympus','openai','claude','google')),
  status text not null default 'completed'
    check (status in ('completed','degraded','failed')),
  provider text not null check (char_length(provider) between 1 and 100),
  model text not null check (char_length(model) between 1 and 200),
  request_id text not null check (char_length(request_id) between 1 and 255),
  fallback_used boolean not null default false,
  call_count integer not null check (call_count between 1 and 12),
  multi_provider boolean not null default false,
  degraded boolean not null default false,
  trace jsonb not null default '[]'::jsonb,
  latency_ms integer not null check (latency_ms between 0 and 300000),
  created_at timestamptz not null default now()
);

create index executions_owner_created_idx
  on public.executions (owner_id, created_at desc);
create index executions_project_created_idx
  on public.executions (project_id, created_at desc)
  where project_id is not null;
create index executions_conversation_created_idx
  on public.executions (conversation_id, created_at desc)
  where conversation_id is not null;

alter table public.executions enable row level security;

create policy executions_select_own on public.executions
for select to authenticated
using ((select auth.uid()) = owner_id);

create policy executions_insert_own on public.executions
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

revoke all on table public.executions from anon;
grant select, insert on table public.executions to authenticated;
grant all on table public.executions to service_role;
