create index project_tasks_owner_created_idx
on public.project_tasks (owner_id, created_at desc);
