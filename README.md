# OlyHub Commercial

OlyHub is the commercial React product for customer distribution and eventual Apple App Store release.

> Repository boundary: this codebase is **not** the private `zeus-proxy` product. Personal prompts, memory, credentials and unrestricted admin capabilities must not cross into this repository.

## Current foundation

- React + TypeScript + Vite
- Supabase Auth
- Per-user Row Level Security
- Persistent Projects
- One durable conversation per Project
- Persistent Project message history
- Retry without duplicating saved user messages
- Responsive Home chat shell
- Five product modes: Zeus, Olympus, OpenAI, Claude and Google AI
- Approved Project memory with 40-item / 15k-character database limits
- Real private Project file upload/download/delete through Supabase Storage
- Artifact rail
- Server-only AI route protected by a verified Supabase user session
- Validated Project context sent server-side
- Zod request validation
- OpenAI fallback foundation
- Locked npm dependencies
- GitHub CI: `npm ci -> typecheck -> build -> smoke`
- Database migrations tracked under `supabase/migrations`

The current foundation is intentionally honest about what is not implemented yet: model/tool reading of stored file contents, artifact generation/persistence, billing, account deletion, real Claude/Google adapters, long-history compaction and true Olympus council execution.

## Environment

Browser-safe Supabase values:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Server values:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `OPENAI_API_KEY`
- `OPENAI_DEFAULT_MODEL` — optional
- `OPENAI_FALLBACK_MODEL` — optional
- `ALLOWED_ORIGIN` — reserved for native/cross-origin hardening

Never expose a Supabase secret/service-role key or provider API key through a `VITE_*` variable.

## Local development

1. Install locked dependencies:
   `npm ci`
2. Copy environment template:
   `cp .env.example .env.local`
3. Configure the browser-safe Supabase values and server-side AI values.
4. Run the Vercel development runtime so `/api/chat` is available.

## Validation

- `npm run typecheck`
- `npm run build`
- `npm run smoke`

CI runs on `main` and on pull requests targeting `main`.

## Architecture

- [Commercial architecture](docs/COMMERCIAL_ARCHITECTURE.md)
- [Product strategy](docs/PRODUCT_STRATEGY.md)

## Database

The connected commercial Supabase project has:

- `profiles`
- `projects`
- `conversations`
- `messages`
- `project_tasks`
- `project_memories`
- `project_files`

All exposed tables have RLS enabled. Policies restrict rows to `auth.uid()` ownership and dependent rows validate their parent project/conversation ownership.

Projects currently use one durable conversation each, enforced by a partial unique index on `conversations.project_id`.

## Rollback

React foundation merge: `78c42f734f9d0b720c8a75311462ae8ed742796d`.

Supabase/auth foundation merge: `0c9dd6c62b49e923fd6f043ed9ab06fe3b4e214f`.

For later changes, use Git history on `main`; no parallel commercial feature branch is treated as active.


## Project memory

Project memory is explicit and user-controlled. Each project scope is limited by the database to 40 items and 15,000 total characters. Entries are ranked by importance and recency, deduplicated, and only approved entries are sent as memory context.

## Project files

Project files use the private `project-files` Supabase Storage bucket. Object paths are `<user-id>/<project-id>/<object>`, and Storage RLS checks both the authenticated user and project ownership. The current chat receives file metadata only and is instructed not to claim that file contents were read.
