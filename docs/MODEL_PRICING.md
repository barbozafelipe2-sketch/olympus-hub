# Dynamic prices — item 2/7

The router no longer ships a hardcoded model-price list. After quota admission, the server reads `https://openrouter.ai/api/v1/models` (public metadata, no inference), validates text models, and intersects the result with the configured adapters/model IDs. It compares input + output + per-request fees, including legitimate zero prices. Missing token prices and negative, non-finite or malformed token/advertised request prices are rejected. The live endpoint omits the optional request-fee field when no separate request fee is advertised: that component contributes zero to the reference estimate and is explicitly marked requestFeeListed=false, rather than claiming all service fees are known. UTC day/time promotional overrides are applied from the cached metadata on each pricing lookup; ambiguous or unsupported schedules are excluded and quote validity ends at the next relevant time boundary. Price units are converted from USD/token to USD/million tokens, preserving USD/request separately.

This step discovers price metadata for the complete feed; it only executes configured models the current adapters can call. It does not enable every OpenRouter model or add the gateway adapter (item 4). Model capabilities and quality remain validated against the server catalog from item 1.

## Freshness and failures

Public metadata is cached per warm server process for 15 minutes, with concurrent refresh requests coalesced. After a failed refresh, a snapshot may remain usable for at most one hour from its original fetch; failures do not reset its age. A 60-second retry backoff prevents bursts. Cold starts have no saved snapshot. Fetch timeout is 1.8 seconds, response body is bounded to 3 MiB, redirects are rejected. No user prompts, authentication tokens or private prices are placed in the shared public-feed cache.

When no valid quotation can be obtained, the API returns 503/MODEL_PRICING_UNAVAILABLE before any paid classifier/executor call. The quota reservation is settled without charging AI attempts. The existing Try again button starts a new attempt. There is no indefinite stale fallback or static-price fallback.

Only priced models enter the classifier and executor choices. Reviewers, directors, CEO and failover providers also use configured models with still-valid quotes. If an independent priced reviewer is missing, the existing degraded-result behavior applies; no unpriced provider is silently called.

Classifier comparison estimates input from the actual bounded JSON payload plus system overhead, and includes the 320-token output ceiling and per-request fee. It is a token estimate, not a tokenizer measurement or invoice. Capability fallback compares the common 8,000-input/4,096-output budget. Telemetry includes quotation source, model ID, fetch/expiry timestamps, age, input/output/request rates and the estimated classification charge. Actual AI usage remains independently accounted.

## Direct-provider prices versus OpenRouter reference

OpenRouter catalog prices are labeled `openrouter_reference`. The current direct OpenAI/Anthropic/Google calls can have different billing, discounts, gateway fees or long-context rates; a public OpenRouter quote is an estimate/reference, not the direct provider's invoice. Netlify/OpenRouter execution is item 4, and financial reconciliation is item 7. Image-generation charges, search-tool fees, subscription discounts and gateway/credit surcharges are not fully represented by these text-token quotations. Do not promise exact monetary caps based only on these estimates.

For account-specific direct-provider quotations, set server-only `OLYHUB_MODEL_PRICES_JSON` keyed by exact `provider:model`. Example shape (timestamps must be real, current ISO timestamps):

```json
{
  "openai:your-configured-model": {
    "input": 0.1,
    "output": 0.2,
    "request": 0,
    "updatedAt": "CURRENT_ISO_TIMESTAMP",
    "expiresAt": "ISO_TIMESTAMP_WITHIN_ONE_HOUR"
  }
}
```

Input/output units are USD per million tokens, request is USD per inference. Both timestamps are required; future updates, expired quotes or validity windows longer than one hour are rejected. Valid account-specific quotes override public references. When every candidate has a valid override, no public fetch is needed. Legacy unversioned `OLYHUB_ROUTER_MODEL_PRICES_JSON` arrays are no longer accepted: migrate them to dated quotations instead of perpetuating stale prices.

Exact `provider/model` IDs are matched by default. The documented Anthropic version notation `claude-haiku-4-5` → `anthropic/claude-haiku-4.5` (likewise Sonnet/Opus versions) is recognized without fuzzy family/version matching. Other exact aliases can be configured through server-only `OLYHUB_PRICE_MODEL_MAP_JSON`, for example:

```json
{"anthropic:your-direct-model-alias":"anthropic/exact-catalog-model-id"}
```

Mapping supplies a reference quote only; it cannot change an inference endpoint or enable an unconfigured model. No same-family or name-substring price guessing is performed.

## Validation

Tests cover feed conversion and rejection, real zero versus empty fields, request-fee ranking, changing the cheapest model after a refresh, newly configured models without a code-price update, cache coalescing, bounded stale use/backoff, expired overrides, exact mappings, failed/oversized catalogs and API rejection before paid inference. Existing routing, quota, SQL/RLS and orchestration regressions remain covered.

A read-only check of the live public catalog returned 471 records (788,484 bytes); the parser accepted 460 usable quotations after schedule validation at that check. This validates the feed format and connectivity in the development environment, not deployed production access or paid model performance. No live paid inference was used.
