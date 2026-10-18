# Intelligent routing — item 1/7

The cheap classifier now chooses the complete route, not only a domain. Its strict response is:

```json
{"domain":"engineering","taskType":"coding","complexity":"moderate","level":2,"executorId":"openai:economy"}
```

Allowed task types: answer, writing, coding, analysis, design, research. Domains: content, visual, engineering. Complexity: simple, moderate, complex. Levels: 1 answer; 2 author + independent reviewer; 3 author + critic + finalizer; 4 up to two specialists + Director + CEO. Level 1 requires simple complexity, levels 3/4 require complex complexity. Coding and design must match their domains. Unknown executor IDs or malformed responses cause a bounded rules fallback; no second classifier request is issued.

The API admits usage BEFORE the classifier. The classifier sees a redacted, bounded request, two short prior turns, project goal and a server-generated model catalog. No client route/model field is accepted. Recommendations cannot bypass account limits, manual engine choice or automatic-Off. Automatic Olympus requires the server-issued entitlement from the atomic reservation RPC. Manual Olympus remains available to entitled accounts. Image generation keeps its dedicated one-call Level 2 capability path and is not reclassified as text.

## Actual executor selection

The catalog is built from configured, currently available OpenAI, Anthropic and Google economy/premium adapter models. The selected executor ID maps to the exact configured provider/model/tier. That model is passed to the author, first specialist or Simple answer, rather than being discarded in favor of the previous fixed provider order. Later review roles retain independent-family selection. Simple may try another configured provider only after the first answer fails, within its already-reserved allowance. No arbitrary model IDs or URLs can be supplied by the classifier.

Default economy capabilities allow simple/moderate work, premium allows complex work; all three domains are allowed by default. Configure trusted model-specific evidence with server-only `OLYHUB_EXECUTOR_CAPABILITIES_JSON`, for example:

```json
{"your-configured-model-id":{"domains":["engineering","content"],"maxComplexity":"complex"}}
```

Models must still be configured through the existing economy/premium adapter variables. Capability settings do not create new adapters or attest measured quality. If the suggested model cannot meet configured capabilities, the server chooses a compatible configured model and reports the restriction. If none exists, execution stops instead of sending work to a known-incompatible model.

## Cost and bounded failures

The classifier is the least estimated-cost configured economy/premium model WITH known prices, using a short-input/320-output-token estimate. Prices are USD per million input/output tokens, from the existing baseline plus `OLYHUB_ROUTER_MODEL_PRICES_JSON` overrides (`{"model-id":[inputPrice,outputPrice]}`). Unknown-price models are excluded from classification. Known prices are supplied to the classifier as catalog information. Price feeds and broader gateway discovery belong to item 2; this is not a claim to cover every provider or current global prices.

Admission reserves a conservative maximum: 3 calls for Zeus with automatic Off, or 5 for manual/automatic Olympus, plus 1 when web research is requested. Those limits include the classifier. After classification the executable cap narrows to classifier attempts already consumed + selected role count + web (if requested) + Simple failover slot. Failed classification stays charged, while valid rules fallback can still complete within the cap. Unused reservation is released on settlement; unknown paid-attempt usage remains conservative. Near-quota requests may be denied before classification even if a cheaper route might have fit. No second, unreserved admission or hidden model call is made.

Response telemetry includes selected task type, complexity, recommended/applied level, actual primary executor, routing source, fallback reason, permission/capability restrictions, actual cap and reservation cap. The trace retains every metered router/executor attempt. Availability degradation remains explicit; a four-family council still requires adapters for four actual families (item 4/gateway work).

No schema migration, subscription integration, live price feed, gateway migration or Comparison/Combine UI is part of item 1. Existing commercial-budget migrations and server accounting configuration remain required.

Validation: mocked API tests cover all stage counts, exact model selection, independent Level 2 review, automatic-Off, entitlement denial, rejected budgets before inference, malformed/unknown classifier output, failed-classifier accounting and direct model-override rejection. No paid live inference was used to validate quality or latency.
