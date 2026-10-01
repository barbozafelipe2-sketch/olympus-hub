create unique index conversations_one_per_project_idx
on public.conversations (project_id)
where project_id is not null;
