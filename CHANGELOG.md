# Changelog

## 0.1.0 - Commercial React foundation

### Added
- React + TypeScript + Vite application foundation.
- Commercial OlyHub Home and Projects surfaces.
- Five-mode product selector.
- Local attachment selection UI and artifact rail.
- Zod-validated server chat contract.
- OpenAI Responses API foundation route.
- Root Vercel configuration.
- CI typecheck/build workflow.
- Commercial architecture and repository-separation documentation.

### Changed
- Replaced the single-file Pegasus mock shell with an OlyHub React entrypoint.
- Removed client ability to inject a system prompt into the provider request.

### Security
- Provider keys remain server-only.
- Provider error bodies are not returned directly to customers.
- Client payload size and roles are validated.

### Known gaps
- No authentication or RLS yet.
- Projects are not persisted yet.
- File selection does not upload file bytes yet.
- Artifacts are not generated/persisted yet.
- Claude and Google adapters are not enabled yet.
- Olympus is not yet a real multi-model council.
