import {
  callProvider,
  configuredProviders,
  providerAvailable
} from "./providers.js";

const MODE_SYSTEM = {
  zeus:
    "You are Zeus, OlyHub's daily orchestration layer. Produce one decisive, useful answer. Never invent tool use, provider use, or file access.",
  olympus:
    "You are participating in OlyHub Olympus. Work independently, expose assumptions, and optimize for a strong final synthesis."
};

function lastUser(messages) {
  return [...messages].reverse().find((message) => message.role === "user")?.content || "";
}

function traceEntry(result, role, fallbackFrom = null) {
  return {
    role,
    provider: result.provider,
    providerId: result.providerId,
    model: result.model,
    requestId: result.requestId,
    fallbackFrom,
    usage: result.usage
  };
}

function aggregateUsage(trace) {
  return trace.reduce(
    (total, entry) => {
      const usage = entry.usage || {};
      total.inputTokens += usage.inputTokens || 0;
      total.outputTokens += usage.outputTokens || 0;
      total.cachedInputTokens += usage.cachedInputTokens || 0;
      total.cacheWriteTokens += usage.cacheWriteTokens || 0;
      total.reasoningTokens += usage.reasoningTokens || 0;
      total.toolTokens += usage.toolTokens || 0;
      total.totalTokens += usage.totalTokens || 0;
      return total;
    },
    {
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      toolTokens: 0,
      totalTokens: 0
    }
  );
}

async function withProviderFallback(provider, args, role, { excludeProviders = [] } = {}) {
  const excluded = new Set(excludeProviders);
  const candidates = [
    provider,
    ...configuredProviders().filter(
      (candidate) => candidate !== provider && !excluded.has(candidate)
    )
  ].filter((candidate, index, list) => list.indexOf(candidate) === index);
  const failed = [];

  for (const candidate of candidates) {
    try {
      const result = await callProvider(candidate, args);
      return {
        result,
        trace: [traceEntry(result, role, failed.length ? failed.join(" -> ") : null)],
        fallbackUsed: failed.length > 0,
        attemptedProviders: [...failed, candidate]
      };
    } catch {
      failed.push(candidate);
    }
  }

  throw Object.assign(
    new Error("No configured AI provider completed successfully."),
    { attemptedProviders: failed }
  );
}

function chooseZeusProvider(messages) {
  const text = lastUser(messages).toLowerCase();
  const available = configuredProviders();

  if (
    available.includes("anthropic") &&
    /(rewrite|writing|story|copy|tone|essay|document|proposal|speech)/.test(text)
  ) {
    return "anthropic";
  }

  if (
    available.includes("google") &&
    /(image|visual|video|audio|multimodal|diagram|photo|pdf)/.test(text)
  ) {
    return "google";
  }

  if (available.includes("openai")) return "openai";
  return available[0] || "openai";
}

function needsReview(messages) {
  const text = lastUser(messages);
  return (
    text.length > 1400 ||
    /(audit|security|architecture|production|legal|financial|medical|compare|decision|strategy|migration|deploy|database|rls)/i.test(
      text
    )
  );
}

function reviewerProvider(leadProviderId) {
  const available = configuredProviders().filter(
    (provider) => provider !== leadProviderId
  );
  return available[0] || null;
}

function heavyOlympus(messages) {
  const text = lastUser(messages);
  return (
    text.length > 1800 ||
    /(audit|architecture|security|strategy|business plan|migration|production|system design|compare)/i.test(
      text
    )
  );
}

function pickSpecialistProviders(count) {
  const available = configuredProviders();
  const preferred = ["openai", "anthropic", "google"].filter((provider) =>
    available.includes(provider)
  );
  return preferred.slice(0, count);
}

async function executeZeus(systemContext, messages) {
  const leadProvider = chooseZeusProvider(messages);
  const leadCall = await withProviderFallback(
    leadProvider,
    {
      system: MODE_SYSTEM.zeus + systemContext,
      messages,
      maxOutputTokens: 4096,
      timeoutMs: 28_000
    },
    "lead"
  );

  let trace = [...leadCall.trace];
  let fallbackUsed = leadCall.fallbackUsed;
  const reviewer = needsReview(messages)
    ? reviewerProvider(leadCall.result.providerId)
    : null;

  if (!reviewer) {
    return {
      reply: leadCall.result.text,
      provider: leadCall.result.provider,
      model: leadCall.result.model,
      requestId: leadCall.result.requestId,
      fallbackUsed,
      trace,
      usage: aggregateUsage(trace),
      orchestration: {
        mode: "zeus",
        calls: trace.length,
        multiProvider: false,
        degraded: false
      }
    };
  }

  try {
    const critiqueCall = await withProviderFallback(
      reviewer,
      {
        system:
          "You are the single Zeus reviewer. You see only the user's latest request and the lead candidate. Identify material factual, logical, security, UX, cost, or requirement failures. Be concise; do not rewrite the whole answer.",
        messages: [
          {
            role: "user",
            content:
              "USER REQUEST:\n" +
              lastUser(messages) +
              "\n\nLEAD CANDIDATE:\n" +
              leadCall.result.text
          }
        ],
        maxOutputTokens: 1400,
        timeoutMs: 20_000
      },
      "reviewer",
      { excludeProviders: [leadCall.result.providerId] }
    );
    const critique = critiqueCall.result;
    trace.push(...critiqueCall.trace);
    fallbackUsed ||= critiqueCall.fallbackUsed;

    const integrationProvider = providerAvailable("openai")
      ? "openai"
      : leadCall.result.providerId;

    const integrationCall = await withProviderFallback(
      integrationProvider,
      {
        system:
          "You are Zeus Director. Return one final answer. Preserve the lead's useful work, fix only valid reviewer findings, and never mention this internal review unless the user asks.",
        messages: [
          {
            role: "user",
            content:
              "USER REQUEST:\n" +
              lastUser(messages) +
              "\n\nLEAD:\n" +
              leadCall.result.text +
              "\n\nREVIEW:\n" +
              critique.text
          }
        ],
        maxOutputTokens: 4096,
        timeoutMs: 25_000
      },
      "director"
    );
    const integrated = integrationCall.result;
    trace.push(...integrationCall.trace);
    fallbackUsed ||= integrationCall.fallbackUsed;

    return {
      reply: integrated.text,
      provider: integrated.provider,
      model: integrated.model,
      requestId: integrated.requestId,
      fallbackUsed,
      trace,
      usage: aggregateUsage(trace),
      orchestration: {
        mode: "zeus",
        calls: trace.length,
        multiProvider: new Set(trace.map((item) => item.providerId)).size > 1,
        degraded: false
      }
    };
  } catch (reviewError) {
    return {
      reply: leadCall.result.text,
      provider: leadCall.result.provider,
      model: leadCall.result.model,
      requestId: leadCall.result.requestId,
      fallbackUsed,
      trace,
      usage: aggregateUsage(trace),
      orchestration: {
        mode: "zeus",
        calls: trace.length,
        multiProvider: false,
        degraded: true
      }
    };
  }
}

async function executeOlympus(systemContext, messages) {
  const specialistCount = heavyOlympus(messages) ? 3 : 2;
  const providers = pickSpecialistProviders(specialistCount);

  if (providers.length < 2) {
    const singleRoute = await executeZeus(systemContext, messages);
    return {
      ...singleRoute,
      orchestration: {
        ...singleRoute.orchestration,
        mode: "olympus",
        degraded: true
      }
    };
  }

  const roles = [
    "Lead specialist: solve the request completely and concretely.",
    "Critical specialist: independently solve it, challenge assumptions, and hunt for failure modes.",
    "Implementation specialist: focus on feasibility, edge cases, UX, cost, and what would actually work."
  ];

  const settled = await Promise.allSettled(
    providers.map(async (provider, index) => {
      const result = await callProvider(provider, {
        system: MODE_SYSTEM.olympus + systemContext + "\n\n" + roles[index],
        messages,
        maxOutputTokens: 3200,
        timeoutMs: 27_000
      });
      return {
        result,
        trace: [traceEntry(result, "specialist-" + (index + 1))],
        fallbackUsed: false
      };
    })
  );

  const successful = settled
    .filter((item) => item.status === "fulfilled")
    .map((item) => item.value);

  const trace = successful.flatMap((item) => item.trace);
  let fallbackUsed = successful.some((item) => item.fallbackUsed);
  const specialistProviderCount = new Set(
    successful.map((item) => item.result.providerId)
  ).size;

  if (specialistProviderCount < 2) {
    const singleRoute = await executeZeus(systemContext, messages);
    return {
      ...singleRoute,
      orchestration: {
        ...singleRoute.orchestration,
        mode: "olympus",
        degraded: true
      }
    };
  }
  const candidateText = successful
    .map(
      (item, index) =>
        "SPECIALIST " + (index + 1) + ":\n" + item.result.text
    )
    .join("\n\n---\n\n");

  let critiqueText = "";
  const criticProvider =
    reviewerProvider(successful[0].result.providerId) ||
    (providerAvailable("openai") ? "openai" : successful[0].result.providerId);

  try {
    const criticCall = await withProviderFallback(
      criticProvider,
      {
        system:
          "You are the one focused Olympus critic. Compare the specialist outputs against the user's request. Identify disagreements, missing requirements, factual risks, and the strongest pieces to preserve. Do not produce the final answer.",
        messages: [
          {
            role: "user",
            content:
              "USER REQUEST:\n" +
              lastUser(messages) +
              "\n\nCANDIDATES:\n" +
              candidateText
          }
        ],
        maxOutputTokens: 1800,
        timeoutMs: 20_000
      },
      "critic"
    );
    critiqueText = criticCall.result.text;
    trace.push(...criticCall.trace);
    fallbackUsed ||= criticCall.fallbackUsed;
  } catch {
    critiqueText = "Critic unavailable. Director must reconcile candidates directly.";
  }

  const directorProvider = providerAvailable("openai")
    ? "openai"
    : successful[0].result.providerId;

  let directorCall;
  try {
    directorCall = await withProviderFallback(
      directorProvider,
      {
        system:
          "You are Olympus Director. Integrate the specialist work into one coherent final answer. Resolve disagreements using evidence and requirements, remove repetition, and never expose hidden chain-of-thought. You may say the answer was synthesized by Olympus, but only describe providers that appear in the supplied trace.",
        messages: [
          {
            role: "user",
            content:
              "USER REQUEST:\n" +
              lastUser(messages) +
              "\n\nSPECIALIST OUTPUTS:\n" +
              candidateText +
              "\n\nCRITIC:\n" +
              critiqueText
          }
        ],
        maxOutputTokens: 5200,
        timeoutMs: 28_000
      },
      "director"
    );
  } catch {
    const best = successful[0];
    return {
      reply: best.result.text,
      provider: best.result.provider,
      model: best.result.model,
      requestId: best.result.requestId,
      fallbackUsed,
      trace,
      usage: aggregateUsage(trace),
      orchestration: {
        mode: "olympus",
        calls: trace.length,
        multiProvider: specialistProviderCount > 1,
        degraded: true
      }
    };
  }
  const director = directorCall.result;
  trace.push(...directorCall.trace);
  fallbackUsed ||= directorCall.fallbackUsed;

  return {
    reply: director.text,
    provider: director.provider,
    model: director.model,
    requestId: director.requestId,
    fallbackUsed,
    trace,
    usage: aggregateUsage(trace),
    orchestration: {
      mode: "olympus",
      calls: trace.length,
      multiProvider: new Set(trace.map((item) => item.providerId)).size > 1,
      degraded:
        successful.length < specialistCount ||
        providers.length < specialistCount ||
        specialistProviderCount < 2
    }
  };
}

export async function executeMode({ mode, systemContext, messages }) {
  if (mode === "zeus") {
    return executeZeus(systemContext, messages);
  }

  if (mode === "olympus") {
    return executeOlympus(systemContext, messages);
  }

  throw new Error("Unsupported OlyHub mode.");
}
