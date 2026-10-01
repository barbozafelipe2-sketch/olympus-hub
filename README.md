# OlyHub Commercial

OlyHub is the commercial workspace with a React web/PWA client and a native React Native iOS app for Apple App Store distribution.

> Repository boundary: this codebase is **not** the private `zeus-proxy` product. Personal prompts, private memory, credentials and unrestricted personal capabilities must not cross into this repository.

## Product thesis

OlyHub is not trying to own a better foundation model than OpenAI, Anthropic or Google. It owns the user's working continuity: conversations, Projects, approved memory, private files, tasks, artifacts and execution traces.

The target experience is: **“my work is already here and OlyHub already knows what to do next.”**

## What works now

- React + TypeScript + Vite.
- Supabase Auth with per-user Row Level Security.
- Persistent Home conversations with paginated history restoration.
- Persistent Projects with one durable conversation per Project.
- Rolling Project checkpoints preserve previously covered history, append new batches, and disclose when the bounded checkpoint must trim its oldest excerpts.
- Approved Project memory with database limits: 40 items / 15,000 characters per scope.
- Durable Project tasks; Zeus/Olympus receive the current task state as context.
- Private Project file upload/download/delete through Supabase Storage.
- Capability Broker reading for private text, Markdown, CSV and JSON files when explicitly requested.
- Live web research through the OpenAI Responses `web_search` tool when current/search intent is detected.
- Persistent clickable web-source citations restored with conversation history.
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
- Native iOS client under `mobile/`, built with Expo SDK 57 / React Native 0.86 (not a WebView wrapper): auth, persistent chats, five modes, Projects, tasks, approved memory, private file uploads, artifact sharing and account deletion.
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
- Olympus uses distinct specialist providers when available; with fewer than two it returns a Zeus answer marked degraded instead of simulating a council with duplicate calls to one provider.

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
- `OPENAI_WEB_SEARCH_MODEL` — optional; defaults to `gpt-5.5` in code
- `ANTHROPIC_API_KEY` — optional
- `ANTHROPIC_MODEL` — optional
- `GOOGLE_AI_API_KEY` — optional
- `GOOGLE_AI_MODEL` — optional
- `OLYHUB_DAILY_REQUEST_LIMIT` — optional global safety limit
- `OLYHUB_DAILY_TOKEN_LIMIT` — optional global safety limit
- `OLYHUB_MONTHLY_TOKEN_LIMIT` — optional global safety limit

Never expose a Supabase secret/admin key or provider key through a `VITE_*` variable.

The native app has a separate [mobile setup guide](mobile/README.md). Its `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `EXPO_PUBLIC_API_BASE_URL` are client-visible values. Provider keys and Supabase secret/admin keys remain server-only.

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

The native iOS implementation now exists, but the product is **not yet App Store-ready**. A signed EAS build, Apple Developer/App Store Connect identity, privacy/terms URLs, final business model/IAP configuration, privacy-manifest review, store listing assets and executed staging/native E2E validation remain release gates. A two-user RLS isolation harness is already present but requires staging test credentials to run.

See:
- [Commercial architecture](docs/COMMERCIAL_ARCHITECTURE.md)
- [Product strategy](docs/PRODUCT_STRATEGY.md)
- [App Store release gates](docs/APP_STORE_RELEASE.md)


## Staging account-isolation E2E

A manual GitHub Actions workflow, `.github/workflows/e2e-staging.yml`, runs a two-user RLS isolation test without calling any AI provider.

Required repository secrets:

- `E2E_SUPABASE_URL`
- `E2E_SUPABASE_PUBLISHABLE_KEY`
- `E2E_USER_A_EMAIL`
- `E2E_USER_A_PASSWORD`
- `E2E_USER_B_EMAIL`
- `E2E_USER_B_PASSWORD`

The two test users must already exist and must be different accounts. The test creates temporary User A Project data, confirms User B cannot read or insert into that scope, then removes the temporary Project.

Run locally with the same environment values:

`npm run e2e:isolation`
