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

function modelFor(provider) {
  if (provider === "openai") {
    return (
      process.env.OPENAI_DEFAULT_MODEL ||
      process.env.OPENAI_FALLBACK_MODEL ||
      "gpt-5.6-luna"
    );
  }

  if (provider === "anthropic") {
    return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  }

  return process.env.GOOGLE_AI_MODEL || "gemini-3.8-flash";
}

function requestId(response, fallback) {
  return (
    response.headers.get("x-request-id") ||
    response.headers.get("request-id") ||
    fallback ||
    crypto.randomUUID()
  );
}

async function fetchJson(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal
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

function googleText(data) {
  return (Array.isArray(data?.steps) ? data.steps : [])
    .filter((step) => step?.type === "model_output")
    .flatMap((step) => (Array.isArray(step?.content) ? step.content : []))
    .filter((part) => part?.type === "text" && typeof part?.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

async function callOpenAI({ system, messages, maxOutputTokens, timeoutMs }) {
  const model = modelFor("openai");
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
    timeoutMs
  );

  const id = requestId(response, data?.id);
  if (!response.ok) {
    throw Object.assign(new Error("OpenAI request failed."), {
      provider: "openai",
      status: response.status,
      requestId: id
    });
  }

  const text = openAIText(data);
  if (!text) throw new Error("OpenAI returned an empty response.");

  return { text, provider: "OpenAI", providerId: "openai", model, requestId: id };
}

async function callAnthropic({ system, messages, maxOutputTokens, timeoutMs }) {
  const model = modelFor("anthropic");
  const { response, data } = await fetchJson(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.ANTHROPIC_API_KEY,
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
    timeoutMs
  );

  const id = requestId(response, data?.id);
  if (!response.ok) {
    throw Object.assign(new Error("Anthropic request failed."), {
      provider: "anthropic",
      status: response.status,
      requestId: id
    });
  }

  const text = anthropicText(data);
  if (!text) throw new Error("Anthropic returned an empty response.");

  return {
    text,
    provider: "Anthropic",
    providerId: "anthropic",
    model: data?.model || model,
    requestId: id
  };
}

async function callGoogle({ system, messages, maxOutputTokens, timeoutMs }) {
  const model = modelFor("google");
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  const input =
    "SYSTEM GUIDANCE:\n" +
    system +
    "\n\nCONVERSATION:\n" +
    transcript(messages);

  const { response, data } = await fetchJson(
    "https://generativelanguage.googleapis.com/v1/interactions",
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
    timeoutMs
  );

  const id = requestId(response, data?.id);
  if (!response.ok) {
    throw Object.assign(new Error("Google AI request failed."), {
      provider: "google",
      status: response.status,
      requestId: id
    });
  }

  const text = googleText(data);
  if (!text) throw new Error("Google AI returned an empty response.");

  return {
    text,
    provider: "Google AI",
    providerId: "google",
    model: data?.model || model,
    requestId: id
  };
}

export async function callProvider(
  provider,
  {
    system,
    messages,
    maxOutputTokens = 4096,
    timeoutMs = 28_000
  }
) {
  if (!providerAvailable(provider)) {
    throw Object.assign(new Error(provider + " is unavailable."), {
      provider,
      unavailable: true
    });
  }

  try {
    let result;
    if (provider === "openai") {
      result = await callOpenAI({ system, messages, maxOutputTokens, timeoutMs });
    } else if (provider === "anthropic") {
      result = await callAnthropic({
        system,
        messages,
        maxOutputTokens,
        timeoutMs
      });
    } else if (provider === "google") {
      result = await callGoogle({ system, messages, maxOutputTokens, timeoutMs });
    } else {
      throw new Error("Unknown provider.");
    }

    markSuccess(provider);
    return result;
  } catch (error) {
    markFailure(provider);
    throw error;
  }
}
