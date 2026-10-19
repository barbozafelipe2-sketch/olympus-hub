// Public price metadata only. No prompts or account credentials enter this shared cache.
const FEED = 'https://openrouter.ai/api/v1/models';
const TTL = 15 * 60_000, MAX_AGE = 60 * 60_000, BACKOFF = 60_000, MAX_BYTES = 3 * 1024 * 1024;
let snapshot = null, pending = null, retryAt = 0;
export const priceNumber = value => (typeof value === 'number' || typeof value === 'string' && /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value))
  && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
export function estimateCost(price, { inputTokens = 1500, outputTokens = 320, now = Date.now() } = {}) {
  if (price?.expiresAt != null && price.expiresAt <= now) return Infinity;
  if (!price || ![price.input, price.output, price.request, inputTokens, outputTokens].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)) return Infinity;
  const cost = price.request + (price.input * inputTokens + price.output * outputTokens) / 1_000_000;
  return Number.isFinite(cost) ? cost : Infinity;
}
const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
function minutes(value) {
  return Number.isInteger(value) && value >= 0 && value <= 2359 && value % 100 < 60 ? Math.floor(value / 100) * 60 + value % 100 : null;
}
export function scheduledRates(pricing, now = Date.now()) {
  const rules = pricing?.overrides;
  if (rules == null) return { rates: pricing, rateKind: 'base', boundary: Infinity };
  if (!Array.isArray(rules) || rules.length > 100) throw Error('Unsupported price schedule.');
  const date = new Date(now), day = date.getUTCDay(), minute = date.getUTCHours() * 60 + date.getUTCMinutes();
  const active = [], boundaries = [0];
  for (const rule of rules) {
    const days = rule.utc_days ?? DAYS;
    if (!Array.isArray(days) || !days.length || days.some(d => !DAYS.includes(d))) throw Error('Invalid price schedule days.');
    const allDay = rule.utc_start == null && rule.utc_end == null;
    const start = allDay ? 0 : minutes(rule.utc_start), end = allDay ? 0 : minutes(rule.utc_end);
    if (start === null || end === null) throw Error('Invalid price schedule hours.');
    boundaries.push(start, end);
    const activeDay = !allDay && start > end && minute < end ? (day + 6) % 7 : day;
    const activeTime = allDay || start === end || (start < end ? minute >= start && minute < end : minute >= start || minute < end);
    if (days.includes(DAYS[activeDay]) && activeTime) active.push(rule);
  }
  if (active.length > 1) throw Error('Ambiguous active price overrides.');
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const next = boundaries.map(m => midnight + m * 60_000).filter(t => t > now);
  next.push(midnight + 24 * 60 * 60_000);
  return { rates: { ...pricing, ...active[0] }, rateKind: active.length ? 'scheduled_override' : 'base', boundary: Math.min(...next) };
}
function quoteRates(pricing, now, fetchedAt) {
  const { rates, rateKind, boundary } = scheduledRates(pricing, now);
  const input = priceNumber(rates?.prompt), output = priceNumber(rates?.completion);
  // This public endpoint omits request when no separate request fee is advertised.
  const listed = rates && Object.hasOwn(rates, 'request');
  const request = listed ? priceNumber(rates.request) : 0;
  if (input === null || output === null || request === null) return null;
  return { input: input * 1_000_000, output: output * 1_000_000, request, requestFeeListed: Boolean(listed), rateKind,
    fetchedAt, expiresAt: Math.min(fetchedAt + MAX_AGE, boundary) };
}
export function parsePriceFeed(body, now = Date.now()) {
  if (!Array.isArray(body?.data) || body.data.length > 20000) throw Error('Invalid model catalog.');
  const models = new Map(), duplicates = new Set();
  for (const row of body.data) {
    if (typeof row?.id !== 'string' || row.id.length > 200) continue;
    let rates; try { rates = quoteRates(row.pricing, now, now); } catch { continue; }
    if (!rates) continue;
    if (!row.architecture?.input_modalities?.includes('text') || !row.architecture?.output_modalities?.includes('text')) continue;
    if (!Number.isSafeInteger(row.context_length) || row.context_length < 4096) continue;
    if (row.expiration_date && (!Number.isFinite(Date.parse(row.expiration_date)) || Date.parse(row.expiration_date) <= now)) continue;
    if (models.has(row.id) || duplicates.has(row.id)) { models.delete(row.id); duplicates.add(row.id); continue; }
    const completionLimit = row.top_provider?.max_completion_tokens;
    if (completionLimit != null && (!Number.isSafeInteger(completionLimit) || completionLimit < 320)) continue;
    const price = { ...rates, source: 'openrouter_reference', rawPricing: row.pricing, contextLength: row.context_length, modelId: row.id };
    if (Number.isFinite(estimateCost(price, { now }))) models.set(row.id, price);
  }
  if (!models.size) throw Error('Catalog contains no usable text prices.');
  return { models, fetchedAt: now };
}
async function boundedJson(response) {
  const declared = Number(response.headers.get('content-length'));
  if (declared > MAX_BYTES) throw Error('Price catalog too large.');
  if (!response.body) throw Error('Missing price catalog.');
  const reader = response.body.getReader(); let size = 0, text = ''; const decoder = new TextDecoder();
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > MAX_BYTES) throw Error('Price catalog too large.'); text += decoder.decode(value, { stream: true }); }
    return JSON.parse(text + decoder.decode());
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function priceSnapshot({ fetcher = globalThis.fetch, now = Date.now() } = {}) {
  if (snapshot && now - snapshot.fetchedAt < TTL) return snapshot;
  if (!pending && now >= retryAt) {
    pending = (async () => {
      const response = await fetcher(FEED, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(1800), redirect: 'error' });
      if (!response.ok) throw Error('Price catalog unavailable.');
      const next = parsePriceFeed(await boundedJson(response), now); snapshot = next; retryAt = 0;
    })().catch(() => { retryAt = now + BACKOFF; }).finally(() => { pending = null; });
  }
  if (pending) await pending;
  return snapshot && now - snapshot.fetchedAt < MAX_AGE ? snapshot : { models: new Map(), fetchedAt: null };
}
function jsonEnv(name) { try { const value = JSON.parse(process.env[name] || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; } }
export function overridePrice(provider, model, now = Date.now()) {
  const value = jsonEnv('OLYHUB_MODEL_PRICES_JSON')[provider + ':' + model];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = priceNumber(value.input), output = priceNumber(value.output), request = priceNumber(value.request);
  const fetchedAt = Date.parse(value.updatedAt), expiresAt = Date.parse(value.expiresAt);
  if ([input, output, request].includes(null) || !Number.isFinite(fetchedAt) || !Number.isFinite(expiresAt)
    || fetchedAt > now || now >= expiresAt || expiresAt - fetchedAt > MAX_AGE) return null;
  return { input, output, request, requestFeeListed: true, rateKind: 'provider_quote', source: 'provider_override', fetchedAt, expiresAt, modelId: model };
}
export async function priceCatalog(catalog, options = {}) {
  const now = options.now ?? Date.now();
  const needsFeed = catalog.some(c => !overridePrice(c.provider, c.model, now));
  const feed = needsFeed ? await priceSnapshot(options) : { models: new Map(), fetchedAt: null };
  const aliases = jsonEnv('OLYHUB_PRICE_MODEL_MAP_JSON');
  return catalog.map(c => {
    const mapped = aliases[c.provider + ':' + c.model];
    const id = typeof mapped === 'string' ? mapped : c.model.includes('/') ? c.model : c.provider + '/' + c.model;
    // Anthropic's direct API uses 4-5 where the catalog uses 4.5. Only a version-notation change, never fuzzy matching.
    const anthropicId = c.provider === 'anthropic' && !mapped ? 'anthropic/' + c.model.replace(/^(claude-(?:haiku|sonnet|opus))-(\d+)-(\d+)(?=-|$)/, '$1-$2.$3') : null;
    const price = overridePrice(c.provider, c.model, now) || feed.models.get(id) || (anthropicId && feed.models.get(anthropicId)) || null;
    let current = price;
    if (price?.rawPricing) {
      try { const rates = quoteRates(price.rawPricing, now, price.fetchedAt); current = rates ? { ...price, ...rates } : null; } catch { current = null; }
    }
    if (current) { const { rawPricing, ...publicPrice } = current; current = { ...publicPrice, cachedAgeMs: now - current.fetchedAt }; }
    return { ...c, price: current, priceUsdPerMillionTokens: current ? { input: current.input, output: current.output } : null };
  });
}
export function __resetPricingForTests() { snapshot = null; pending = null; retryAt = 0; }
