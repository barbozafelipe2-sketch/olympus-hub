# OlyHub Commercial

OlyHub is the commercial React product for customer distribution and eventual Apple App Store release.

> Repository boundary: this codebase is **not** the private `zeus-proxy` product. Personal prompts, private memory, credentials and unrestricted personal capabilities must not cross into this repository.

## Product thesis

OlyHub is not trying to own a better foundation model than OpenAI, Anthropic or Google. It owns the user's working continuity: conversations, Projects, approved memory, private files, tasks, artifacts and execution traces.

The target experience is: **“my work is already here and OlyHub already knows what to do next.”**

## What works now

- React + TypeScript + Vite.
- Supabase Auth with per-user Row Level Security.
- Persistent Home conversations with recent-chat restoration.
- Persistent Projects with one durable conversation per Project.
- Deterministic long-history Project checkpoints plus recent canonical messages loaded server-side.
- Approved Project memory with database limits: 40 items / 15,000 characters per scope.
- Durable Project tasks; Zeus/Olympus receive the current task state as context.
- Private Project file upload/download/delete through Supabase Storage.
- Capability Broker reading for private text, Markdown, CSV and JSON files when explicitly requested.
- Versioned artifacts in Home and Projects with download/delete and immutable revisions.
- Direct OpenAI, Anthropic and Google AI provider adapters.
- Zeus routing with OpenAI fallback and conditional reviewer/director flow.
- Olympus multi-call specialist + critic + Director flow.
- Durable execution traces with exact provider/model/request routing.
- Provider-reported token usage aggregated across every orchestration call.
- Server-side usage ledger and configurable account/global quotas.
- Settings surface for usage, plan state and account limits.
- Complete server-side account deletion including private Storage cleanup.
- Persistent onboarding.
- Honest configuration health endpoint at `/api/health`.
- Installable PWA foundation with API responses excluded from service-worker caching.
- Locked npm dependencies and main-only CI:
  `npm ci -> typecheck -> build -> smoke`.

## Capability boundary

Project file content is currently readable only for:

- `text/plain`
- `text/markdown`
- `text/csv`
- `application/json`

PDF, DOCX, XLSX, PPTX, images, audio and video can be stored privately but are not yet parsed by the AI capability layer. OlyHub must not claim those contents were read.

Home supports persistent conversations and versioned artifacts. Persistent file storage, approved memory, tasks and a durable goal belong to Projects.

## Provider behavior

OpenAI is the required fallback provider.

- Direct OpenAI -> OpenAI.
- Direct Claude -> Anthropic when available, otherwise OpenAI fallback.
- Direct Google AI -> Google when available, otherwise OpenAI fallback.
- Zeus chooses a route and may add one reviewer for higher-value review cases.
- Olympus uses multiple specialist calls plus a focused critic and Director when providers are available.

The UI trace describes what actually ran. Configured credentials are not described as live provider health.

## Environment

Browser-safe:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Server-only:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` — required for complete account deletion
- `OPENAI_API_KEY`
- `OPENAI_DEFAULT_MODEL` — optional
- `OPENAI_FALLBACK_MODEL` — optional
- `ANTHROPIC_API_KEY` — optional
- `ANTHROPIC_MODEL` — optional
- `GOOGLE_AI_API_KEY` — optional
- `GOOGLE_AI_MODEL` — optional
- `OLYHUB_DAILY_REQUEST_LIMIT` — optional global safety limit
- `OLYHUB_DAILY_TOKEN_LIMIT` — optional global safety limit
- `OLYHUB_MONTHLY_TOKEN_LIMIT` — optional global safety limit

Never expose a Supabase secret/admin key or provider key through a `VITE_*` variable.

## Database

Current commercial tables include:

- `profiles`
- `projects`
- `conversations`
- `messages`
- `conversation_checkpoints`
- `project_tasks`
- `project_memories`
- `project_files`
- `artifacts`
- `artifact_versions`
- `executions`
- `account_limits`
- `usage_events`

All exposed product tables have RLS enabled.

## Validation

- `npm ci`
- `npm run typecheck`
- `npm run build`
- `npm run smoke`

CI runs on `main` and pull requests targeting `main`. `main` is the only active commercial development line.

## Release status

The web/PWA product is **not yet App Store-ready**. Native packaging, Apple Developer/App Store Connect identity, privacy/terms URLs, final business model/IAP configuration, native privacy manifest, store assets and runtime E2E/account-isolation testing remain release gates.

See:
- [Commercial architecture](docs/COMMERCIAL_ARCHITECTURE.md)
- [Product strategy](docs/PRODUCT_STRATEGY.md)
- [App Store release gates](docs/APP_STORE_RELEASE.md)
