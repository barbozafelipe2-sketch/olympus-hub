# OlyHub Commercial Architecture

Status: Project continuity + memory/files foundation
Repository: `barbozafelipe2-sketch/olympus-hub`
Active code line: `main`

## Product boundary

This repository is the commercial OlyHub product intended for customer distribution and eventual Apple App Store packaging.

It must remain separate from `barbozafelipe2-sketch/zeus-proxy`, which is Felipe's private/personal environment.

Never copy personal data, private prompts, unrestricted admin capabilities, credentials, personal memory, or private execution rules from Zeus Proxy into the commercial product.

## Product thesis

OlyHub does not win by pretending to own a better base model than OpenAI, Anthropic or Google.

It wins by owning continuity:
- Projects
- persistent conversations
- scoped memory
- files
- artifacts
- tasks
- traces
- cross-device return state

The provider is infrastructure. OlyHub owns the user's working context.

## Commercial surfaces

### Home
Open-ended conversation. The user can choose:
- OpenAI
- Google AI
- Claude
- Zeus
- Olympus

### Projects
Durable customer workspaces backed by Supabase.

Each Project currently has exactly one durable conversation. Opening a Project restores the saved chat and saved mode. User and assistant messages persist in Postgres under owner-scoped RLS.

Provider/model/request metadata is stored with assistant messages for future trace views.

Implemented workspace layers:
- persistent conversations
- approved project memory
- private project files

Next layers:
- artifact generation/versioning
- project task execution
- execution traces

## Identity and authorization

Supabase Auth is the identity source for the commercial product.

Browser:
- Supabase project URL
- Supabase publishable key

Server:
- Supabase project URL
- Supabase publishable key for bearer-token verification
- Provider secrets remain server only

Authorization is database-enforced with RLS. The client supplies ownership IDs for inserts, but policies independently require them to equal `auth.uid()`.

No authorization decision is based on user-editable `user_metadata`.

## Data model

### profiles
Private customer profile row keyed to `auth.users.id`.

### projects
Durable customer workspaces.

### conversations
One durable conversation per Project today. The database enforces uniqueness for non-null `project_id`.

### messages
Persistent conversation messages. Assistant rows can store request/provider/model/fallback metadata.

### project_tasks
Project-scoped work items.

### project_memories
Explicit user-approved context. Per scope the database enforces 40 items, 15,000 total characters, deduplication, kind and importance ranking.

### project_files
Metadata for private Storage objects. Object paths are bound to user ID + Project ID and protected separately by Storage RLS.

All exposed product tables have RLS enabled.

## Project chat lifecycle

1. User opens a Project.
2. OlyHub loads or creates the Project conversation.
3. Saved messages and saved mode are restored.
4. The Project name and goal are passed to the server as validated context.
5. The user message is persisted before provider execution.
6. The provider response is persisted with run metadata.
7. Project/conversation activity timestamps are refreshed.
8. If provider execution fails, retry reuses the saved message rather than duplicating it.

This gives OlyHub a durable return point instead of a disposable chat session.

## Mode contract

### Direct provider modes
OpenAI, Google AI and Claude route to the named provider when that provider adapter is configured.

OpenAI is the required fallback provider for unavailable or unhealthy provider adapters.

### Zeus
Zeus is the default daily orchestration mode:
1. compile request and constraints
2. select the strongest single available route
3. use OpenAI as fallback
4. add at most one reviewer when expected review value justifies latency/cost
5. return one integrated answer

### Olympus
Olympus is a deliberate council mode:
1. compile the request
2. choose 2 specialists, or 3 for heavier work
3. allow at most 1 focused critic
4. Director integrates disagreements
5. return one answer

The current API does not claim real council execution yet. Until adapters/orchestration are implemented, Olympus degrades transparently to the OpenAI foundation route.

## Security boundary

- Provider secrets are server-only.
- Supabase secret/service-role keys are never used in the browser.
- `/api/chat` requires a verified Supabase bearer token.
- Client payloads are validated server-side with Zod.
- Project context is separately schema-validated.
- Client-controlled system prompts are not accepted.
- Errors returned to clients are normalized.
- Destructive or externally consequential actions will use PREPARE -> SHOW USER -> APPROVE -> EXECUTE -> VERIFY.
- Public-schema tables use RLS and owner checks.
- Privileged helper functions live in `app_private`, not `public`.

## Current stack

- React + TypeScript
- Vite
- Supabase Auth + Postgres + RLS
- Zod validation
- Vercel server functions
- OpenAI Responses API foundation route

## Apple App Store path

The React product must be stable before native packaging is added. The expected path is a native wrapper such as Capacitor, with bundle identity, Sign in with Apple requirements when applicable, privacy disclosures, purchase/subscription rules, push notification entitlements and App Store review assets handled as a dedicated release phase.

Do not treat a responsive web build alone as App Store-ready.

## Definition of done before public beta

- Authentication ✅
- Per-user/project RLS ✅
- Persistent Projects ✅
- Persistent Project conversations ✅
- Locked dependency install + executable smoke ✅
- Account deletion
- Real file upload and secure object storage ✅
- Artifact persistence/versioning
- Memory policy and bounded approved context ✅
- Long-history compaction/summarization
- Provider adapter registry and health/fallback rules
- Zeus and Olympus orchestration implemented and traceable
- Server-side quotas/rate limits
- Usage/cost ledger
- Privacy policy and terms
- Observability and provider failure traces
- End-to-end tests for chat, upload, projects and account isolation
