# OlyHub Commercial

OlyHub is the commercial React product for customer distribution and eventual Apple App Store release.

> Repository boundary: this codebase is **not** the private `zeus-proxy` product. Personal prompts, memory, credentials and unrestricted admin capabilities must not cross into this repository.

## Current foundation

- React + TypeScript + Vite
- Supabase Auth
- Per-user Row Level Security
- Persistent Projects
- Responsive Home chat shell
- Five product modes: Zeus, Olympus, OpenAI, Claude and Google AI
- File selection UI
- Artifact rail
- Server-only AI route protected by a verified Supabase user session
- Zod request validation
- OpenAI fallback foundation
- GitHub CI for typecheck and build
- Database migrations tracked under `supabase/migrations`

The current foundation is intentionally honest about what is not implemented yet: persistent project conversations in the UI, real file transport/storage, artifact generation/persistence, billing, account deletion, real Claude/Google adapters and true Olympus council execution.

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

1. Install from the committed lockfile once present:
   `npm ci`
2. Copy environment template:
   `cp .env.example .env.local`
3. Configure the browser-safe Supabase values and server-side AI values.
4. Run the Vercel development runtime so `/api/chat` is available.

## Validation

- `npm run typecheck`
- `npm run build`

CI runs both checks for commercial branches and pull requests to `main`.

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

All exposed tables have RLS enabled. Policies restrict rows to `auth.uid()` ownership and dependent rows validate their parent project/conversation ownership.

## Rollback

React foundation merge: `78c42f734f9d0b720c8a75311462ae8ed742796d`.

The Supabase/auth changes are developed on `commercial-supabase-foundation`; rollback code to the React foundation commit if this stage fails validation.
