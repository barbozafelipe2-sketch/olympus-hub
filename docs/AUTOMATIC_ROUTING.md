# Automatic routing and explicit retries

Olympus automatic defaults Off. Web saves the setting per account on the device; mobile holds it for the current chat screen. Off retains the manually selected engine. On considers substantive complex requests for Olympus using local rules, with no classifier API call. Short questions stay in Zeus. The API reads account_limits.olympus_entitled itself, and reserve_ai_budget independently checks entitlement and usage limits before spending. Selecting Olympus manually still requires entitlement.

Image generation uses Zeus Level 2 with one initial image call. Other Compound tasks retain author and independent finalizer stages. This commit changes routing, not the separate Comparison/Combine image interface.

Home, Project and native chat failures expose Try again. The user confirms a possibly paid new attempt; the retry reuses the saved user message and sends a fresh request ID so that the new attempt counts toward the account budget. Original accepted request IDs remain protected against duplicate provider spend. An uncertain timeout may still finish on the server: reload the conversation before choosing to pay for another attempt.

Deployment depends on the commercial budget migration in this PR. New accounts have Olympus entitlement disabled by default. No database migration or production deploy was executed by this change.

Validation: node tests (including API entitlement/budget boundary), TypeScript/build, smoke, native typecheck and lint of changed native files (Expo ESLint config used locally). No live paid provider calls.
