import { assertModelAttempt, authorizationFailure } from './execution-policy.js';
export { authorizationFailure };
function denied(reason, unavailable = false) {
  return Object.assign(new Error(unavailable ? 'Execution authorization is unavailable.' : 'This execution is not authorized.'), {
    code: unavailable ? 'AI_AUTHORIZATION_UNAVAILABLE' : 'AI_AUTHORIZATION_DENIED', status: unavailable ? 503 : 403, reason
  });
}
export function createExecutionAuthorization({ client, ownerId, requestId, quota, requestedMode, isImage, hasWeb }) {
  const policy = quota?.authorizationPolicy;
  if (quota?.allowed !== true || !policy || !Number.isInteger(policy.maxLevel) || policy.maxLevel < 1 || policy.maxLevel > 4
    || !Array.isArray(policy.allowedTiers) || !policy.allowedTiers.length || policy.allowedTiers.some(t => !['economy','premium'].includes(t))
    || typeof policy.allowImage !== 'boolean' || typeof policy.allowWeb !== 'boolean') throw denied('admission_policy_missing',true);
  if (requestedMode === "olympus" && policy.maxLevel < 3) throw denied("plan_level_not_allowed");
  const admittedPolicy = structuredClone(policy);
  let mode = requestedMode, phase = isImage ? 'unbound_image' : 'router', catalog = [], route = null;
  const rpc = async (name, values) => {
    let result;
    try { result = await client.rpc(name, { p_owner_id: ownerId, p_request_id: requestId, ...values }); }
    catch { throw denied('authorization_storage_unavailable',true); }
    if (result.error || !result.data || typeof result.data.allowed !== 'boolean') throw denied('authorization_storage_unavailable',true);
    if (!result.data.allowed) throw denied(result.data.reason || 'authorization_denied');
    return result.data;
  };
  return {
    filterCatalog(models) { catalog = structuredClone(models.filter(m => admittedPolicy.allowedTiers.includes(m.tier))); return structuredClone(catalog); },
    async bindExecution(plan, maxCalls) {
      if (phase !== 'router') throw denied('invalid_execution_phase');
      if (plan.level > admittedPolicy.maxLevel) throw denied('plan_level_not_allowed');
      await rpc('bind_ai_execution', { p_mode: plan.mode, p_level: plan.level, p_max_calls: maxCalls });
      route = structuredClone(plan); mode = plan.mode; phase = 'execution';
    },
    async bindImage() {
      if (!isImage || phase !== 'unbound_image' || !admittedPolicy.allowImage) throw denied('image_not_allowed');
      await rpc('bind_ai_execution', { p_mode: 'zeus', p_level: 2, p_max_calls: 1 });
      mode = 'zeus'; phase = 'image';
    },
    async authorizeAttempt(event) {
      try {
        if (event.role === 'capability:generate_image') {
          const expected = (process.env.OPENAI_IMAGE_ROUTER_MODEL || 'gpt-5.5') + ' + ' + (process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-flare');
          if (phase !== 'image' || event.provider !== 'openai' || event.model !== expected || event.tier !== 'capability') throw Error('image_model_not_allowed');
        } else if (event.role === 'capability:web_search') {
          if (phase !== 'execution' || !hasWeb || !admittedPolicy.allowWeb || event.provider !== 'openai' || event.model !== (process.env.OPENAI_WEB_SEARCH_MODEL || 'gpt-5.5') || event.tier !== 'capability') throw Error('web_model_not_allowed');
        } else {
          if ((event.role === 'router') !== (phase === 'router')) throw Error('role_not_allowed');
          const model = catalog.find(m => m.provider === event.provider && m.model === event.model && m.tier === event.tier);
          if (!model || !admittedPolicy.allowedTiers.includes(event.tier)) throw Error('model_not_allowed');
          assertModelAttempt(model,event,route);
        }
      } catch (error) { throw denied(error.message); }
      const result = await rpc('authorize_ai_attempt', { p_event: { attemptId: event.attemptId, role: event.role, provider: event.provider,
        model: event.model, tier: event.tier, mode, inputChars: event.inputChars, outputTokens: event.outputTokens } });
      if (result.attemptId !== event.attemptId) throw denied('authorization_receipt_mismatch',true);
      // A slow permit RPC must not extend a quote beyond its local validity window.
      if (!event.role.startsWith('capability:')) {
        try { assertModelAttempt(catalog.find(m=>m.provider===event.provider && m.model===event.model && m.tier===event.tier),event,route); }
        catch (error) { throw denied(error.message); }
      }
    }
  };
}
