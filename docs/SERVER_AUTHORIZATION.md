# Server validation — item 3/7

## Deployment requirement

Apply `supabase/migrations/20261019041758_per_attempt_execution_authorization.sql` through the normal Supabase migration workflow, after the existing commercial-budget migration. This migration was created using Supabase CLI 2.79.0. Drain old in-flight executions and deploy backend/schema together. The new backend fails closed without the authorization RPCs/policy: no paid inference is issued. An accepted, unused reservation is settled at zero when possible; an unconfirmed settlement remains conservative.

This commit contains the migration; it does NOT apply it to production. Public-price access and provider keys still require the preceding configuration. Real production concurrency, Supabase advisors and deployment access must be verified in staging; local tests use embedded PostgreSQL rather than a running Supabase deployment.

## Immutable admission and bounded plan

The authenticated user ID binds the quota reservation, execution plan and each attempt. Client-supplied owner, model, role, level, call-cap or policy fields cannot grant privileges. Admission uses the existing owner advisory lock and account row lock. Reservations now persist the initial token allowance, maximum calls, automatic/manual Olympus consent, web consent, issued-token bound, issued-call count and permits.

The classifier can receive one permit before a plan is bound. After classification, `bind_ai_execution` narrows the persisted call cap and fixes engine/level once. It cannot widen the admission, change an already-bound plan, exceed account level, or enable Olympus without both original consent and current entitlement. Images bind a dedicated Zeus Level 2/one-call plan. Bound role manifests prevent injecting a Director/CEO into Simple or rerunning the classifier after execution starts.

`authorize_ai_attempt` runs immediately before each paid classifier, text executor, image capability or web capability request. Under the same owner lock it checks:

- reservation owner, running state, expiry and persisted call/token bounds;
- current account status, level, permitted model tiers and Olympus entitlement;
- current daily/monthly limits against retained accounting (including reservations);
- bound engine and permitted roles/capabilities;
- unique attempt ID and bounded input/output allocations.

Duplicate permits are refused, not replayed. Authorization is not an automatic provider retry. Revocation applies to subsequent dispatch permits; an external request already dispatched can still finish. No database lock is held during provider network calls.

## Server-owned model registry

The backend filters the priced model catalog against the admitted model tiers and copies the policy into request-private closures. A permit hook checks the actual provider/model/tier against that registry, current quote validity, domain, task complexity, output capability and context window. Later specialist/review roles use their own required domain. The orchestrator chooses compatible alternatives before dispatch; unsupported models cannot be slipped into a role merely through the AI's JSON.

Context is checked conservatively against UTF-8 input bytes plus 1,024 framing tokens and the requested output ceiling. This is a safe bound rather than an exact tokenizer and can reject inputs that might otherwise fit. Known output ceilings from the price catalog are retained. For direct-provider overrides without catalog context metadata, configure `OLYHUB_EXECUTOR_CAPABILITIES_JSON` with `contextLength` and, where needed, `maxOutputTokens`, alongside domains/maxComplexity. Unknown context is not silently assumed capable.

Image and search capabilities use their separate, exact server-configured model IDs and capability flags; they cannot be called through a text role. Tool availability/quality still requires provider validation, and their full monetary fees are not established by text price metadata. Web search now sends its 1,800-token output cap to the provider explicitly; image output remains capped at 4,096 response tokens. Input and output allocations are bounded before issuance.

## Per-account policy

Only trusted server/admin/billing operations may change `account_limits`. New fields are:

| Column | Default | Meaning |
|---|---|---|
| `max_execution_level` | 4 | Highest permitted level; Olympus still separately requires entitlement |
| `allowed_model_tiers` | economy, premium | Allowed configured model tiers, including classification |
| `allow_image` | true | Image capability access |
| `allow_web` | true | Search capability access |

Defaults preserve existing Zeus behavior. `olympus_entitled` still defaults false. These fields do not invent subscription products, automatically activate paid plans or integrate billing; commercial plan synchronization remains item 7. JWT user_metadata is never used as authorization. Account changes are read from database state at each permit, avoiding stale client/JWT plan claims.

## Accounting and refusals

The in-memory call cap can only narrow. A persisted permit consumes a unique slot before dispatch; replaying a request UUID does not buy new slots. Missing authorization, wrong receipts, permission failures, database outages and expired deadlines abort the pipeline. They do not trigger cross-provider fallback. Valid provider outages retain the previously bounded fallback behavior.

Blocked pre-dispatch attempts are marked `blocked`, have zero provider charge, and are excluded from the count of dispatched attempts while remaining in the audit trace. Actual failed provider calls remain charged conservatively if usage is unknown. Invalid reported usage cannot become a fabricated zero. Legacy execution rows require at least one model call, so pre-inference refusals remain in the financial reservation ledger instead of producing a fake one-call execution.

Settlement now accepts up to six trace entries, matching router + web + four executor roles. Previously it rejected more than four entries. Historical rows are retained; old in-flight rows without new admission metadata cannot obtain new permits after rollout. Expiry frees concurrency, not unverified spend. These controls enforce attempt/token allowances, not exact dollar invoices; provider reconciliation and monetary caps remain item 7.

## Verification

Mocked API tests cover forged client fields, rejected grants before inference, revocation between stages, RPC outages, account tier restrictions and plan-level refusal. Embedded SQL tests execute the migration and verify service-only RPC grants, cross-owner refusal, duplicate permits, fixed role manifests, concurrent queued admissions, account/entitlement/quota revocation, expiry, image/search flags and six-call settlement. Budget/model tests cover absent authorization, model substitution, context/output/capability refusal, cap widening and malformed usage. No live paid inference or production database migration was run.
