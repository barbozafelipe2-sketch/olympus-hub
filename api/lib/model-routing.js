// Adapted from Zeus Proxy's domain/family selection. Provider adapters remain commercial.
import { OLYMPUS_ROLES } from "./commercial-routing-policy.js";

export function modelFamily({ provider, id, family } = {}) {
  const aliases = { google: "gemini", gemini: "gemini", "x-ai": "xai" };
  const value = family || (provider === "openrouter" ? String(id || "").split("/")[0] : provider);
  return aliases[value] || value;
}

export function requestDomain(text = "") {
  const value = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(ui|ux|visual|front.?end|layout|screen|interface|slides|presentation|apresentacao)\b/.test(value)) return "visual";
  if (/\b(code|codigo|backend|api|database|script|typescript|bug|debug|programacao)\b/.test(value)) return "engineering";
  return "content";
}

export function orderProviders(available, { role, domain = "content", excluded = [] } = {}) {
  const families = new Set(excluded.map(provider => modelFamily({ provider })));
  const preferences = role === "ceo" ? OLYMPUS_ROLES.ceo.providers
    : role === "director" ? OLYMPUS_ROLES.director.providers
    : role === "critic" ? ["anthropic", "google", "openai"]
    : domain === "visual" ? OLYMPUS_ROLES.visual.providers
    : domain === "engineering" ? OLYMPUS_ROLES.engineering.providers
    : ["anthropic", "google", "openai"];
  const rank = provider => {
    const index = preferences.indexOf(provider);
    return index < 0 ? preferences.length : index;
  };
  return [...available].filter(provider => !families.has(modelFamily({ provider })))
    .sort((a, b) => rank(a) - rank(b));
}
