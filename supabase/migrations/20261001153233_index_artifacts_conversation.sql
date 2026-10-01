create index artifacts_conversation_updated_idx
on public.artifacts (conversation_id, updated_at desc)
where conversation_id is not null;
