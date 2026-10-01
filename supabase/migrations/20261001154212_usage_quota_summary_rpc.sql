create or replace function public.get_my_usage_summary()
returns table (
  daily_requests bigint,
  daily_tokens bigint,
  monthly_tokens bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (
    select auth.uid() as uid
  )
  select
    (
      select count(*)
      from public.executions e, me
      where e.owner_id = me.uid
        and e.created_at >= date_trunc('day', now())
    )::bigint as daily_requests,
    (
      select coalesce(sum(u.total_tokens), 0)
      from public.usage_events u, me
      where u.owner_id = me.uid
        and u.created_at >= date_trunc('day', now())
    )::bigint as daily_tokens,
    (
      select coalesce(sum(u.total_tokens), 0)
      from public.usage_events u, me
      where u.owner_id = me.uid
        and u.created_at >= date_trunc('month', now())
    )::bigint as monthly_tokens;
$$;

revoke all on function public.get_my_usage_summary() from public, anon;
grant execute on function public.get_my_usage_summary() to authenticated;
