# OlyHub Native Privacy Data Map

Status: source-code audit prepared for release work; not a legal policy or final App Store Connect submission.

## Observed data flows

| Data | Where it is used or stored | App Store privacy-label candidate |
| --- | --- | --- |
| Email address and optional display name | Supabase Auth and the user's profile; used for account access and display | Contact Info: Email Address, Name |
| Account ID | Supabase Auth and owner-scoped database/storage rows; also present in selected server error logs | Identifiers: User ID |
| Prompts, replies, conversation history, project names/goals, tasks, saved memories and generated artifacts | Persisted in Supabase and used to provide chat/project functionality | User Content: Other User Content |
| Uploaded images and videos | Accepted by the Project file picker and stored in the private `project-files` bucket | User Content: Photos or Videos |
| Uploaded audio files | Accepted by the Project file picker and stored in the private `project-files` bucket | User Content: Audio Data |
| In-app research prompts | Stored as messages and may be sent to the web-research capability | Search History; review whether the final App Store questionnaire should also categorize these as Other User Content |
| AI mode, provider/model, call count, latency, fallback/degraded state, token usage and estimated cost | Stored in execution and usage records for product operation and account quota/usage views | Usage Data: Other Usage Data |
| File metadata | File name, MIME type, size, project and owner identifiers stored with private file rows | User Content / Other Data; confirm with the final App Store questionnaire |

The current implementation uses authentication, private storage and user-scoped database access. Account deletion removes the Auth user and cascades owned rows, and the API explicitly removes objects from the `project-files` and `artifact-files` buckets first.

## AI processing disclosure

The native app now requests affirmative, revocable permission before it persists a new chat prompt or sends that request for AI processing. The notice names OpenAI, Anthropic/Claude and Google/Gemini; explains Zeus fallback, Olympus multi-provider behavior, relevant project memories/files, and OpenAI web research/image generation; and permits users to decline while retaining non-AI account features. The decision is stored per account on the device with a version and timestamp; Settings can withdraw it, and the next AI request is blocked until consent is renewed.

Provider selection and data handling can change. The final policy and review notes must accurately identify which providers receive data, what each receives, how each uses/retains it, and how users withdraw consent. Verify the provider contract/API settings and the API host's request-log retention before launch.

## Current code evidence

- `mobile/app/auth.tsx`: email, password and optional name; privacy/terms links are environment-configured.
- `mobile/app/chat/[id].tsx`: first-request AI consent gate, before prompt persistence and provider submission.
- `mobile/app/(tabs)/settings.tsx`: consent review/withdrawal and privacy-policy link.
- `mobile/src/components/AiDataConsentModal.tsx`: user-facing provider/data disclosure.
- `mobile/src/lib/ai-consent.ts`: per-account, per-device, versioned consent timestamp.
- `api/chat.js`, `api/lib/orchestrator.js`, `api/lib/capabilities.js`: authenticated requests, provider routing, project context and tool processing.
- `supabase/migrations/`: durable account, project, file, artifact, execution and usage data structures.
- `mobile/app.json`: native privacy manifest declaration.

## Release decisions still required

1. Publish a Privacy Policy and Terms of Use tied to the actual commercial entity, and set `EXPO_PUBLIC_PRIVACY_POLICY_URL` and `EXPO_PUBLIC_TERMS_URL` in every EAS environment.
2. Verify whether consent should also be recorded server-side for cross-device access and a stronger audit trail before public release.
3. Confirm retention/deletion behavior for Supabase backups, application-host request logs, and all AI provider requests.
4. Review every dependency's privacy manifest and the signed archive's Xcode privacy report; this source audit does not replace that check.
5. Complete App Store Connect labels from the actual production vendor settings. The listed categories are candidates grounded in repository behavior, not a legal determination.

## Audit scope and limits

This is a static repository inspection. It does not inspect live Supabase project settings, production secrets, provider account retention settings, hosting logs, or third-party SDK reports. No advertising or analytics SDK was found in the inspected native source/dependency configuration; confirm this again when production integrations are finalized.
