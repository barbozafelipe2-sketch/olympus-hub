# Changelog

## 0.3.0 - Project continuity

### Added
- One durable conversation per Project.
- Project chat restoration from Supabase.
- Persistent user and assistant messages.
- Saved mode per Project conversation.
- Retry after provider failure without duplicating the saved user message.
- Validated Project name/goal context passed into the server-side AI request.
- Provider/model/request metadata stored with assistant messages.
- Project activity timestamps refreshed after successful responses.

### Changed
- Project cards now open the persistent conversation directly.
- CI now treats `main` as the only active commercial branch.

### Known gaps
- File selection still does not upload file bytes.
- Artifacts are not generated/persisted yet.
- Account deletion is not implemented yet.
- Claude and Google adapters are not enabled yet.
- Olympus is not yet a real multi-model council.
- Long project histories still need summarization/memory compaction.

## 0.2.0 - Supabase commercial foundation

### Added
- Supabase Auth sign-in/sign-up flow.
- Typed Supabase client using the new publishable-key pattern.
- Persistent Projects backed by Postgres.
- RLS-protected tables for profiles, projects, conversations, messages and project tasks.
- Private-schema helper functions and user-profile trigger.
- Generated database TypeScript types.
- Tracked SQL migration files.
- Product strategy document focused on durable work instead of model aggregation.
- Authenticated bearer token on `/api/chat`.

### Security
- Every public product table has RLS enabled.
- Anonymous table access is revoked.
- Project/message/task policies validate ownership with `auth.uid()`.
- The AI route verifies the bearer token with Supabase Auth before spending provider tokens.
- No service-role or secret Supabase key is used in the browser.
- User-editable metadata is not used for authorization.

## 0.1.0 - Commercial React foundation

### Added
- React + TypeScript + Vite application foundation.
- Commercial OlyHub Home and Projects surfaces.
- Five-mode product selector.
- Local attachment selection UI and artifact rail.
- Zod-validated server chat contract.
- OpenAI Responses API foundation route.
- Root Vercel configuration.
- CI typecheck/build workflow.
- Commercial architecture and repository-separation documentation.

### Changed
- Replaced the single-file Pegasus mock shell with an OlyHub React entrypoint.
- Removed client ability to inject a system prompt into the provider request.

### Security
- Provider keys remain server-only.
- Provider error bodies are not returned directly to customers.
- Client payload size and roles are validated.
