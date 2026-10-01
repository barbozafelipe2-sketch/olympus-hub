# OlyHub Commercial

OlyHub is the commercial React product for customer distribution and eventual Apple App Store release.

> Repository boundary: this codebase is **not** the private `zeus-proxy` product. Personal prompts, memory, credentials and unrestricted admin capabilities must not cross into this repository.

## Current foundation

- React + TypeScript + Vite
- Supabase Auth
- Per-user Row Level Security
- Persistent Projects
- Persistent Home chats and one durable chat per Project
- Project task creation and status tracking
- Private source-file storage for TXT, MD, CSV, JSON, XML and HTML
- Persistent Markdown answer artifacts with short-lived download links
- Responsive Home chat shell
- Five product modes: Zeus, Olympus, OpenAI, Claude and Google AI
- File upload and analysis for supported text formats
- Artifact saving, listing, download and deletion
- Server-only AI route protected by a verified Supabase user session
- Zod request validation
- OpenAI fallback foundation
- GitHub CI for typecheck and build
- Database migrations tracked under `supabase/migrations`

This stage has working authentication, persistent Home and Project chats, private supported-file uploads, project tasks, and saved Markdown answers. Claude and Google currently use the OpenAI fallback, and Olympus is a single OpenAI route until those adapters and the council workflow are implemented. Web research, image generation, billing, account deletion, and native App Store packaging are not included in this stage.

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

1. Install from the committed lockfile:
   `npm ci`
2. Copy environment template:
   `cp .env.example .env.local`
3. Configure the browser-safe Supabase values and server-side AI values.
4. Run the Vercel development runtime so `/api/chat` is available.

## Validation

- `npm run typecheck`
- `npm run build`

CI runs both checks for commercial branches and pull requests to `main`.

Run `npm run smoke` after the production build. The current live Supabase project must also receive the migrations before authentication, storage and RLS-backed features can work in a deployment.

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
