# OlyHub Commercial Architecture

Status: continuity + orchestration + artifact/capability foundation
Repository: `barbozafelipe2-sketch/olympus-hub`
Active code line: `main`

## Boundary

This repository is the multi-user commercial OlyHub product. It remains strictly separate from the private `barbozafelipe2-sketch/zeus-proxy` product.

Never copy personal prompts, personal memory, credentials, private data or unrestricted private execution rules from Zeus Proxy into this repository.

## Product thesis

Foundation models are infrastructure. OlyHub owns durable work state.

USER
-> EXPERIENCE
   - Home conversations
   - Projects
   - Files
   - Memory
   - Tasks
   - Artifacts
-> AUTHORIZATION / CONTEXT
   - Supabase Auth
   - RLS
   - canonical server-side context
   - long-history checkpoints
-> ORCHESTRATION
   - Direct
   - Zeus
   - Olympus
-> CAPABILITY BROKER
   - read supported private Project files
   - persist/revise artifacts
   - future web / Drive / Calendar / document parsers
-> PROVIDER ADAPTERS
   - OpenAI
   - Anthropic
   - Google AI
-> OBSERVABILITY / CONTROL
   - execution traces
   - token ledger
   - quotas
   - health configuration
-> DURABLE STORES
   - Postgres
   - Supabase Storage

## Home

Home is now durable rather than disposable.

- New chat creates a real conversation row.
- Recent conversations restore across sessions.
- Mode is saved per conversation.
- User messages are persisted before provider execution.
- Assistant messages are persisted with trace metadata.
- Explicit deliverables can become versioned artifacts.
- The server validates the Home conversation through RLS and loads canonical recent messages.

Home does not currently expose persistent file storage or approved memory; those remain Project capabilities.

## Projects

Each Project has one durable conversation.

A Project restores:
- conversation history
- saved mode
- goal
- approved memory
- tasks
- private files
- artifacts

The browser sends Project/conversation identifiers. The API loads canonical Project state with the authenticated user's Supabase context, so RLS remains the authorization boundary.

### Long history

Project inference uses the most recent canonical messages plus a deterministic checkpoint of older transcript data. Approved memory stays separate and higher-value durable facts/decisions do not depend on an infinite raw transcript.

## Memory

Project memory is user-approved and removable.

Database policy:
- max 40 items per owner/scope
- max 15,000 total characters per owner/scope
- item max 1,500 characters
- deduplication
- kind + importance ranking

Memory kinds:
- fact
- preference
- decision
- outcome
- instruction

## Tasks

Project tasks are durable rows with:
- todo / in_progress / done
- priority
- optional due date at schema level

The Project rail can create, advance and delete tasks. The server includes current task state in Zeus/Olympus Project context.

## Files

Project files live in the private `project-files` bucket under:
`<user-id>/<project-id>/<object>`.

Storage RLS validates authenticated user and Project ownership.

Capability Broker v1 can read:
- text/plain
- text/markdown
- text/csv
- application/json

Limits for prompt ingestion:
- up to 1 MB file size for readable-file capability
- up to 12,000 characters per file
- up to 3 files per request
- up to 30,000 characters combined

File contents are wrapped as untrusted data. Stored files outside supported types remain metadata-only.

## Artifacts

Artifacts are versioned durable deliverables.

Tables:
- `artifacts`
- `artifact_versions`

Supported semantic kinds:
- document
- report
- code
- data
- note

Explicit create intents can persist the completed model result as an artifact. Explicit revision intents append a new immutable version instead of overwriting the previous content. Home and Project artifacts are supported.

## Provider adapters

### OpenAI
Responses API; required commercial fallback.

### Anthropic
Messages API.

### Google AI
Gemini Interactions API.

Provider credentials are server-only. A small in-process failure circuit temporarily blocks a repeatedly failing provider inside the running instance.

## Zeus

Zeus is the default daily orchestration layer.

1. Inspect request shape.
2. Choose a configured route.
3. Use OpenAI fallback when another route fails/unavailable.
4. For review-worthy work, allow one focused reviewer.
5. Integrate with a Director call.
6. Return one result plus execution trace.

## Olympus

Olympus is a real multi-call orchestration mode.

1. Run 2 specialists, or 3 for heavier work.
2. Keep successful specialist calls if another fails.
3. Run one focused critic when available.
4. Director synthesizes one final result.
5. Persist exact provider/model/request trace.

The product does not claim a provider participated unless it appears in the execution trace.

## Usage and quotas

Each provider adapter normalizes provider-reported token usage. Zeus/Olympus aggregate all calls.

`usage_events` records per model call:
- provider
- model
- orchestration role
- request id
- input/output tokens
- cache usage where available
- reasoning/thought tokens where available
- tool tokens where available

Dollar cost is deliberately nullable until OlyHub has a versioned pricing source. No cost is guessed from characters.

`account_limits` supports optional per-user limits. Optional deployment-wide env limits are fallback controls. Quota preflight happens before provider tokens are spent.

## Execution traces

`executions` records:
- mode/status
- project/conversation scope
- provider/model/request
- fallback
- call count
- multi-provider flag
- degraded state
- latency
- model-call trace
- capability trace

## Identity and account lifecycle

Supabase Auth is the identity source.

- Client uses publishable values only.
- RLS enforces per-user access.
- `SUPABASE_SECRET_KEY` is server-only and used for complete account deletion.
- Account deletion removes private Storage objects first, then deletes the Auth user; dependent database rows cascade.
- Onboarding completion is stored in the user's profile.

## PWA and operations

The web product includes:
- web manifest
- standalone PWA metadata
- production service worker
- explicit rule never to cache authenticated `/api/` responses
- configuration-only health endpoint

`/api/health` intentionally distinguishes deployment configuration from live provider health. It never calls a provider “healthy” merely because a key exists.

## Security model

- RLS on all exposed product tables.
- User JWT verified before AI provider spend.
- Project/Home scopes loaded server-side under the user's RLS context.
- Client-controlled system prompts are not accepted.
- Provider keys never enter browser code.
- Private Storage has separate RLS.
- Stored file content is treated as untrusted input.
- Destructive account deletion requires explicit confirmation.
- Service worker excludes authenticated APIs.
- Errors returned to the client are normalized.

## Current public-beta gates

Implemented:
- Authentication ✅
- Per-user RLS ✅
- Persistent Home chats ✅
- Persistent Projects ✅
- Long Project history checkpointing ✅
- Approved memory ✅
- Durable tasks ✅
- Private files ✅
- Versioned artifacts ✅
- OpenAI/Anthropic/Google adapters ✅
- Zeus orchestration ✅
- Olympus orchestration ✅
- Durable traces ✅
- Usage ledger ✅
- Server quota controls ✅
- Complete account deletion ✅
- Persistent onboarding ✅
- PWA foundation ✅
- Locked install + CI smoke ✅

Still required before a responsible public/App Store launch:
- final plan/pricing and billing model
- privacy policy + terms URLs tied to the actual commercial entity
- runtime E2E tests with at least two users for account isolation
- native iOS wrapper/bundle identity and App Store signing
- native privacy manifest after SDK/native stack is finalized
- App Store product metadata/screenshots/review credentials
- IAP/StoreKit implementation if the chosen iOS business model requires it
- supported parsers/capabilities for additional file types
- production observability/alerting beyond durable traces
