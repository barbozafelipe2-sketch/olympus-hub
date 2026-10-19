import { compactInput, MAX_OUTPUT_TOKENS } from "./budget.js";
const HEALTH_WINDOW_MS = 60_000;
const FAILURE_THRESHOLD = 2;
const health = new Map();

function stateFor(provider) {
  if (!health.has(provider)) {
    health.set(provider, { failures: 0, blockedUntil: 0 });
  }
  return health.get(provider);
}

function configured(provider) {
  if (provider === "openai") return Boolean(process.env.OPENAI_API_KEY);
  if (provider === "anthropic") return Boolean(process.env.ANTHROPIC_API_KEY);
  if (provider === "google") {
    return Boolean(process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY);
  }
  return false;
}

export function providerAvailable(provider) {
  if (!configured(provider)) return false;
  return Date.now() >= stateFor(provider).blockedUntil;
}

export function configuredProviders() {
  return ["openai", "anthropic", "google"].filter(providerAvailable);
}

function markSuccess(provider) {
  health.set(provider, { failures: 0, blockedUntil: 0 });
}

function markFailure(provider) {
  const state = stateFor(provider);
  const failures = state.failures + 1;
  health.set(provider, {
    failures,
    blockedUntil:
      failures >= FAILURE_THRESHOLD ? Date.now() + HEALTH_WINDOW_MS : 0
  });
}

export function modelFor(provider, tier = "economy") {
  const configured = process.env[`${provider.toUpperCase()}_${tier.toUpperCase()}_MODEL`];
  if (configured) return configured;
  if (provider === "openai") {
    return (
      process.env.OPENAI_DEFAULT_MODEL ||
      process.env.OPENAI_FALLBACK_MODEL ||
      (tier === "premium" ? "gpt-5-mini" : "gpt-4.1-mini")
    );
  }

  if (provider === "anthropic") {
    return process.env.ANTHROPIC_MODEL || (tier === "premium" ? "claude-sonnet-4-5" : "claude-haiku-4-5");
  }

  return process.env.GOOGLE_AI_MODEL || "gemini-2.5-flash";
}

function requestId(response, fallback) {
  return (
    response.headers.get("x-request-id") ||
    response.headers.get("request-id") ||
    fallback ||
    crypto.randomUUID()
  );
}

async function fetchJson(url, init, timeoutMs, signal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal
    });
    const data = await response.json().catch(() => null);
    return { response, data };
  } finally {
    clearTimeout(timeout);
  }
}

function transcript(messages) {
  return messages
    .map((message) => message.role.toUpperCase() + ": " + message.content)
    .join("\n\n");
}

function openAIText(data) {
  const output = Array.isArray(data?.output) ? data.output : [];
  return output
    .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    .filter(
      (part) => part?.type === "output_text" && typeof part?.text === "string"
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function anthropicText(data) {
  return (Array.isArray(data?.content) ? data.content : [])
    .filter((part) => part?.type === "text" && typeof part?.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function numberOrZero(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
}

function openAIUsage(data) {
  const usage = data?.usage || {};
  const inputTokens = numberOrZero(usage.input_tokens);
  const outputTokens = numberOrZero(usage.output_tokens);

  return {
    reported: data?.usage != null && (data.usage.input_tokens != null || data.usage.total_input_tokens != null),
    inputTokens,
    outputTokens,
    cachedInputTokens: numberOrZero(usage.input_tokens_details?.cached_tokens),
    cacheWriteTokens: 0,
    reasoningTokens: numberOrZero(
      usage.output_tokens_details?.reasoning_tokens
    ),
    toolTokens: 0,
    totalTokens: numberOrZero(usage.total_tokens) || inputTokens + outputTokens
  };
}

function anthropicUsage(data) {
  const usage = data?.usage || {};
  const inputTokens = numberOrZero(usage.input_tokens);
  const outputTokens = numberOrZero(usage.output_tokens);
  const cachedInputTokens = numberOrZero(usage.cache_read_input_tokens);
  const cacheWriteTokens = numberOrZero(usage.cache_creation_input_tokens);

  return {
    reported: data?.usage != null && (data.usage.input_tokens != null || data.usage.total_input_tokens != null),
    inputTokens,
    outputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    reasoningTokens: 0,
    toolTokens: 0,
    totalTokens:
      inputTokens + outputTokens + cachedInputTokens + cacheWriteTokens
  };
}

function googleUsage(data) {
  const usage = data?.usage || {};
  const inputTokens = numberOrZero(usage.total_input_tokens);
  const outputTokens = numberOrZero(usage.total_output_tokens);
  const reasoningTokens = numberOrZero(usage.total_thought_tokens);
  const toolTokens = numberOrZero(usage.total_tool_use_tokens);

  return {
    reported: data?.usage != null && (data.usage.input_tokens != null || data.usage.total_input_tokens != null),
    inputTokens,
    outputTokens,
    cachedInputTokens: numberOrZero(usage.total_cached_tokens),
    cacheWriteTokens: 0,
    reasoningTokens,
    toolTokens,
    totalTokens:
      numberOrZero(usage.total_tokens) ||
      inputTokens + outputTokens + reasoningTokens
  };
}

function googleText(data) {
  return (Array.isArray(data?.steps) ? data.steps : [])
    .filter((step) => step?.type === "model_output")
    .flatMap((step) => (Array.isArray(step?.content) ? step.content : []))
    .filter((part) => part?.type === "text" && typeof part?.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

async function callOpenAI({ system, messages, maxOutputTokens, timeoutMs, model, signal }) {
  const { response, data } = await fetchJson(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        instructions: system,
        input: messages.map((message) => ({
          role: message.role,
          content: message.content
        })),
        max_output_tokens: maxOutputTokens
      })
    },
    timeoutMs, signal
  );

  const id = requestId(response, data?.id);
  if (!response.ok) {
    throw Object.assign(new Error("OpenAI request failed."), {
      provider: "openai",
      status: response.status,
      requestId: id, model, usage: null
    });
  }

  const text = openAIText(data);
  if (!text) throw Object.assign(new Error("OpenAI returned an empty response."), { provider: "openai", model, requestId: id, usage: openAIUsage(data) });

  return {
    text,
    provider: "OpenAI",
    providerId: "openai",
    model,
    requestId: id,
    usage: openAIUsage(data)
  };
}

async function callAnthropic({ system, messages, maxOutputTokens, timeoutMs, model, signal }) {
  const { response, data } = await fetchJson(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        system,
        max_tokens: maxOutputTokens,
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content
        }))
      })
    },
    timeoutMs, signal
  );

  const id = requestId(response, data?.id);
  if (!response.ok) {
    throw Object.assign(new Error("Anthropic request failed."), {
      provider: "anthropic",
      status: response.status,
      requestId: id, model, usage: null
    });
  }

  const text = anthropicText(data);
  if (!text) throw Object.assign(new Error("Anthropic returned an empty response."), { provider: "anthropic", model, requestId: id, usage: anthropicUsage(data) });

  return {
    text,
    provider: "Anthropic",
    providerId: "anthropic",
    model: data?.model || model,
    requestId: id,
    usage: anthropicUsage(data)
  };
}

async function callGoogle({ system, messages, maxOutputTokens, timeoutMs, model, signal }) {
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  const input =
    "SYSTEM GUIDANCE:\n" +
    system +
    "\n\nCONVERSATION:\n" +
    transcript(messages);

  const { response, data } = await fetchJson(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input,
        store: false,
        generation_config: {
          max_output_tokens: maxOutputTokens
        }
      })
    },
    timeoutMs, signal
  );

  const id = requestId(response, data?.id);
  if (!response.ok) {
    throw Object.assign(new Error("Google AI request failed."), {
      provider: "google",
      status: response.status,
      requestId: id, model, usage: null
    });
  }

  const text = googleText(data);
  if (!text) throw Object.assign(new Error("Google AI returned an empty response."), { provider: "google", model, requestId: id, usage: googleUsage(data) });

  return {
    text,
    provider: "Google AI",
    providerId: "google",
    model: data?.model || model,
    requestId: id,
    usage: googleUsage(data)
  };
}

export async function callProvider(
  provider,
  {
    system,
    messages,
    maxOutputTokens = 4096,
    timeoutMs = 28_000,
    tier = "economy",
    model: selectedModel = null,
    budget = null,
    role = "model"
  }
) {
  if (!providerAvailable(provider)) {
    throw Object.assign(new Error(provider + " is unavailable."), {
      provider,
      unavailable: true
    });
  }

  const input = compactInput(system, messages);
  system = input.system; messages = input.messages;
  maxOutputTokens = Math.min(MAX_OUTPUT_TOKENS, maxOutputTokens);
  if (selectedModel && ![modelFor(provider, "economy"), modelFor(provider, "premium")].includes(selectedModel)) throw Object.assign(new Error("Executor model is not configured."), { code: "EXECUTOR_MODEL_DENIED", status: 400 });
  const model = selectedModel || modelFor(provider, tier);
  if (!budget?.reserveAuthorized) throw Object.assign(new Error("Paid inference requires a reserved budget."), { code: "AI_AUTHORIZATION_REQUIRED", status: 503 });
  const event = await budget.reserveAuthorized(role, provider, model, system.length + messages.reduce((n,m)=>n+m.content.length,0), maxOutputTokens,
    { tier, inputBytes: Buffer.byteLength(system + messages.map(m=>m.content).join("")) });
  timeoutMs = Math.max(1, Math.min(timeoutMs, budget ? budget.remaining() - 5000 : timeoutMs));
  const signal = budget?.signal;
  try {
    let result;
    if (provider === "openai") {
      result = await callOpenAI({ system, messages, maxOutputTokens, timeoutMs, model, signal });
    } else if (provider === "anthropic") {
      result = await callAnthropic({
        system,
        messages,
        maxOutputTokens,
        timeoutMs, model, signal
      });
    } else if (provider === "google") {
      result = await callGoogle({ system, messages, maxOutputTokens, timeoutMs, model, signal });
    } else {
      throw new Error("Unknown provider.");
    }

    budget?.complete(event, result);
    markSuccess(provider);
    return result;
  } catch (error) {
    budget?.complete(event, null, error);
    markFailure(provider);
    throw error;
  }
}

export function __resetProviderHealthForTests() { health.clear(); }
