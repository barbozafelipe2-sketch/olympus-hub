create index ai_response_cache_conversation_idx on public.ai_response_cache(conversation_id);
create index image_workflow_jobs_artifact_idx on public.image_workflow_jobs(artifact_id);
create index image_workflow_jobs_owner_idx on public.image_workflow_jobs(owner_id);
-- Intentionally server-only: clients have no grants and an explicit deny policy.
create policy ai_response_cache_no_client_access on public.ai_response_cache for all to anon,authenticated using(false) with check(false);

alter table public.ai_budget_requests add column cost_reconciliations jsonb not null default '[]'::jsonb;
create function public.reconcile_ai_cost(p_owner_id uuid,p_request_id uuid,p_actual_microusd bigint,p_reference text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare r public.ai_budget_requests%rowtype;
begin
 if p_actual_microusd is null or p_actual_microusd<0 or p_actual_microusd>10000000000 or coalesce(length(p_reference),0) not between 1 and 200 then raise exception 'Invalid provider invoice reconciliation'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('olyhub-budget:'||p_owner_id::text,0));
 select * into r from public.ai_budget_requests where owner_id=p_owner_id and request_id=p_request_id for update;
 if not found or r.state not in ('completed','failed','expired') then return false; end if;
 if exists(select 1 from jsonb_array_elements(r.cost_reconciliations) e where e->>'reference'=p_reference) then return true; end if;
 update public.ai_budget_requests set reserved_cost_microusd=p_actual_microusd,
  cost_reconciliations=cost_reconciliations||jsonb_build_array(jsonb_build_object('before',reserved_cost_microusd,'after',p_actual_microusd,'reference',p_reference,'at',now()))
 where owner_id=p_owner_id and request_id=p_request_id;
 return true;
end $$;
revoke all on function public.reconcile_ai_cost(uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.reconcile_ai_cost(uuid,uuid,bigint,text) to service_role;
