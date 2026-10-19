-- New backend requires this migration before any paid attempt. Existing financial rows are retained.
alter table public.account_limits
  add column max_execution_level smallint not null default 4 check (max_execution_level between 1 and 4),
  add column allowed_model_tiers text[] not null default array['economy','premium']::text[]
    check (cardinality(allowed_model_tiers)>0 and allowed_model_tiers <@ array['economy','premium']::text[] and array_position(allowed_model_tiers,null) is null),
  add column allow_image boolean not null default true,
  add column allow_web boolean not null default true;
alter table public.ai_budget_requests
  add column reserved_tokens bigint not null default 0 check (reserved_tokens>=0),
  add column max_calls smallint not null default 0 check (max_calls between 0 and 6),
  add column calls_authorized smallint not null default 0 check (calls_authorized>=0 and calls_authorized<=max_calls),
  add column tokens_authorized bigint not null default 0 check (tokens_authorized>=0 and tokens_authorized<=reserved_tokens),
  add column route_mode text check (route_mode in ('zeus','olympus')),
  add column route_level smallint check (route_level between 1 and 4),
  add column allow_olympus boolean not null default false,
  add column allow_web boolean not null default false,
  add column admission_limits jsonb not null default '{}'::jsonb,
  add column permits jsonb not null default '[]'::jsonb check (jsonb_typeof(permits)='array' and jsonb_array_length(permits)<=6);
-- Historical/in-flight rows have max_calls=0: they cannot obtain new permits after rollout.
update public.ai_budget_requests set reserved_tokens=charged_tokens;

create or replace function public.reserve_ai_budget(p_owner_id uuid, p_request_id uuid, p_fingerprint text, p_reserved_tokens bigint, p_limits jsonb, p_kind text default 'text')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  account public.account_limits%rowtype;
  prior public.ai_budget_requests%rowtype;
  daily_requests bigint; daily_tokens bigint; monthly_tokens bigint; active_count integer;
  request_limit bigint; day_limit bigint; month_limit bigint; concurrency_limit integer; image_count integer;
begin
  if coalesce(p_limits->>'maxCalls','') !~ '^[1-6]$' or p_reserved_tokens <> (p_limits->>'maxCalls')::bigint * 100096 then raise exception 'Invalid call admission'; end if;
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
  if p_limits->>'engine'='olympus' and account.max_execution_level<3 then return jsonb_build_object('allowed',false,'reason','plan_level_not_allowed'); end if;
  if p_kind='image' and not account.allow_image then return jsonb_build_object('allowed',false,'reason','image_not_allowed'); end if;
  if coalesce((p_limits->>'allowWeb')::boolean,false) and not account.allow_web then return jsonb_build_object('allowed',false,'reason','web_not_allowed'); end if;
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
  insert into public.ai_budget_requests(owner_id,request_id,fingerprint,state,charged_tokens,kind,reserved_tokens,max_calls,allow_olympus,allow_web,admission_limits)
    values(p_owner_id,p_request_id,p_fingerprint,'running',p_reserved_tokens,p_kind,p_reserved_tokens,(p_limits->>'maxCalls')::int,
      p_limits->>'engine'='olympus' or coalesce((p_limits->>'allowOlympus')::boolean,false),coalesce((p_limits->>'allowWeb')::boolean,false),
      jsonb_build_object('dailyRequests',request_limit,'dailyTokens',day_limit,'monthlyTokens',month_limit));
  return jsonb_build_object('allowed',true,'reason',null,'olympusEntitled',account.olympus_entitled,'planCode',account.plan_code,'status',account.status,'authorizationPolicy',jsonb_build_object('maxLevel',account.max_execution_level,'allowedTiers',account.allowed_model_tiers,'allowImage',account.allow_image,'allowWeb',account.allow_web),
    'limits',jsonb_build_object('dailyRequests',request_limit,'dailyTokens',day_limit,'monthlyTokens',month_limit),
    'usage',jsonb_build_object('dailyRequests',daily_requests+1,'dailyTokens',daily_tokens+p_reserved_tokens,'monthlyTokens',monthly_tokens+p_reserved_tokens),
    'remaining',jsonb_build_object('dailyRequests',request_limit-daily_requests-1,'dailyTokens',day_limit-daily_tokens-p_reserved_tokens,'monthlyTokens',month_limit-monthly_tokens-p_reserved_tokens));
end;
$$;
revoke all on function public.reserve_ai_budget(uuid,uuid,text,bigint,jsonb,text) from public,anon,authenticated;
grant execute on function public.reserve_ai_budget(uuid,uuid,text,bigint,jsonb,text) to service_role;

create or replace function public.settle_ai_budget(p_owner_id uuid, p_request_id uuid, p_charged_tokens bigint, p_failed boolean, p_trace jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_charged_tokens is null or p_trace is null or p_charged_tokens<0 or jsonb_typeof(p_trace)<>'array' or jsonb_array_length(p_trace)>6 then raise exception 'Invalid budget settlement'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('olyhub-budget:'||p_owner_id::text,0));
  update public.ai_budget_requests set state=case when p_failed then 'failed' else 'completed' end,
    charged_tokens=p_charged_tokens,trace=p_trace,completed_at=now()
    where owner_id=p_owner_id and request_id=p_request_id and state in ('running','expired');
  return found;
end;
$$;
revoke all on function public.settle_ai_budget(uuid,uuid,bigint,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.settle_ai_budget(uuid,uuid,bigint,boolean,jsonb) to service_role;


-- Internal to service_role RPCs; uses the same owner lock as admission and settlement.
create function public.check_ai_execution(p_owner_id uuid,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.ai_budget_requests%rowtype; a public.account_limits%rowtype; d bigint; m bigint; n bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('olyhub-budget:'||p_owner_id::text,0));
  select * into r from public.ai_budget_requests where owner_id=p_owner_id and request_id=p_request_id for update;
  if not found or r.state<>'running' or r.expires_at<=now() or r.max_calls=0 then return jsonb_build_object('allowed',false,'reason','reservation_inactive'); end if;
  select * into a from public.account_limits where user_id=p_owner_id for update;
  if not found or a.status<>'active' then return jsonb_build_object('allowed',false,'reason','account_not_active'); end if;
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

create function public.bind_ai_execution(p_owner_id uuid,p_request_id uuid,p_mode text,p_level integer,p_max_calls integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c jsonb; r jsonb; a jsonb;
begin
  c:=public.check_ai_execution(p_owner_id,p_request_id);
  if not (c->>'allowed')::boolean then return c; end if; r:=c->'reservation'; a:=c->'account';
  if p_mode is null or p_level is null or p_max_calls is null or p_mode not in ('zeus','olympus') or p_level not between 1 and 4
    or p_max_calls<1 or p_max_calls>(r->>'max_calls')::integer or p_max_calls<(r->>'calls_authorized')::integer
    or ((p_level>=3)<>(p_mode='olympus')) then return jsonb_build_object('allowed',false,'reason','invalid_execution_plan'); end if;
  if r->>'route_mode' is not null then return jsonb_build_object('allowed',false,'reason','execution_already_bound'); end if;
  if p_level>(a->>'max_execution_level')::integer then return jsonb_build_object('allowed',false,'reason','plan_level_not_allowed'); end if;
  if p_mode='olympus' and (not (r->>'allow_olympus')::boolean or not (a->>'olympus_entitled')::boolean) then
    return jsonb_build_object('allowed',false,'reason','olympus_not_entitled'); end if;
  if r->>'kind'='image' and (p_mode<>'zeus' or p_level<>2 or p_max_calls<>1 or not (a->>'allow_image')::boolean) then
    return jsonb_build_object('allowed',false,'reason','image_not_allowed'); end if;
  update public.ai_budget_requests set max_calls=p_max_calls,route_mode=p_mode,route_level=p_level where owner_id=p_owner_id and request_id=p_request_id;
  return jsonb_build_object('allowed',true);
end; $$;
revoke all on function public.bind_ai_execution(uuid,uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.bind_ai_execution(uuid,uuid,text,integer,integer) to service_role;

create function public.authorize_ai_attempt(p_owner_id uuid,p_request_id uuid,p_event jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c jsonb; r jsonb; a jsonb; role_name text; mode_name text; tier_name text; token_bound bigint; role_allowed boolean;
begin
  c:=public.check_ai_execution(p_owner_id,p_request_id);
  if not (c->>'allowed')::boolean then return c; end if; r:=c->'reservation'; a:=c->'account';
  if p_event is null or jsonb_typeof(p_event)<>'object' or coalesce(p_event->>'attemptId','') !~ '^[a-f0-9-]{36}$'
    or coalesce(p_event->>'inputChars','') !~ '^[0-9]{1,5}$' or coalesce(p_event->>'outputTokens','') !~ '^[0-9]{1,4}$'
    or (p_event->>'inputChars')::integer>24000 or (p_event->>'outputTokens')::integer not between 1 and 4096
    or coalesce(length(p_event->>'model'),0) not between 1 and 200 or coalesce(p_event->>'provider','') not in ('openai','anthropic','google') then
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
  update public.ai_budget_requests set calls_authorized=calls_authorized+1,tokens_authorized=tokens_authorized+token_bound,permits=permits||jsonb_build_array(p_event)
    where owner_id=p_owner_id and request_id=p_request_id;
  return jsonb_build_object('allowed',true,'attemptId',p_event->>'attemptId');
end; $$;
revoke all on function public.authorize_ai_attempt(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.authorize_ai_attempt(uuid,uuid,jsonb) to service_role;
