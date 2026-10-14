/**
 * OlyHub commercial orchestration policy — Phase 1/5.
 * Pure policy: no network calls, keys, billing operations, or UI side effects.
 * The executor must validate provider availability and model capability at runtime.
 */
export const OLYMPUS_ROLES = Object.freeze({
  visual: Object.freeze({
    label: "Visual Specialist",
    providers: Object.freeze(["meta", "kimi", "google", "deepseek"]),
    instruction: "Design usable, polished, responsive UI. Provide implementable component and accessibility requirements."
  }),
  engineering: Object.freeze({
    label: "Engineering Specialist",
    providers: Object.freeze(["anthropic", "qwen", "openai", "xai"]),
    instruction: "Implement and validate code, integrations, security boundaries, and tests. Never claim unexecuted tests passed."
  }),
  director: Object.freeze({
    label: "Director",
    providers: Object.freeze(["openai", "qwen", "deepseek", "anthropic"]),
    instruction: "Integrate both specialists' work. Independently find and FIX UI, architecture, and coding defects; return concrete corrected output, not critique alone."
  }),
  ceo: Object.freeze({
    label: "CEO",
    providers: Object.freeze(["xai", "openai", "anthropic", "qwen"]),
    instruction: "Challenge the Director independently against original requirements. FIX remaining UI and code defects when possible. Approve only evidence-backed results; otherwise clearly mark needs_revision."
  })
});

export const COMMERCIAL_DISPLAY_NAMES = Object.freeze({
  meta: "Meta", kimi: "Kimi", google: "Gemini", deepseek: "DeepSeek",
  anthropic: "Claude", qwen: "Qwen", openai: "OpenAI", xai: "Grok"
});

export function publicProviderName(providerId) {
  return COMMERCIAL_DISPLAY_NAMES[providerId] || "AI specialist";
}

export function selectOlympusTeam(availableProviders, { visualTask = false } = {}) {
  const available = new Set(availableProviders);
  const chosen = new Set();
  const selected = {};
  const roles = [
    visualTask ? "visual" : "engineering",
    visualTask ? "engineering" : "visual",
    "director",
    "ceo"
  ];
  for (const role of roles) {
    const candidates = OLYMPUS_ROLES[role].providers.filter((provider) => available.has(provider));
    const independent = candidates.find((provider) => !chosen.has(provider));
    const provider = independent || candidates[0] || null;
    selected[role] = provider;
    if (provider) chosen.add(provider);
  }
  return {
    roles: selected,
    distinctFamilies: new Set(Object.values(selected).filter(Boolean)).size,
    complete: Object.values(selected).every(Boolean),
    degraded: Object.values(selected).some((provider) => !provider) ||
      new Set(Object.values(selected).filter(Boolean)).size < 4
  };
}

/**
 * Zero-token decision policy. Olympus is opt-in per request in manual mode.
 * An automatic upgrade is allowed only for a subscribed user with sufficient
 * allowance and a qualifying request. No client-side setting grants entitlement.
 */
export function decideCommercialEngine({
  activation = "automatic",
  manualOlympus = false,
  olympusEntitled = false,
  allowanceAvailable = true,
  complexity = "simple",
  needsReview = false
} = {}) {
  const wantsOlympus = activation === "manual"
    ? manualOlympus
    : complexity === "complex";
  if (wantsOlympus && olympusEntitled && allowanceAvailable) {
    return { engine: "olympus", level: null, reason: activation === "manual" ? "manual" : "complexity" };
  }
  return {
    engine: "zeus",
    level: needsReview || complexity !== "simple" ? 2 : 1,
    reason: wantsOlympus ? "olympus_not_authorized_or_available" : "economical"
  };
}
