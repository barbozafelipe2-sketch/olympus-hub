# Automatic routing and explicit retries

Olympus automatic defaults Off. Web saves the setting per account on the device; mobile holds it for the current chat screen. Off retains the manually selected engine. On allows the metered low-cost AI router to recommend Olympus for complex requests. The router also selects task type, complexity, level and a configured executor model. Rules are used only if classification cannot complete. Short questions stay in Zeus. The API reserves a bounded maximum before paying the classifier. The reservation RPC checks account status, entitlement for manual Olympus and usage limits atomically, and returns the server-maintained Olympus entitlement. Automatic promotions require that entitlement. The execution cap is narrowed after classification; no client preference grants entitlement. Selecting Olympus manually still requires entitlement.

Image generation uses Zeus Level 2 with one initial image call. Other Compound tasks retain author and independent finalizer stages. This commit changes routing, not the separate Comparison/Combine image interface.

Home, Project and native chat failures expose Try again. The user confirms a possibly paid new attempt; the retry reuses the saved user message and sends a fresh request ID so that the new attempt counts toward the account budget. Original accepted request IDs remain protected against duplicate provider spend. An uncertain timeout may still finish on the server: reload the conversation before choosing to pay for another attempt.

Deployment depends on the commercial budget migration in this PR. New accounts have Olympus entitlement disabled by default. No database migration or production deploy was executed by this change.

Validation: node tests (including API entitlement/budget boundary), TypeScript/build, smoke, native typecheck and lint of changed native files (Expo ESLint config used locally). No live paid provider calls.

See [INTELLIGENT_ROUTING.md](INTELLIGENT_ROUTING.md) for the classifier schema, capability catalog and accounting.
