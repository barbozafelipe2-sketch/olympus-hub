// One budget covers every outbound AI attempt, including capabilities and fallbacks.
export const CALL_CAPS = Object.freeze({ simple: 1, compound: 2, compound_plus: 3, turbo: 4 });
export const MAX_INPUT_CHARS = 24000;
export const MAX_OUTPUT_TOKENS = 4096;
export const REQUEST_TIMEOUT_MS = 75000;

export function excerpt(value = "", limit = 6000) {
  const text = String(value);
  if (text.length <= limit) return text;
  const marker = "\n[Excerpt truncated; do not claim full coverage.]\n";
  const half = Math.floor((limit - marker.length) / 2);
  return text.slice(0, half) + marker + text.slice(-half);
}

export function evidenceContext({ project = "", files = "", web = "" } = {}) {
  // Reserve room for each evidence source; a long checkpoint must not erase web/files.
  return [excerpt(files, 3000), excerpt(web, 2000), excerpt(project, 2500)]
    .filter(Boolean).join("\n\n");
}

export function redactSecrets(value = "") {
  return String(value)
    .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, "[REDACTED]")
    .replace(/\b(?:sk-[\w-]{16,}|gh[pousr]_[\w]{16,}|github_pat_[\w]{16,}|AIza[\w-]{20,})\b/g, "[REDACTED]")
    .replace(/\bBearer\s+[\w.~+/-]{12,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|password|secret|token|database[_-]?url)\s*["']?\s*[:=]\s*["']?)[^\s"',;}]+/gi, "$1[REDACTED]");
}

export function compactInput(system = "", messages = []) {
  const context = redactSecrets(system).slice(0, 8000);
  let remaining = MAX_INPUT_CHARS - context.length;
  const selected = [];
  for (const message of [...messages].reverse()) {
    if (!["user", "assistant"].includes(message.role) || remaining <= 0) continue;
    const raw = redactSecrets(message.content);
    const content = raw.length > remaining
      ? (raw.slice(0, Math.max(0, remaining - 30)) + "\n[Context excerpt truncated.]").slice(0, remaining)
      : raw;
    selected.unshift({ role: message.role, content });
    remaining -= content.length;
  }
  return { system: context, messages: selected };
}

export function decideGear(mode, messages) {
  const raw = [...messages].reverse().find(m => m.role === "user")?.content || "";
  const text = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const complex = /audit|security|architecture|production|legal|financial|medical|migration|database|rls|auditoria|seguranca|arquitetura|juridic|financeir|compare|relatorio completo/.test(text) || text.length > 1400;
  const creation = /create|generate|implement|fix|debug|refactor|business plan|crie|gere|implemente|corrija|plano de negocios|planilha|contrato/.test(text);
  if (mode === "zeus") return complex || creation ? "compound" : "simple";
  if (mode !== "olympus") throw new Error("Unsupported OlyHub mode.");
  const areas = [/frontend|interface|\bui\b/, /backend|\bapi\b/, /database|banco de dados|\bsql\b/, /deploy|infra|netlify|vercel/].filter(re => re.test(text)).length;
  return areas >= 2 && creation || /app completo|complete app|full app|launch package/.test(text) ? "turbo" : "compound_plus";
}

export function automaticOlympusEligible(messages) {
  const text = String([...messages].reverse().find(m => m.role === "user")?.content || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // A domain noun alone must not escalate a short question to a paid team.
  const substantive = text.length > 400 || /\b(audit|auditoria|due diligence|relatorio completo|full report|app completo|complete app|full app|launch package)\b/.test(text);
  return substantive && decideGear("zeus", messages) === "compound";
}

export function createBudget({ maxCalls, startedAt = Date.now(), timeoutMs = REQUEST_TIMEOUT_MS, authorizeAttempt = null } = {}) {
  if (!Number.isSafeInteger(maxCalls) || maxCalls < 1 || maxCalls > 6) throw new Error("Invalid execution call cap.");
  let callCap = maxCalls;
  const events = [];
  const deadline = startedAt + timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, deadline - Date.now()));
  timer.unref?.();
  return {
    get maxCalls() { return callCap; },
    set maxCalls(value) { if (!Number.isSafeInteger(value) || value < events.length || value > callCap) throw new Error("Execution cap can only narrow."); callCap = value; },
    events, signal: controller.signal,
    get calls() { return events.filter(e => e.outcome !== "blocked").length; },
    get slots() { return events.length; },
    remaining() { return Math.max(0, deadline - Date.now()); },
    canCall() { return events.length < callCap && deadline - Date.now() > 6000 && !controller.signal.aborted; },
    reserve(role, provider, model, inputChars = MAX_INPUT_CHARS, outputTokens = MAX_OUTPUT_TOKENS) {
      if (!this.canCall()) throw Object.assign(new Error("AI execution budget exhausted."), { code: "AI_BUDGET_EXHAUSTED", status: 503 });
      if (!Number.isSafeInteger(inputChars) || inputChars < 0 || inputChars > MAX_INPUT_CHARS || !Number.isSafeInteger(outputTokens) || outputTokens < 1 || outputTokens > MAX_OUTPUT_TOKENS) throw new Error("Invalid attempt token bounds.");
      const event = { attemptId: crypto.randomUUID(), inputChars, outputTokens, role, provider, providerId: provider, model, requestId: crypto.randomUUID(), outcome: "pending", usage: null,
        // A byte/character upper bound, not a fabricated measurement. Retained if usage is unknown.
        reservedTokens: Math.ceil(inputChars * 4) + outputTokens };
      events.push(event);
      return event;
    },
    async reserveAuthorized(role, provider, model, inputChars = MAX_INPUT_CHARS, outputTokens = MAX_OUTPUT_TOKENS, metadata = {}) {
      const event = this.reserve(role,provider,model,inputChars,outputTokens);
      Object.assign(event, { tier: metadata.tier, inputBytes: metadata.inputBytes ?? inputChars * 4 });
      try {
        if (typeof authorizeAttempt !== "function") throw Object.assign(new Error("Paid inference requires server authorization."), { code: "AI_AUTHORIZATION_REQUIRED", status: 503 });
        await authorizeAttempt(Object.freeze({ ...event }));
        if (controller.signal.aborted || deadline - Date.now() <= 5000) throw Object.assign(new Error("Execution authorization expired."), { code: "AI_AUTHORIZATION_EXPIRED", status: 503 });
        event.authorized = true; return event;
      } catch (error) {
        event.authorized = false; event.outcome = "blocked"; event.usage = { reported: true, totalTokens: 0 }; event.reservedTokens = 0; throw error;
      }
    },
    complete(event, result, error = null) {
      if (!events.includes(event) || event.outcome !== "pending") throw new Error("Invalid attempt completion.");
      event.outcome = error ? "failed" : "completed";
      event.requestId = result?.requestId || error?.requestId || event.requestId;
      event.model = result?.model || event.model;
      const usage = result?.usage || error?.usage || null;
      event.usage = usage?.reported === true && (!Number.isSafeInteger(usage.totalTokens) || usage.totalTokens < 0) ? null : usage;
      event.status = error?.status || null;
    },
    chargedTokens() { return events.reduce((n, e) => n + (e.usage?.reported === true ? e.usage.totalTokens : e.reservedTokens), 0); },
    close() { clearTimeout(timer); }
  };
}
