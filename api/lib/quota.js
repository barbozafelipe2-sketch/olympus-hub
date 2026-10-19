import { createClient } from "@supabase/supabase-js";
import { MAX_INPUT_CHARS, MAX_OUTPUT_TOKENS } from "./budget.js";

export const DEFAULT_LIMITS = Object.freeze({ dailyRequests: 20, dailyTokens: 1000000, monthlyTokens: 10000000, concurrent: 1, imageDailyRequests: 2 });
const positive = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
};
export function configuredLimits() {
  return {
    dailyRequests: positive("OLYHUB_DAILY_REQUEST_LIMIT", DEFAULT_LIMITS.dailyRequests),
    dailyTokens: positive("OLYHUB_DAILY_TOKEN_LIMIT", DEFAULT_LIMITS.dailyTokens),
    monthlyTokens: positive("OLYHUB_MONTHLY_TOKEN_LIMIT", DEFAULT_LIMITS.monthlyTokens),
    concurrent: Math.min(5, positive("OLYHUB_CONCURRENT_REQUEST_LIMIT", DEFAULT_LIMITS.concurrent)),
    imageDailyRequests: positive("OLYHUB_IMAGE_DAILY_REQUEST_LIMIT", DEFAULT_LIMITS.imageDailyRequests)
  };
}
export function makeBudgetClient() {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.SUPABASE_URL || !key) throw Object.assign(new Error("Server budget storage is not configured."), { code: "BUDGET_NOT_CONFIGURED" });
  return createClient(process.env.SUPABASE_URL, key, { global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(10000) }) }, auth: { persistSession: false, autoRefreshToken: false } });
}
export async function reserveQuota(client, { ownerId, requestId, fingerprint, maxCalls, kind = "text", mode = "zeus", allowOlympus = false, allowWeb = false }) {
  const { data, error } = await client.rpc("reserve_ai_budget", {
    p_owner_id: ownerId, p_request_id: requestId, p_fingerprint: fingerprint,
    p_reserved_tokens: maxCalls * (MAX_INPUT_CHARS * 4 + MAX_OUTPUT_TOKENS),
    p_limits: { ...configuredLimits(), engine: mode, maxCalls, allowOlympus, allowWeb }, p_kind: kind
  });
  if (error) throw Object.assign(new Error("Account budget could not be reserved."), { code: "BUDGET_STORAGE_UNAVAILABLE" });
  return data;
}
export async function settleQuota(client, { ownerId, requestId, budget, failed = false }) {
  const { data, error } = await client.rpc("settle_ai_budget", {
    p_owner_id: ownerId, p_request_id: requestId,
    p_charged_tokens: budget.chargedTokens(), p_failed: failed,
    p_trace: budget.events
  });
  if (error || !data) throw Object.assign(new Error("Account budget settlement failed."), { code: "BUDGET_SETTLEMENT_FAILED" });
  return data;
}
