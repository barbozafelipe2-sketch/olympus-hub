# Changelog

## 0.5.0 - Commercial workspace and orchestration

### Added
- Persistent Home conversations with recent-chat restoration and saved modes.
- Home and Project versioned artifacts.
- Deterministic Project conversation checkpoints for long histories.
- Durable Project task rail with todo/in-progress/done workflow.
- Project tasks included in canonical AI context.
- Real OpenAI, Anthropic and Google AI adapters.
- Zeus routing, OpenAI fallback, conditional reviewer and Director integration.
- Olympus specialist/critic/Director orchestration.
- Durable execution traces.
- Provider-reported token usage aggregation and append-only usage events.
- Server-side account/global quota preflight.
- Settings for account state, usage and configured limits.
- Persistent onboarding.
- Complete account deletion with private Storage cleanup.
- Configuration-only health endpoint.
- PWA manifest, production service worker and install metadata.
- iOS home-screen 180px Apple touch icon and 192/512px PNG PWA install icons, precached by the service worker.
- Capability Broker text/Markdown/CSV/JSON Project file reading.
- Live web research capability using hosted OpenAI web search.
- Persistent clickable web-source citations in Home and Projects.
- Manual two-user staging RLS isolation E2E harness.

### Changed
- Project and Home context are loaded canonically on the server through the authenticated Supabase/RLS context.
- Home no longer exposes a fake/local-only attachment button.
- Project browser payloads use bounded history windows.
- Stored file content is treated as untrusted data.
- Artifacts revise by appending immutable versions.
- Health reporting distinguishes configured services from live provider health.

### Security
- Account deletion recursively removes owned objects from both `project-files` and `artifact-files`, including orphaned uploads.
- Account deletion admin credential remains server-only.
- Service worker refuses to cache authenticated API responses.
- Quotas are checked before provider spend.
- Private Storage object paths remain bound to authenticated user + Project ownership.
- No provider is claimed in Zeus/Olympus unless it appears in the actual trace.

### Known release gaps
- Native iOS packaging and signing are not configured.
- Billing/pricing is not finalized.
- Privacy policy and Terms URLs are not supplied.
- The multi-user isolation harness exists but has not yet been executed with staging test credentials.
- PDF/DOCX/XLSX/PPTX/image/audio/video parsing is not yet available through the Capability Broker.

## 0.4.0 - Project memory and private files

### Added
- Approved per-project memory with kinds and priority ranking.
- Database-enforced memory budget: maximum 40 items and 15,000 characters per scope.
- Memory deduplication per owner/scope.
- Private Supabase Storage bucket for Project files.
- 20 MB per-file limit and allowlisted MIME types.
- Project file upload, list, download and delete UI.

### Security
- Project memory and file metadata are owner-scoped with RLS.
- Storage object paths are bound to authenticated user ID and owned Project ID.
- Storage bucket is private.
- Storage policies were re-audited after fixing a qualified-column shadowing issue before any file data existed.

## 0.3.0 - Project continuity

### Added
- One durable conversation per Project.
- Project chat restoration from Supabase.
- Persistent user and assistant messages.
- Saved mode per Project conversation.
- Retry after provider failure without duplicating the saved user message.
- Provider/model/request metadata stored with assistant messages.

## 0.2.0 - Supabase commercial foundation

### Added
- Supabase Auth sign-in/sign-up.
- Persistent Projects.
- RLS-protected core tables.
- Generated database TypeScript types.
- Tracked SQL migrations.
- Authenticated bearer token on `/api/chat`.

## 0.1.0 - Commercial React foundation

### Added
- React + TypeScript + Vite foundation.
- OlyHub Home and Projects surfaces.
- Server chat contract.
- Root Vercel configuration.
- CI typecheck/build.
- Commercial architecture and repository-separation documentation.
