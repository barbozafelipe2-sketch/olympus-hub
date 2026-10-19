import OpenAI, { toFile } from 'openai';
import { GoogleGenAI } from '@google/genai';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

export const IMAGE_LEVEL = 2;
export const env = key => process.env[key] || '';
const fail = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
export const modelIdentity = (provider, model) => String(model || '').toLowerCase().replace(/^(?:openai|google|gemini)\//, '');

export function imageRoutes() {
  let configured;
  try { configured = JSON.parse(env('IMAGE_WORKFLOW_MODELS_JSON') || 'null'); }
  catch { throw fail('IMAGE_CONFIGURATION_INVALID', 'Image model configuration is invalid.', 503); }
  const fallback = [
    { provider: 'openrouter', model: env('OPENROUTER_IMAGE_MODEL') },
    { provider: 'openai', model: env('OPENAI_IMAGE_MODEL') },
    { provider: 'gemini', model: env('GEMINI_IMAGE_MODEL') }
  ];
  const list = Array.isArray(configured) ? configured : fallback;
  return list.filter(r => r && ['openai', 'gemini', 'openrouter'].includes(r.provider) && typeof r.model === 'string' && r.model.length > 0 && r.model.length <= 160)
    .filter(r => r.provider === 'gemini' ? (env('GEMINI_API_KEY') || env('GOOGLE_AI_API_KEY'))
      : env(r.provider === 'openai' ? 'OPENAI_API_KEY' : 'OPENROUTER_API_KEY'))
    .map(r => ({ provider: r.provider, model: r.model, supportsReferences: r.supportsReferences !== false,
      estimatedUsd: typeof r.estimatedUsd === 'number' && Number.isFinite(r.estimatedUsd) && r.estimatedUsd >= 0 ? r.estimatedUsd : null }));
}

function secret() {
  const key = env('IMAGE_WORKFLOW_QUOTE_SECRET') || env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
  if (key.length < 24) throw fail('IMAGE_QUOTE_NOT_CONFIGURED', 'Secure image action confirmation is not configured.', 503);
  return key;
}

export function createImageQuote({ ownerId, operation, sources = [], instructions = '', prompt = '', conversationId = null, projectId = null }, routes = imageRoutes()) {
  if (!['generate', 'compare', 'combine'].includes(operation)) throw fail('IMAGE_ACTION_INVALID', 'Unknown image action.');
  if (sources.length !== (operation === 'generate' ? 0 : operation === 'compare' ? 1 : 2)) throw fail('IMAGE_SOURCES_INVALID', 'Select the required images.');
  if (sources.some(s => s.ownerId !== ownerId || !/^image\/(png|jpeg|webp)$/.test(s.mimeType))) throw fail('IMAGE_SOURCE_DENIED', 'Image source unavailable.', 403);
  const first = sources[0];
  const groupId = first?.groupId || first?.id || randomUUID();
  if (operation === 'combine' && (sources[0].id === sources[1].id || sources.some(s => (s.groupId || s.id) !== groupId || s.conversationId !== first.conversationId || s.projectId !== first.projectId)))
    throw fail('IMAGE_GROUP_MISMATCH', 'Combine two versions from the same image group.');
  const originalPrompt = String(first?.prompt || prompt || '').trim().slice(0, 12000);
  if (!originalPrompt) throw fail('IMAGE_PROMPT_MISSING', 'The original image prompt is unavailable.');
  const route = routes.find(r => operation !== 'compare' || modelIdentity(r.provider, r.model) !== modelIdentity(first.provider, first.model));
  const selected = operation === 'combine' ? routes.find(r => r.supportsReferences) : route;
  if (!selected) throw fail('IMAGE_MODEL_UNAVAILABLE', operation === 'compare' ? 'Configure a different image model to use Comparison.' : 'Configure an image model that accepts two image references.', 503);
  if(!Number.isFinite(selected.estimatedUsd)||selected.estimatedUsd<=0)throw fail('IMAGE_PRICE_UNAVAILABLE','Image pricing is not configured.',503);
  if (operation === 'combine' && !String(instructions).trim()) throw fail('IMAGE_COMBINE_INSTRUCTIONS', 'Describe what to keep from each image.');
  const payload = { version: 1, ownerId, operation, sourceIds: sources.map(s => s.id), groupId,
    originalPrompt, instructions: String(instructions).trim().slice(0, 2000), route: selected,
    conversationId: first?.conversationId || conversationId, projectId: first?.projectId || projectId,
    requestId: randomUUID(), expiresAt: Date.now() + 10 * 60000, level: IMAGE_LEVEL };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret()).update(encoded).digest('base64url');
  return { token: encoded + '.' + signature, operation, model: selected.model, provider: selected.provider,
    estimatedUsd: selected.estimatedUsd, costLabel: selected.estimatedUsd == null ? 'Cost unavailable — this action may incur charges.' : `Estimated $${selected.estimatedUsd.toFixed(4)}; actual provider charges may differ.`,
    expiresAt: payload.expiresAt, level: IMAGE_LEVEL, calls: 1 };
}

export function verifyImageQuote(token, ownerId, routes = imageRoutes()) {
  if (typeof token !== 'string' || token.length > 24000) throw fail('IMAGE_QUOTE_INVALID', 'Invalid image confirmation.');
  const [encoded, supplied, extra] = token.split('.');
  const expected = createHmac('sha256', secret()).update(encoded || '').digest('base64url');
  if (extra || !supplied || supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw fail('IMAGE_QUOTE_INVALID', 'Invalid image confirmation.', 403);
  let payload; try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()); } catch { throw fail('IMAGE_QUOTE_INVALID', 'Invalid image confirmation.'); }
  if (payload.ownerId !== ownerId) throw fail('IMAGE_SOURCE_DENIED', 'Image action belongs to another account.', 403);
  if (payload.expiresAt < Date.now()) throw fail('IMAGE_QUOTE_EXPIRED', 'Refresh the estimate before generating.', 409);
  const current = routes.find(r => r.provider === payload.route.provider && r.model === payload.route.model && r.estimatedUsd === payload.route.estimatedUsd && (payload.operation !== 'combine' || r.supportsReferences));
  if (!current) throw fail('IMAGE_QUOTE_CHANGED', 'Image availability or price changed. Refresh the estimate.', 409);
  return payload;
}

export async function generateWorkflowImage({ route, prompt, references = [], signal, clients = null }) {
  if (references.length !== 0 && references.length !== 2) throw fail('IMAGE_REFERENCES_INVALID', 'Combine requires two actual images.');
  if (references.some(r => r.bytes.byteLength > 8 * 1024 * 1024)) throw fail('IMAGE_TOO_LARGE', 'Use image references under 8 MB.', 413);
  let bytes, mimeType = 'image/png', usage = null;
  if (route.provider === 'gemini') {
    const client = clients?.gemini || new GoogleGenAI({apiKey:env('GEMINI_API_KEY') || env('GOOGLE_AI_API_KEY')});
    const parts = [{ text: prompt }, ...references.map(r => ({ inlineData: { mimeType: r.mimeType, data: Buffer.from(r.bytes).toString('base64') } }))];
    const result = await client.models.generateContent({ model: route.model, contents: [{ role: 'user', parts }], config: { responseModalities: ['TEXT', 'IMAGE'], maxOutputTokens:4096, httpOptions: { abortSignal: signal } } });
    const data = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData;
    if (data) { bytes = Buffer.from(data.data, 'base64'); mimeType = data.mimeType; }
    usage = result.usageMetadata || null;
  } else {
    const router = route.provider === 'openrouter';
    const client = clients?.[route.provider] || (router ? new OpenAI({ apiKey: env('OPENROUTER_API_KEY'), baseURL: env('OPENROUTER_BASE_URL') || 'https://openrouter.ai/api/v1', maxRetries: 0 }) : new OpenAI({ apiKey:env('OPENAI_API_KEY'),maxRetries: 0 }));
    if (router) {
      const content = [{ type: 'text', text: prompt }, ...references.map(r => ({ type: 'image_url', image_url: { url: `data:${r.mimeType};base64,${Buffer.from(r.bytes).toString('base64')}` } }))];
      const result = await client.chat.completions.create({ model: route.model, modalities: ['image', 'text'],max_tokens:4096,provider:{allow_fallbacks:false}, messages: [{ role: 'user', content }] }, { signal, maxRetries: 0 });
      const url = result.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(url || '');
      if (match) { mimeType = match[1]; bytes = Buffer.from(match[2], 'base64'); }
      usage = result.usage || null;
    } else {
      const result = references.length
        ? await client.images.edit({ model: route.model, prompt, n: 1, image: await Promise.all(references.map((r,i) => toFile(Buffer.from(r.bytes), `reference-${i}.png`, { type: r.mimeType }))) }, { signal, maxRetries: 0 })
        : await client.images.generate({ model: route.model, prompt, n: 1 }, { signal, maxRetries: 0 });
      if (result.data?.[0]?.b64_json) bytes = Buffer.from(result.data[0].b64_json, 'base64');
      usage = result.usage || null;
    }
  }
  if (!bytes?.length || bytes.length > 8 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) throw fail('IMAGE_OUTPUT_INVALID', 'The model did not return a supported image.', 502);
  return { bytes, mimeType, model: route.model, provider: route.provider, usage };
}

export function workflowPrompt(payload) {
  return payload.operation === 'combine'
    ? `Create a new interpretation using BOTH supplied image references. Preserve the originals. Original request: ${payload.originalPrompt}\nOwner instructions: ${payload.instructions}\nDo not promise an exact pixel-level merge.`
    : payload.originalPrompt;
}
