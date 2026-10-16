-- Financial records are independent of user-deletable content.
alter table public.account_limits add column olympus_entitled boolean not null default false;
alter table public.executions drop constraint executions_project_id_fkey;
alter table public.executions add constraint executions_project_id_fkey foreign key (project_id) references public.projects(id) on delete set null;
alter table public.executions drop constraint executions_conversation_id_fkey;
alter table public.executions add constraint executions_conversation_id_fkey foreign key (conversation_id) references public.conversations(id) on delete set null;
alter table public.usage_events alter column execution_id drop not null;
alter table public.usage_events drop constraint usage_events_execution_id_fkey;
alter table public.usage_events add constraint usage_events_execution_id_fkey foreign key (execution_id) references public.executions(id) on delete set null;

create table public.ai_budget_requests (
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  kind text not null default 'text' check (kind in ('text','image')),
  fingerprint text not null check (length(fingerprint) = 64),
  state text not null check (state in ('running', 'completed', 'failed', 'expired')),
  charged_tokens bigint not null check (charged_tokens >= 0),
  trace jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '3 minutes',
  completed_at timestamptz,
  primary key (owner_id, request_id)
);
create index ai_budget_requests_owner_created_idx on public.ai_budget_requests(owner_id, created_at desc);
alter table public.ai_budget_requests enable row level security;
create policy ai_budget_requests_select_own on public.ai_budget_requests for select to authenticated
using ((select auth.uid()) = owner_id);
revoke all on public.ai_budget_requests from public, anon, authenticated;
grant select on public.ai_budget_requests to authenticated;
grant all on public.ai_budget_requests to service_role;

-- Preserve pre-migration totals. Never backfill from user content after release.
insert into public.ai_budget_requests(owner_id, request_id, fingerprint, state, charged_tokens, created_at, expires_at, completed_at)
select e.owner_id, e.id, repeat('0',64), case when e.status='failed' then 'failed' else 'completed' end,
       coalesce(sum(u.total_tokens),0), e.created_at, e.created_at, e.created_at
from public.executions e left join public.usage_events u on u.execution_id=e.id
group by e.id;

create or replace function public.get_my_usage_summary()
returns table(daily_requests bigint, daily_tokens bigint, monthly_tokens bigint)
language sql stable security invoker set search_path = '' as $$
  select count(*) filter (where b.created_at >= date_trunc('day',now())),
         coalesce(sum(b.charged_tokens) filter (where b.created_at >= date_trunc('day',now())),0)::bigint,
         coalesce(sum(b.charged_tokens),0)::bigint
  from public.ai_budget_requests b
  where b.owner_id=auth.uid() and b.created_at >= date_trunc('month',now());
$$;
revoke all on function public.get_my_usage_summary() from public, anon;
grant execute on function public.get_my_usage_summary() to authenticated;

-- Invoker privileges: only the server's service_role can reserve/settle. Users
-- cannot submit their own accounting totals or choose another account's limits.
create function public.reserve_ai_budget(p_owner_id uuid, p_request_id uuid, p_fingerprint text, p_reserved_tokens bigint, p_limits jsonb, p_kind text default 'text')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  account public.account_limits%rowtype;
  prior public.ai_budget_requests%rowtype;
  daily_requests bigint; daily_tokens bigint; monthly_tokens bigint; active_count integer;
  request_limit bigint; day_limit bigint; month_limit bigint; concurrency_limit integer; image_count integer;
begin
  if p_kind not in ('text','image') or p_owner_id is null or p_request_id is null or length(p_fingerprint)<>64 or p_reserved_tokens < 1 or p_reserved_tokens > 2000000 then
    raise exception 'Invalid budget reservation';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('olyhub-budget:'||p_owner_id::text,0));
  select * into prior from public.ai_budget_requests where owner_id=p_owner_id and request_id=p_request_id;
  if found then
    return jsonb_build_object('allowed',false,'reason',case when prior.fingerprint<>p_fingerprint then 'request_id_reused' else 'request_already_consumed' end);
  end if;
  select * into account from public.account_limits where user_id=p_owner_id for update;
  if not found or account.status<>'active' then return jsonb_build_object('allowed',false,'reason','account_not_active'); end if;
  if p_limits->>'engine'='olympus' and not account.olympus_entitled then return jsonb_build_object('allowed',false,'reason','olympus_not_entitled'); end if;
  request_limit := coalesce(account.daily_request_limit,(p_limits->>'dailyRequests')::bigint,20);
  day_limit := coalesce(account.daily_token_limit,(p_limits->>'dailyTokens')::bigint,1000000);
  month_limit := coalesce(account.monthly_token_limit,(p_limits->>'monthlyTokens')::bigint,10000000);
  concurrency_limit := least(5,greatest(1,coalesce((p_limits->>'concurrent')::integer,1)));
  if request_limit<1 or day_limit<1 or month_limit<1 then raise exception 'Invalid account limits'; end if;
  -- Expired runs retain their reservation: a killed worker must never grant free retries.
  update public.ai_budget_requests set state='expired' where owner_id=p_owner_id and state='running' and expires_at<=now();
  select count(*) filter(where created_at>=date_trunc('day',now())),
         coalesce(sum(charged_tokens) filter(where created_at>=date_trunc('day',now())),0),
         coalesce(sum(charged_tokens),0)
    into daily_requests,daily_tokens,monthly_tokens
    from public.ai_budget_requests where owner_id=p_owner_id and created_at>=date_trunc('month',now());
  select count(*) into active_count from public.ai_budget_requests where owner_id=p_owner_id and state='running';
  select count(*) into image_count from public.ai_budget_requests where owner_id=p_owner_id and kind='image' and created_at>=date_trunc('day',now());
  if p_kind='image' and image_count>=greatest(1,coalesce((p_limits->>'imageDailyRequests')::integer,2)) then return jsonb_build_object('allowed',false,'reason','image_daily_limit'); end if;
  if active_count>=concurrency_limit then return jsonb_build_object('allowed',false,'reason','concurrency_limit'); end if;
  if daily_requests>=request_limit or daily_tokens+p_reserved_tokens>day_limit or monthly_tokens+p_reserved_tokens>month_limit then
    return jsonb_build_object('allowed',false,'reason','budget_limit');
  end if;
  insert into public.ai_budget_requests(owner_id,request_id,fingerprint,state,charged_tokens,kind)
    values(p_owner_id,p_request_id,p_fingerprint,'running',p_reserved_tokens,p_kind);
  return jsonb_build_object('allowed',true,'reason',null,'olympusEntitled',account.olympus_entitled,'planCode',account.plan_code,'status',account.status,
    'limits',jsonb_build_object('dailyRequests',request_limit,'dailyTokens',day_limit,'monthlyTokens',month_limit),
    'usage',jsonb_build_object('dailyRequests',daily_requests+1,'dailyTokens',daily_tokens+p_reserved_tokens,'monthlyTokens',monthly_tokens+p_reserved_tokens),
    'remaining',jsonb_build_object('dailyRequests',request_limit-daily_requests-1,'dailyTokens',day_limit-daily_tokens-p_reserved_tokens,'monthlyTokens',month_limit-monthly_tokens-p_reserved_tokens));
end;
$$;
revoke all on function public.reserve_ai_budget(uuid,uuid,text,bigint,jsonb,text) from public,anon,authenticated;
grant execute on function public.reserve_ai_budget(uuid,uuid,text,bigint,jsonb,text) to service_role;

create function public.settle_ai_budget(p_owner_id uuid, p_request_id uuid, p_charged_tokens bigint, p_failed boolean, p_trace jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_charged_tokens<0 or jsonb_typeof(p_trace)<>'array' or jsonb_array_length(p_trace)>4 then raise exception 'Invalid budget settlement'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('olyhub-budget:'||p_owner_id::text,0));
  update public.ai_budget_requests set state=case when p_failed then 'failed' else 'completed' end,
    charged_tokens=p_charged_tokens,trace=p_trace,completed_at=now()
    where owner_id=p_owner_id and request_id=p_request_id and state in ('running','expired');
  return found;
end;
$$;
revoke all on function public.settle_ai_budget(uuid,uuid,bigint,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.settle_ai_budget(uuid,uuid,bigint,boolean,jsonb) to service_role;

-- Execution/usage receipts, like reservations, are now written only by the backend.
revoke insert on public.executions, public.usage_events from authenticated;


-- Content checkpoints belong to the conversation and are deleted with it.
-- Financial reservations above survive content deletion.
create table public.ai_stage_checkpoints (
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  stage text not null check (length(stage) between 1 and 64),
  provider text not null, model text not null,
  content text not null check (length(content)<=40000),
  created_at timestamptz not null default now(),
  primary key(owner_id,request_id,stage),
  foreign key(owner_id,request_id) references public.ai_budget_requests(owner_id,request_id) on delete cascade
);
create index ai_stage_checkpoints_conversation_idx on public.ai_stage_checkpoints(conversation_id);
alter table public.ai_stage_checkpoints enable row level security;
create policy ai_stage_checkpoints_select_own on public.ai_stage_checkpoints for select to authenticated using ((select auth.uid())=owner_id);
revoke all on public.ai_stage_checkpoints from public,anon,authenticated;
grant select on public.ai_stage_checkpoints to authenticated;
grant all on public.ai_stage_checkpoints to service_role;
