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
- Server-side OpenAI, Anthropic and Google AI provider adapters.
- Zeus Simple/Compound and Olympus Compound Plus/Turbo with shared 1/2/3/4-attempt budgets.
- Economy model tiers for intermediate work and configurable premium finalizers.
- Durable execution traces with exact provider/model/request routing.
- Provider-reported token usage aggregated across every orchestration call.
- Durable accounting independent of conversations, atomic quota reservations, concurrency controls and bounded image generation.
- Settings surface for usage, plan state and account limits.
- Complete server-side account deletion including private Storage cleanup.
- Persistent onboarding.
- Honest configuration health endpoint at `/api/health`.
- Installable PWA foundation with API responses excluded from service-worker caching.
- Native iOS client under `mobile/`, built with Expo SDK 57 / React Native 0.86 (not a WebView wrapper): auth, persistent chats, Zeus and Olympus modes, Projects, tasks, approved memory, private file uploads, artifact sharing and account deletion.
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

The server deterministically selects Simple (1 attempt), Compound (2), Compound Plus (3), or Turbo (4). Every outbound attempt, including a failed attempt and web research, consumes the same request budget. Simple has no retry headroom. Compound may recover an author failure using its second call, returning an explicitly degraded result instead of pretending a review also ran.

Only Zeus and Olympus are user-facing modes. Olympus with fewer than two configured providers returns a single Zeus answer marked degraded. Web research is preserved when requested and shares the gear budget; it never silently disappears to make room for review. Image generation is bounded separately to two requests per account/day by default.

See [Zeus port and remaining work](docs/ZEUS_PORT.md) and [cost controls and rollout](docs/COST_CONTROLS.md) for defaults, model overrides, migration ordering and accounting semantics.

The UI trace describes what actually ran. Configured credentials are not described as live provider health.

## Environment

Browser-safe:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Server-only:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` — required for server-only budget reservations, receipts and complete account deletion
- `OPENAI_API_KEY`
- `OPENAI_DEFAULT_MODEL` — optional
- `OPENAI_FALLBACK_MODEL` — optional
- `OPENAI_WEB_SEARCH_MODEL` — optional; defaults to `gpt-5.5` in code
- `ANTHROPIC_API_KEY` — optional
- `ANTHROPIC_MODEL` — optional
- `GOOGLE_AI_API_KEY` — optional
- `GOOGLE_AI_MODEL` — optional
- `OLYHUB_DAILY_REQUEST_LIMIT` — optional per-account fallback; default 20
- `OLYHUB_DAILY_TOKEN_LIMIT` — optional per-account fallback; default 1,000,000
- `OLYHUB_MONTHLY_TOKEN_LIMIT` — optional per-account fallback; default 10,000,000
- `OLYHUB_CONCURRENT_REQUEST_LIMIT` — default 1 per account, maximum 5
- `OLYHUB_IMAGE_DAILY_REQUEST_LIMIT` — default 2 per account
- `{OPENAI,ANTHROPIC,GOOGLE}_{ECONOMY,PREMIUM}_MODEL` — optional role-specific models

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
- `ai_budget_requests`
- `ai_stage_checkpoints`

All exposed product tables have RLS enabled.

## Validation

- `npm ci`
- `npm test`
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
