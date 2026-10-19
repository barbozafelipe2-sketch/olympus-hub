import { estimateCost } from './model-pricing.js';
const complexity = ['simple','moderate','complex'];
export function modelCanExecute(model, route, domain = route.domain) {
  return model.domains?.includes(domain) && complexity.indexOf(model.maxComplexity) >= complexity.indexOf(route.complexity)
    && complexity.includes(route.complexity) && complexity.includes(model.maxComplexity)
    && (model.maxOutputTokens || model.price?.maxOutputTokens || 4096) >= 4096;
}
export function stageDomain(route, role) {
  return role === 'specialist-2' ? route.domain === 'visual' ? 'engineering' : 'visual' : route.domain;
}
export function assertModelAttempt(model, event, route = null) {
  if (!Number.isFinite(estimateCost(model?.price))) throw Error('model_price_expired');
  const context = model.contextLength || model.price.contextLength;
  if (!Number.isSafeInteger(context) || context < event.inputBytes + event.outputTokens + 1024) throw Error('model_context_exceeded');
  const maxOutput = model.maxOutputTokens || model.price.maxOutputTokens;
  if (maxOutput && event.outputTokens > maxOutput) throw Error('model_output_exceeded');
  if (event.role === 'router') { if (event.outputTokens > 320) throw Error('router_output_exceeded'); }
  else if (!route || !modelCanExecute(model, route, stageDomain(route,event.role))) throw Error('model_capability_denied');
}
export const authorizationFailure = error => String(error?.code || '').startsWith('AI_AUTHORIZATION_');
