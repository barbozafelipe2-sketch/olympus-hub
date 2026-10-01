create table public.account_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_code text not null default 'unassigned'
    check (char_length(plan_code) between 1 and 64),
  status text not null default 'active'
    check (status in ('active','blocked','cancelled')),
  daily_request_limit integer
    check (daily_request_limit is null or daily_request_limit > 0),
  daily_token_limit bigint
    check (daily_token_limit is null or daily_token_limit > 0),
  monthly_token_limit bigint
    check (monthly_token_limit is null or monthly_token_limit > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger account_limits_set_updated_at
before update on public.account_limits
for each row execute function app_private.set_updated_at();

alter table public.account_limits enable row level security;

create policy account_limits_select_own on public.account_limits
for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.account_limits from anon, authenticated;
grant select on table public.account_limits to authenticated;
grant all on table public.account_limits to service_role;

insert into public.account_limits (user_id)
select id from auth.users
on conflict (user_id) do nothing;

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

  insert into public.account_limits (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function app_private.handle_new_user()
from public, anon, authenticated;

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  execution_id uuid not null references public.executions(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  provider text not null check (char_length(provider) between 1 and 100),
  model text not null check (char_length(model) between 1 and 200),
  role text not null check (char_length(role) between 1 and 64),
  request_id text not null check (char_length(request_id) between 1 and 255),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  cache_write_tokens bigint not null default 0 check (cache_write_tokens >= 0),
  reasoning_tokens bigint not null default 0 check (reasoning_tokens >= 0),
  tool_tokens bigint not null default 0 check (tool_tokens >= 0),
  total_tokens bigint not null default 0 check (total_tokens >= 0),
  estimated_cost_microusd bigint
    check (estimated_cost_microusd is null or estimated_cost_microusd >= 0),
  created_at timestamptz not null default now(),
  unique (execution_id, role, request_id)
);

create index usage_events_owner_created_idx
  on public.usage_events (owner_id, created_at desc);
create index usage_events_execution_idx
  on public.usage_events (execution_id);
create index usage_events_project_created_idx
  on public.usage_events (project_id, created_at desc)
  where project_id is not null;

alter table public.usage_events enable row level security;

create policy usage_events_select_own on public.usage_events
for select to authenticated
using ((select auth.uid()) = owner_id);

create policy usage_events_insert_own on public.usage_events
for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.executions e
    where e.id = execution_id
      and e.owner_id = (select auth.uid())
      and (project_id is null or e.project_id = project_id)
  )
);

revoke all on table public.usage_events from anon, authenticated;
grant select, insert on table public.usage_events to authenticated;
grant all on table public.usage_events to service_role;
