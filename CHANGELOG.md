# Changelog

## 0.3.0 - Persistent workspace slice

### Added
- Home conversations persist in Supabase and reopen from Recent chats.
- Every Project has one canonical saved conversation, a working task list, and a Project chat route.
- Supported text-like source files upload to a private Storage bucket, are attached to the AI request, and are retained in the conversation workspace.
- Assistant answers can be saved as Markdown artifacts, reopened through short-lived signed links, and deleted.
- RLS policies restrict artifact rows and Storage objects to the authenticated owner; project artifact rows must match the owning project.
- Mode notices explain when Claude, Google AI, or Olympus requests use the single-model OpenAI foundation route.
- Responsive layouts keep saved files and artifacts reachable on narrow screens.

### Boundaries
- Source uploads support TXT, MD, CSV, JSON, XML and HTML, up to 2 MB per file and 5 MB combined per request.
- Conversation view loads up to 200 messages and sends the latest 80 in model context.
- Claude/Google provider adapters, real Olympus council execution, PDF/Office/image parsing, rich document exports, web search, billing, account deletion and native App Store packaging remain future stages and are labeled accordingly.

## 0.2.0 - Supabase commercial foundation

### Added
- Supabase Auth sign-in/sign-up flow.
- Typed Supabase client using the new publishable-key pattern.
- Persistent Projects backed by Postgres.
- RLS-protected tables for profiles, projects, conversations, messages and project tasks.
- Private-schema helper functions and user-profile trigger.
- Generated database TypeScript types.
- Tracked SQL migration files.
- Product strategy document focused on durable work instead of model aggregation.
- Authenticated bearer token on `/api/chat`.

### Security
- Every public product table has RLS enabled.
- Anonymous table access is revoked.
- Project/message/task policies validate ownership with `auth.uid()`.
- The AI route verifies the bearer token with Supabase Auth before spending provider tokens.
- No service-role or secret Supabase key is used in the browser.
- User-editable metadata is not used for authorization.

### Known gaps
- See the current 0.3.0 boundaries above.

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
