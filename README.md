# OlyHub Commercial

OlyHub is the commercial React product for customer distribution and eventual Apple App Store release.

> Repository boundary: this codebase is **not** the private `zeus-proxy` product. Personal prompts, memory, credentials and unrestricted admin capabilities must not cross into this repository.

## Current foundation

- React + TypeScript + Vite
- Responsive Home chat shell
- Projects surface
- Five product modes: Zeus, Olympus, OpenAI, Claude and Google AI
- File selection UI
- Artifact rail
- Server-only AI route
- Zod request validation
- OpenAI fallback foundation
- GitHub CI for typecheck and build

The current foundation is intentionally honest about what is not implemented: project persistence, real file transport, artifact generation/persistence, auth, billing, real Claude/Google adapters and true Olympus council execution.

## Local development

1. Install dependencies:
   `npm install`
2. Copy environment template:
   `cp .env.example .env.local`
3. Add `OPENAI_API_KEY` server-side.
4. Run:
   `npm run dev`

For Vercel local server functions, use the Vercel development runtime rather than exposing provider keys to Vite.

## Environment

- `OPENAI_API_KEY` — server only
- `OPENAI_DEFAULT_MODEL` — optional
- `OPENAI_FALLBACK_MODEL` — optional
- `ALLOWED_ORIGIN` — reserved for native/cross-origin hardening

Never create a `VITE_OPENAI_API_KEY`.

## Validation

- `npm run typecheck`
- `npm run build`

CI runs both checks for the commercial foundation branch and pull requests to `main`.

## Architecture

See [docs/COMMERCIAL_ARCHITECTURE.md](docs/COMMERCIAL_ARCHITECTURE.md).

## Rollback

The pre-React baseline is commit `4b4dd6225fe58e223f33baf9cfa084fcbe50766a`.

The React migration is developed on `commercial-react-foundation`; do not merge until CI is green and the UI/API smoke test passes.
