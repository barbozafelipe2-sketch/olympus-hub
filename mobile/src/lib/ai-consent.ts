export const AI_PROVIDER_CONSENT_VERSION = "2026-10-01-v1";

function consentKey(userId: string) {
  return `olyhub.ai-provider-consent.${AI_PROVIDER_CONSENT_VERSION}.${userId}`;
}

export function hasAiProviderConsent(userId: string) {
  const acceptedAt = localStorage.getItem(consentKey(userId));
  return Boolean(acceptedAt && Number.isFinite(Date.parse(acceptedAt)));
}

export function grantAiProviderConsent(userId: string) {
  localStorage.setItem(consentKey(userId), new Date().toISOString());
}

export function revokeAiProviderConsent(userId: string) {
  localStorage.removeItem(consentKey(userId));
}
