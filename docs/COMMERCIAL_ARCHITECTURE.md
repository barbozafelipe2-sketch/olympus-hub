# OlyHub Commercial Architecture

Status: foundation
Repository: `barbozafelipe2-sketch/olympus-hub`

## Product boundary

This repository is the commercial OlyHub product intended for customer distribution and eventual Apple App Store packaging.

It must remain separate from `barbozafelipe2-sketch/zeus-proxy`, which is Felipe's private/personal environment.

Never copy personal data, private prompts, unrestricted admin capabilities, credentials, personal memory, or private execution rules from Zeus Proxy into the commercial product.

## Commercial surfaces

### Home
Open-ended conversation. The user can choose one of five product modes:
- OpenAI
- Google AI
- Claude
- Zeus
- Olympus

### Projects
Durable customer workspaces. The target backend contract is:
- goal
- conversations
- tasks
- files
- approved memory
- artifacts
- execution traces

No project data is persisted in the current foundation commit. The current Project UI is intentionally local-only so the interface does not pretend persistence exists.

## Mode contract

### Direct provider modes
OpenAI, Google AI and Claude route to the named provider when that provider adapter is configured.

OpenAI is the required fallback provider for unavailable or unhealthy provider adapters.

### Zeus
Zeus is an orchestration mode, not a separate model. Target behavior:
1. compile the request and constraints
2. select the strongest single available route for the task
3. use OpenAI as fallback
4. add at most one reviewer when task risk/complexity justifies it
5. return one integrated answer

### Olympus
Olympus is a council mode. Target behavior:
1. compile the request
2. choose 2 specialists, or 3 for heavier work
3. allow at most 1 focused critic
4. Director integrates disagreements
5. return one answer, not pasted competing answers

The foundation API does not yet claim to execute this council. Until provider/orchestration adapters are implemented, Olympus uses a transparent OpenAI foundation route.

## Security boundary

- Provider secrets are server-only environment variables.
- Never expose provider keys through `VITE_*` variables.
- Client payloads are schema validated server-side with Zod.
- Client-controlled system prompts are not accepted.
- Errors returned to clients are normalized; raw provider errors are logged server-side only.
- Destructive or externally consequential actions will use PREPARE -> SHOW USER -> APPROVE -> EXECUTE -> VERIFY.
- Authentication, authorization, rate limiting, billing, project persistence and RLS are required before public launch.

## Current stack

- React + TypeScript
- Vite
- Zod validation
- Vercel server route for the current foundation
- OpenAI Responses API foundation route

## Apple App Store path

The React web foundation should be stable before native packaging is added. The expected packaging path is a native wrapper such as Capacitor, with bundle identity, Sign in with Apple requirements (if applicable), privacy disclosures, purchase/subscription rules, push notification entitlements and App Store review assets handled as a dedicated release phase.

Do not treat a responsive web build alone as App Store-ready.

## Definition of done before public beta

- Authentication and account deletion
- Per-user/project authorization
- Supabase/Postgres persistence with RLS or equivalent
- Real file upload and secure object storage
- Artifact persistence/versioning
- Provider adapter registry and health/fallback rules
- Zeus and Olympus orchestration implemented and traceable
- Server-side quotas/rate limits
- Usage/cost ledger
- Privacy policy and terms
- Observability and provider failure traces
- Production CI with lockfile
- End-to-end tests for chat, upload, projects and account isolation
