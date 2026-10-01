alter table public.profiles
  add column onboarding_completed boolean not null default false,
  add column onboarding_completed_at timestamptz;

create or replace function public.complete_my_onboarding()
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.profiles
  set
    onboarding_completed = true,
    onboarding_completed_at = now()
  where id = auth.uid();
$$;

revoke all on function public.complete_my_onboarding() from public, anon;
grant execute on function public.complete_my_onboarding() to authenticated;
