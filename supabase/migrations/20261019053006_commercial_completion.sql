create or replace function public.authorize_ai_attempt(p_owner_id uuid,p_request_id uuid,p_event jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c jsonb; r jsonb; a jsonb; role_name text; mode_name text; tier_name text; token_bound bigint; role_allowed boolean; cost bigint; spent bigint;
begin
  c:=public.check_ai_execution(p_owner_id,p_request_id);
  if not (c->>'allowed')::boolean then return c; end if; r:=c->'reservation'; a:=c->'account';
  if p_event is null or jsonb_typeof(p_event)<>'object' or coalesce(p_event->>'attemptId','') !~ '^[a-f0-9-]{36}$'
    or coalesce(p_event->>'inputChars','') !~ '^[0-9]{1,5}$' or coalesce(p_event->>'outputTokens','') !~ '^[0-9]{1,4}$'
    or (p_event->>'inputChars')::integer>24000 or (p_event->>'outputTokens')::integer not between 1 and 4096
    or coalesce(length(p_event->>'model'),0) not between 1 and 200 or coalesce(p_event->>'provider','') not in ('openai','anthropic','google','openrouter','gemini') then
    return jsonb_build_object('allowed',false,'reason','invalid_attempt'); end if;
  role_name:=p_event->>'role'; mode_name:=p_event->>'mode'; tier_name:=p_event->>'tier';
  if role_name is null or mode_name is null or tier_name is null then return jsonb_build_object('allowed',false,'reason','invalid_attempt'); end if;
  if exists(select 1 from jsonb_array_elements(r->'permits') e where e->>'attemptId'=p_event->>'attemptId') then
    return jsonb_build_object('allowed',false,'reason','attempt_already_authorized'); end if;
  if role_name='router' then
    role_allowed:=r->>'kind'='text' and r->>'route_mode' is null and (r->>'calls_authorized')::integer=0;
  elsif role_name='capability:generate_image' then
    role_allowed:=mode_name='zeus' and r->>'kind'='image' and r->>'route_mode'='zeus' and (a->>'allow_image')::boolean and tier_name='capability';
  elsif role_name='capability:web_search' then
    role_allowed:=r->>'kind'='text' and r->>'route_mode'=mode_name and (r->>'allow_web')::boolean and (a->>'allow_web')::boolean and tier_name='capability';
  else
    role_allowed:=r->>'route_mode'=mode_name and case (r->>'route_level')::integer
      when 1 then role_name='lead' when 2 then role_name in ('author','finisher')
      when 3 then role_name in ('author','critic','finisher') when 4 then role_name in ('specialist-1','specialist-2','director','ceo') else false end;
  end if;
  if not coalesce(role_allowed,false) then return jsonb_build_object('allowed',false,'reason','role_not_allowed'); end if;
  if mode_name not in ('zeus','olympus') or (mode_name='olympus' and (not (r->>'allow_olympus')::boolean or not (a->>'olympus_entitled')::boolean)) then
    return jsonb_build_object('allowed',false,'reason','olympus_not_entitled'); end if;
  if role_name not like 'capability:%' and (tier_name not in ('economy','premium') or not (a->'allowed_model_tiers' ? tier_name)) then
    return jsonb_build_object('allowed',false,'reason','model_tier_not_allowed'); end if;
  if r->>'route_level' is not null and (r->>'route_level')::integer>(a->>'max_execution_level')::integer then
    return jsonb_build_object('allowed',false,'reason','plan_level_not_allowed'); end if;
  token_bound:=(p_event->>'inputChars')::bigint*4+(p_event->>'outputTokens')::bigint;
  if (r->>'calls_authorized')::integer>=(r->>'max_calls')::integer or (r->>'tokens_authorized')::bigint+token_bound>(r->>'reserved_tokens')::bigint then
    return jsonb_build_object('allowed',false,'reason','execution_budget_exhausted'); end if;
  if coalesce(p_event->>'estimatedMicrousd','') !~ '^[0-9]{1,12}$' or (p_event->>'estimatedMicrousd')::bigint<1 then return jsonb_build_object('allowed',false,'reason','cost_quote_missing'); end if;
  cost:=(p_event->>'estimatedMicrousd')::bigint;
  select coalesce(sum(reserved_cost_microusd),0) into spent from public.ai_budget_requests where owner_id=p_owner_id and created_at>=date_trunc('month',now());
  if spent+cost>(a->>'monthly_cost_limit_microusd')::bigint then return jsonb_build_object('allowed',false,'reason','monthly_cost_limit'); end if;
  update public.ai_budget_requests set reserved_cost_microusd=reserved_cost_microusd+cost,calls_authorized=calls_authorized+1,tokens_authorized=tokens_authorized+token_bound,permits=permits||jsonb_build_array(p_event)
    where owner_id=p_owner_id and request_id=p_request_id;
  return jsonb_build_object('allowed',true,'attemptId',p_event->>'attemptId');
end; $$;
revoke all on function public.authorize_ai_attempt(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.authorize_ai_attempt(uuid,uuid,jsonb) to service_role;

alter table public.ai_stage_checkpoints add column input_hash text;
-- Conversation content must disappear when its conversation/account is deleted; financial rows remain.
create table public.ai_response_cache (
 owner_id uuid not null references auth.users(id) on delete cascade,request_id uuid not null,
 conversation_id uuid references public.conversations(id) on delete cascade,
 response jsonb not null,primary key(owner_id,request_id),
 foreign key(owner_id,request_id) references public.ai_budget_requests(owner_id,request_id)
);
alter table public.ai_response_cache enable row level security;
revoke all on public.ai_response_cache from public,anon,authenticated;
grant all on public.ai_response_cache to service_role;

grant select on public.conversations to service_role;
grant select,insert on public.messages to service_role;
create function public.complete_ai_response(p_owner_id uuid,p_request_id uuid,p_conversation_id uuid,p_response jsonb,p_tokens bigint,p_trace jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.ai_budget_requests%rowtype; m public.messages%rowtype; cached jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('olyhub-budget:'||p_owner_id::text,0));
  select * into r from public.ai_budget_requests where owner_id=p_owner_id and request_id=p_request_id for update;
  if not found then raise exception 'Reservation unavailable'; end if;
  select response into cached from public.ai_response_cache where owner_id=p_owner_id and request_id=p_request_id;
  if found then return cached; end if;
  if r.state not in ('running','expired') or length(coalesce(p_response->>'reply','')) not between 1 and 100000 or p_tokens<0 or jsonb_typeof(p_trace)<>'array' or jsonb_array_length(p_trace)>6 then raise exception 'Invalid completion'; end if;
  if p_conversation_id is not null then
    if not exists(select 1 from public.conversations where id=p_conversation_id and owner_id=p_owner_id) then raise exception 'Conversation unavailable'; end if;
    insert into public.messages(owner_id,conversation_id,role,content,metadata)
    values(p_owner_id,p_conversation_id,'assistant',p_response->>'reply',jsonb_build_object('request_id',p_request_id,'sources',p_response->'sources','execution_id',p_response->'executionId')) returning * into m;
    p_response:=p_response||jsonb_build_object('assistantMessage',jsonb_build_object('id',m.id,'role','assistant','content',m.content,'createdAt',m.created_at,'sources',p_response->'sources'));
  end if;
  update public.ai_budget_requests set state='completed',charged_tokens=p_tokens,trace=p_trace,completed_at=now() where owner_id=p_owner_id and request_id=p_request_id;
  insert into public.ai_response_cache(owner_id,request_id,conversation_id,response) values(p_owner_id,p_request_id,p_conversation_id,p_response);
  return p_response;
end $$;
revoke all on function public.complete_ai_response(uuid,uuid,uuid,jsonb,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.complete_ai_response(uuid,uuid,uuid,jsonb,bigint,jsonb) to service_role;

create table public.image_workflow_assets (
 artifact_id uuid primary key references public.artifacts(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 group_id uuid not null,
 prompt text not null check(length(prompt)<=12000),
 provider text not null,model text not null,
 operation text not null check(operation in ('original','generate','compare','combine')),
 source_ids uuid[] not null default '{}',selected boolean not null default false,
 created_at timestamptz not null default now()
);
create index image_workflow_group_idx on public.image_workflow_assets(owner_id,group_id,created_at);
alter table public.image_workflow_assets enable row level security;
create policy image_workflow_read on public.image_workflow_assets for select to authenticated using((select auth.uid())=owner_id);
revoke all on public.image_workflow_assets from public,anon,authenticated;
grant select on public.image_workflow_assets to authenticated;
grant all on public.image_workflow_assets to service_role;
create table public.image_workflow_jobs (
 request_id uuid primary key,owner_id uuid not null references auth.users(id) on delete cascade,
 state text not null check(state in ('running','completed','failed')),
 artifact_id uuid references public.artifacts(id) on delete set null,
 created_at timestamptz not null default now()
);
alter table public.image_workflow_jobs enable row level security;
create policy image_workflow_jobs_read on public.image_workflow_jobs for select to authenticated using((select auth.uid())=owner_id);
revoke all on public.image_workflow_jobs from public,anon,authenticated;
grant select on public.image_workflow_jobs to authenticated;
grant all on public.image_workflow_jobs to service_role;
create function public.select_image_version(p_owner_id uuid,p_artifact_id uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare g uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('olyhub-images:'||p_owner_id::text,0));
 select group_id into g from public.image_workflow_assets where artifact_id=p_artifact_id and owner_id=p_owner_id;
 if not found then return false; end if;
 update public.image_workflow_assets set selected=(artifact_id=p_artifact_id) where owner_id=p_owner_id and group_id=g;
 return true;
end $$;
revoke all on function public.select_image_version(uuid,uuid) from public,anon,authenticated;
grant execute on function public.select_image_version(uuid,uuid) to service_role;

alter table public.account_limits
 add column subscription_expires_at timestamptz,
 add column subscription_checked_at timestamptz,
 add column billing_managed boolean not null default false,
 add column monthly_cost_limit_microusd bigint not null default 1000000 check(monthly_cost_limit_microusd>0);
alter table public.ai_budget_requests add column reserved_cost_microusd bigint not null default 0 check(reserved_cost_microusd>=0);
create function public.sync_apple_subscription(p_owner_id uuid,p_plan jsonb,p_expires_at timestamptz,p_observed_at timestamptz) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('olyhub-budget:'||p_owner_id::text,0));
 if not exists(select 1 from public.account_limits where user_id=p_owner_id) then return true; end if;
 if p_observed_at is null or p_observed_at>now()+interval '1 minute' then raise exception 'Invalid snapshot'; end if;
 if exists(select 1 from public.account_limits where user_id=p_owner_id and subscription_checked_at>=p_observed_at) then return true; end if;
 update public.account_limits set subscription_checked_at=p_observed_at where user_id=p_owner_id;
 -- Preserve administrative blocks; a purchase may never unblock a banned account.
 if p_plan is null then
  update public.account_limits set plan_code='free',billing_managed=true,subscription_expires_at=null,
   olympus_entitled=false,max_execution_level=2,allowed_model_tiers=array['economy'],allow_image=false,allow_web=false,
   daily_request_limit=5,daily_token_limit=400384,monthly_token_limit=1000960,monthly_cost_limit_microusd=100000
   where user_id=p_owner_id;
 else
  if p_expires_at is null or p_expires_at<=now() or (p_plan->>'monthlyCostMicrousd')::bigint<=0 then raise exception 'Invalid plan'; end if;
  update public.account_limits set plan_code=p_plan->>'code',billing_managed=true,subscription_expires_at=p_expires_at,
   olympus_entitled=(p_plan->>'maxLevel')::integer>=3,max_execution_level=(p_plan->>'maxLevel')::integer,
   allowed_model_tiers=array(select jsonb_array_elements_text(p_plan->'allowedTiers')),
   allow_image=(p_plan->>'allowImage')::boolean,allow_web=(p_plan->>'allowWeb')::boolean,
   daily_request_limit=(p_plan->>'dailyRequests')::integer,daily_token_limit=(p_plan->>'dailyTokens')::bigint,
   monthly_token_limit=(p_plan->>'monthlyTokens')::bigint,monthly_cost_limit_microusd=(p_plan->>'monthlyCostMicrousd')::bigint
   where user_id=p_owner_id;
 end if;
 return true;
end $$;
revoke all on function public.sync_apple_subscription(uuid,jsonb,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.sync_apple_subscription(uuid,jsonb,timestamptz,timestamptz) to service_role;

create or replace function public.check_ai_execution(p_owner_id uuid,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.ai_budget_requests%rowtype; a public.account_limits%rowtype; d bigint; m bigint; n bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('olyhub-budget:'||p_owner_id::text,0));
  select * into r from public.ai_budget_requests where owner_id=p_owner_id and request_id=p_request_id for update;
  if not found or r.state<>'running' or r.expires_at<=now() or r.max_calls=0 then return jsonb_build_object('allowed',false,'reason','reservation_inactive'); end if;
  select * into a from public.account_limits where user_id=p_owner_id for update;
  if not found or a.status<>'active' then return jsonb_build_object('allowed',false,'reason','account_not_active'); end if;
  if a.billing_managed and (a.subscription_expires_at is null or a.subscription_expires_at<=now()) and a.plan_code<>'free' then return jsonb_build_object('allowed',false,'reason','subscription_expired'); end if;
  select count(*) filter(where created_at>=date_trunc('day',now())),
    coalesce(sum(charged_tokens) filter(where created_at>=date_trunc('day',now())),0),coalesce(sum(charged_tokens),0)
    into n,d,m from public.ai_budget_requests where owner_id=p_owner_id and created_at>=date_trunc('month',now());
  if n>coalesce(a.daily_request_limit,(r.admission_limits->>'dailyRequests')::bigint)
    or d>coalesce(a.daily_token_limit,(r.admission_limits->>'dailyTokens')::bigint)
    or m>coalesce(a.monthly_token_limit,(r.admission_limits->>'monthlyTokens')::bigint) then
    return jsonb_build_object('allowed',false,'reason','budget_limit_changed'); end if;
  return jsonb_build_object('allowed',true,'reservation',to_jsonb(r),'account',to_jsonb(a));
end; $$;
revoke all on function public.check_ai_execution(uuid,uuid) from public,anon,authenticated;
grant execute on function public.check_ai_execution(uuid,uuid) to service_role;
