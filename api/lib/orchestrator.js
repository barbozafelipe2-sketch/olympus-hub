import {
  callProvider,
  configuredProviders,
  providerAvailable
} from "./providers.js";

const MODE_SYSTEM = {
  openai:
    "You are the direct OpenAI route inside OlyHub. Answer the user directly and accurately.",
  claude:
    "You are the direct Claude route inside OlyHub. Answer the user directly and accurately.",
  google:
    "You are the direct Google AI route inside OlyHub. Answer the user directly and accurately.",
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

async function withOpenAIFallback(provider, args, role) {
  try {
    const result = await callProvider(provider, args);
    return {
      result,
      trace: [traceEntry(result, role)],
      fallbackUsed: false
    };
  } catch (primaryError) {
    if (provider === "openai" || !providerAvailable("openai")) {
      throw primaryError;
    }

    const fallback = await callProvider("openai", args);
    return {
      result: fallback,
      trace: [traceEntry(fallback, role, provider)],
      fallbackUsed: true
    };
  }
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
  if (available.length === 0) return ["openai"];

  const preferred = ["openai", "anthropic", "google"].filter((provider) =>
    available.includes(provider)
  );
  const selected = [];

  for (let i = 0; i < count; i += 1) {
    selected.push(preferred[i % preferred.length]);
  }

  return selected;
}

async function executeDirect(mode, systemContext, messages) {
  const requested =
    mode === "claude" ? "anthropic" : mode === "google" ? "google" : "openai";

  const call = await withOpenAIFallback(
    requested,
    {
      system: MODE_SYSTEM[mode] + systemContext,
      messages,
      maxOutputTokens: 4096,
      timeoutMs: 30_000
    },
    "direct"
  );

  return {
    reply: call.result.text,
    provider: call.result.provider,
    model: call.result.model,
    requestId: call.result.requestId,
    fallbackUsed: call.fallbackUsed,
    trace: call.trace,
    usage: aggregateUsage(call.trace),
    orchestration: {
      mode,
      calls: call.trace.length,
      multiProvider: false,
      degraded: call.fallbackUsed
    }
  };
}

async function executeZeus(systemContext, messages) {
  const leadProvider = chooseZeusProvider(messages);
  const leadCall = await withOpenAIFallback(
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
    const critique = await callProvider(reviewer, {
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
    });
    trace.push(traceEntry(critique, "reviewer"));

    const integrationProvider = providerAvailable("openai")
      ? "openai"
      : leadCall.result.providerId;

    const integrated = await callProvider(integrationProvider, {
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
    });
    trace.push(traceEntry(integrated, "director"));

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
  const roles = [
    "Lead specialist: solve the request completely and concretely.",
    "Critical specialist: independently solve it, challenge assumptions, and hunt for failure modes.",
    "Implementation specialist: focus on feasibility, edge cases, UX, cost, and what would actually work."
  ];

  const settled = await Promise.allSettled(
    providers.map((provider, index) =>
      withOpenAIFallback(
        provider,
        {
          system: MODE_SYSTEM.olympus + systemContext + "\n\n" + roles[index],
          messages,
          maxOutputTokens: 3200,
          timeoutMs: 27_000
        },
        "specialist-" + (index + 1)
      )
    )
  );

  const successful = settled
    .filter((item) => item.status === "fulfilled")
    .map((item) => item.value);

  if (successful.length === 0) {
    throw new Error("No Olympus specialist completed successfully.");
  }

  const trace = successful.flatMap((item) => item.trace);
  let fallbackUsed = successful.some((item) => item.fallbackUsed);
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
    const critic = await callProvider(criticProvider, {
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
    });
    critiqueText = critic.text;
    trace.push(traceEntry(critic, "critic"));
  } catch {
    critiqueText = "Critic unavailable. Director must reconcile candidates directly.";
  }

  const directorProvider = providerAvailable("openai")
    ? "openai"
    : successful[0].result.providerId;

  const director = await callProvider(directorProvider, {
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
  });
  trace.push(traceEntry(director, "director"));

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
      degraded: successful.length < specialistCount
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

  return executeDirect(mode, systemContext, messages);
}
