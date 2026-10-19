# Commercial execution budgets

## Rollout order

1. Apply the additive migration `20261014140427_commercial_ai_budget_controls.sql` in staging, then production, through the project's normal Supabase migration workflow. It backfills existing execution totals and changes content foreign keys to `ON DELETE SET NULL`; complete account deletion still cascades through the account owner.
2. Configure server-only `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`). Never expose either key in Vite or Expo variables. The server validates the user JWT and content scope through the user's RLS client before using the privileged accounting client.
3. Grant `account_limits.olympus_entitled=true` only to accounts authorized by your commercial plan. The default is false and client writes cannot grant it. Billing synchronization is still pending. Deploy the backend and web client together. If accounting configuration/migration is missing or the reservation RPC fails, chat returns 503 before spending provider tokens. Older native clients remain compatible; each request without a UUID receives a new server UUID and is charged separately.
4. Execute the existing two-user staging isolation harness and exercise success, provider failure, parallel requests and conversation deletion. Local SQL tests run on embedded PostgreSQL (PGlite); they do not prove contention behavior of a deployed multi-connection Supabase instance.

## Safe defaults

Limits below are **per account**, not deployment-wide monetary limits. Explicit `account_limits` values override the daily/monthly environment fallbacks. Missing or invalid environment values do not disable limits; a missing account record is blocked.

| Setting | Default |
|---|---:|
| `OLYHUB_DAILY_REQUEST_LIMIT` | 20 requests |
| `OLYHUB_DAILY_TOKEN_LIMIT` | 1,000,000 budget tokens |
| `OLYHUB_MONTHLY_TOKEN_LIMIT` | 10,000,000 budget tokens |
| `OLYHUB_CONCURRENT_REQUEST_LIMIT` | 1 running request, configurable up to 5 |
| `OLYHUB_IMAGE_DAILY_REQUEST_LIMIT` | 2 image requests |

These are starting safety controls, not a validated commercial plan or guarantee of profitability. Configure provider spending caps and choose plan limits from actual usage and prices.

## Execution

| Gear | Maximum outbound attempts | Stages on the successful path |
|---|---:|---|
| Zeus Simple | 1 | Answer |
| Zeus Compound | 2 | Author, final review |
| Olympus Compound Plus | 3 | Author, independent critic, finalizer |
| Olympus Turbo | 4 | Up to 2 specialists, Director, CEO |

The table describes executor stages. Non-image API requests first reserve and meter one low-cost AI routing attempt; Simple also reserves one bounded cross-provider failover slot, used only if the first answer fails. Web research has its own single counted attempt so Compound retains both author and reviewer. Before classification, admission reserves at most 3 attempts in Zeus/manual-Off, or 5 when Olympus is selected/automatic, plus one for web research. The actual execution cap is narrowed to the selected gear after routing. Unused allowance is released on settlement; admission can conservatively reject a request near quota. See INTELLIGENT_ROUTING.md.

Web search consumes the same allowance. A successful simple web request uses routing, research and answer; Compound Plus retains author, independent critic and finalizer after research. Failed attempts consume calls; there is no hidden retry allowance. If a requested stage cannot run, the result is marked degraded. With fewer than two configured providers Olympus returns a single answer marked degraded. Turbo is degraded when the commercial policy's four-family separation cannot be met; the current three adapters necessarily report this honestly.

The paid-call deadline is 75 seconds, inside Vercel's configured 90-second function limit. Each provider call uses a bounded timeout and the shared abort signal. Every outbound prompt has at most 24,000 characters (including up to 8,000 of system context), and output is capped at 4,096 tokens. Only recent turns that fit are retained. Pattern-based redaction removes recognizable credentials before outbound calls; it is not a complete data-loss-prevention system.

`OPENAI_ECONOMY_MODEL`, `ANTHROPIC_ECONOMY_MODEL` and `GOOGLE_ECONOMY_MODEL` configure intermediate work; corresponding `_PREMIUM_MODEL` variables configure finalizers. Legacy model variables remain supported. Defaults use GPT-4.1-mini / GPT-5-mini, Claude Haiku / Sonnet 4.5, and Gemini 2.5 Flash. Availability, pricing and capability must be checked against the configured provider account; tests use mocks and do not verify live model access.

## Accounting and retries

The reservation RPC holds an account-scoped PostgreSQL advisory lock while checking request/token totals and active reservations, then inserts the reservation in the same transaction. Initial allowances use a conservative UTF-8 token upper bound plus capped output, multiplied by the gear cap. This may reject a request near a quota even if its eventual measured usage would have fit.

Settlement replaces the allowance with reported total tokens per attempt. Missing provider usage is explicitly marked unreported and retains the attempt's conservative allowance. Expired workers keep their original reservation until an administrator reconciles them with provider billing; expiration frees concurrency, not budget. `usage.totalTokens` is reported usage, while `usage.chargedTokens` is the quota debit; no dollar cost or zero-cost claim is inferred from missing measurements.

Duplicate UUIDs return 409 without repeating work, including after failure. UUIDs are bound to the request fingerprint. The web client uses the persisted user-message UUID; a caller can supply a stable `requestId` explicitly. There is no stored response replay: users must submit a new message for a new paid attempt. Successful response content is still persisted by the existing client flow.

Financial rows are writable only by the server; authenticated clients can read their own rows. Deleting a conversation, project or execution cannot reset budget totals. Complete account deletion removes financial rows together with the owner's other data. The migration cannot reconstruct usage that was deleted before it was applied, or usage providers never reported.

## Verification

`npm test` covers actual SQL migration execution, reservation/settlement, RLS and RPC permissions, content deletion retention, expiry, safe defaults, call caps, credential redaction, web budgets and fail-closed API behavior. `npm run build` and `npm run smoke` validate the existing web release contract. No test makes a live paid model request.

Completed model stages are persisted server-side in `ai_stage_checkpoints` when a canonical conversation exists. These are content records, so deleting the conversation deletes them. They do not grant automatic resume or response replay. See [ZEUS_PORT.md](ZEUS_PORT.md) for the remaining integration work.

## Dynamic quotations (item 2)

Classifier and executor choices now require valid price metadata. See [MODEL_PRICING.md](MODEL_PRICING.md). This removes hardcoded routing prices and legacy unversioned price overrides. OpenRouter feed quotations remain explicitly labeled reference estimates for direct-provider execution; dated account-specific quotations can override them. This is separate from token allowance enforcement and does not claim provider-invoice reconciliation.

## Per-attempt authorization (item 3)

Apply the new authorization migration before deploying this backend. Every paid dispatch now requires a persisted permit and a bound server execution plan, with fresh account-policy checks. See [SERVER_AUTHORIZATION.md](SERVER_AUTHORIZATION.md) for rollout order, model/context checks, six-entry settlement and existing monetary-accounting limits.
