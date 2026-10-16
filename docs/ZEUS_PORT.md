# Zeus engine adaptation for OlyHub

Source reviewed: `barbozafelipe2-sketch/zeus-proxy@33a9478cac8258e5754173bc80857f5fb24d9d03`.
Commercial policy preserved: `olympus-hub@7e3b31cae52c5caef1607ce62b44a0b8ac342d70`.

## Adapted and integrated

| Zeus component / behavior | Commercial implementation |
|---|---|
| Newest-first history selection, sanitization before clipping | `api/lib/history.js`, adapted directly from `_shared/history.mjs`, used by Home and Project loading |
| Shared execution budget with hard attempt caps | `api/lib/budget.js`, used by provider calls, web research and image generation |
| Family-independent Compound review and domain-oriented selection | `api/lib/model-routing.js` and `orchestrator.js`; respects commercial role preferences |
| Cheap intermediate work, configurable final models | Economy/premium adapter variables in `providers.js` |
| Bounded stage persistence | `phase-checkpoints.js` and `ai_stage_checkpoints`, written after successful calls |
| Honest failed-attempt accounting and degradation | Every outbound attempt enters the same telemetry/budget; no fabricated independent review |
| Conservative handling of unknown spend | Server-only atomic reservations; unknown usage retains an allowance |

Commercial fixes also included: content deletion no longer removes budget totals, duplicate request IDs cannot spend again, admission checks serialize per account, image generation has a separate daily cap, missing configuration fails closed, and Olympus requires a server-maintained entitlement. Supabase user authentication, ownership/RLS checks and the React/native product boundary are preserved.

Personal owner IDs, access-token login, Netlify Gateway credentials, deployment configuration and personal memory/prompts were not copied. The source's three-stage Directed mode and worker-lease implementation are not advertised as implemented here.

## Remaining corrections / release work

1. **Apply the new migration and configure the server accounting key before deploying this backend.** Without them chat intentionally fails before paid inference. Run the two-user staging isolation harness and actual parallel-connection quota tests. Embedded PostgreSQL tests validate SQL/RLS and queued reservations, not production concurrency/latency.
2. **Connect paid plans and entitlements.** `olympus_entitled` defaults to false; an administrator or trusted billing backend must grant it. Add verified billing webhooks, renewal/cancellation handling and limits derived from real margins. No subscription integration or profitability claim is provided by this port.
3. **Add the missing provider adapters before promising a four-family council.** The preserved policy names Meta/Kimi/Qwen/DeepSeek/Grok, but the runtime adapters still support OpenAI, Anthropic and Google only. Domain preferences use configured adapters; incomplete diversity is reported as degraded.
4. **Move long work to a durable worker before adding Zeus Directed.** Implement server-owned job admission, queue generations, leases, fencing and cancellation for the commercial runtime. Then integrate the persisted stage manifests with fingerprint-checked resume. Present checkpoints do not automatically resume work or replay lost responses. The current runtime remains synchronous with a 75-second paid-call deadline.
5. **Port binary artifact creation separately.** PDF/DOCX/XLSX/PPTX/ZIP generators require commercial storage integration, output validation, archive protections, dependency review and download authorization. Current artifact support remains the commercial versioned-content implementation.
6. **Reconcile actual monetary spend.** Version model prices, account for tool/image fees, reconcile unknown/expired reservations against provider usage and enforce deployment-wide monetary caps. Token allowances are safety accounting, not dollar invoices; conservative reservations can reject otherwise affordable requests near a quota.
7. **Benchmark quality and cost.** Validate model availability, task success, p50/p95 latency and cost per completed task with the intended provider accounts. Mocked tests do not establish quality or live model access. Keep the existing App Store/privacy/billing release gates.

The commercial client still persists the final assistant message after receiving the API response. A lost response can therefore leave checkpoints/accounting without a final visible assistant message. Server-owned final-message persistence and safe response replay belong in the durable-job work above.

## Validation

Run `npm test`, `npm run typecheck`, `npm run build`, `npm run smoke`. Tests include SQL migration/backfill, RLS and privileged RPC permissions, retained accounting, stage-content deletion, entitlement denial, bounded calls, independent-family selection, failed attempts, sanitized history and the API admission boundary. All model requests in tests are mocked.
