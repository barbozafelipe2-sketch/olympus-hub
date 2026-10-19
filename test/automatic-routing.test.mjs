import assert from 'node:assert/strict';
import { automaticOlympusEligible, decideGear } from '../api/lib/budget.js';
import { decideCommercialEngine } from '../api/lib/commercial-routing-policy.js';
const messages=content=>[{role:'user',content}];
assert.equal(automaticOlympusEligible(messages('O que é arquitetura?')),false);
assert.equal(automaticOlympusEligible(messages('Olá')),false);
assert.equal(automaticOlympusEligible(messages('Faça uma auditoria completa de segurança e arquitetura do backend')),true);
assert.equal(decideGear('zeus',messages('Corrija este bug')),'compound');
assert.equal(decideCommercialEngine({activation:'automatic',complexity:'complex',olympusEntitled:false}).engine,'zeus');
assert.equal(decideCommercialEngine({activation:'automatic',complexity:'complex',olympusEntitled:true,allowanceAvailable:false}).engine,'zeus');
assert.equal(decideCommercialEngine({activation:'automatic',complexity:'complex',olympusEntitled:true}).engine,'olympus');
assert.equal(decideCommercialEngine({activation:'manual',manualOlympus:false,complexity:'complex',olympusEntitled:true}).engine,'zeus');

// Exercise authorization and effective engine at the real API budget boundary.
import test from 'node:test';
import handler from '../api/chat.js';
test('budget rejection blocks classification regardless of automatic mode', async () => {
  const names=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY'];
  const saved=Object.fromEntries(names.map(k=>[k,process.env[k]]));
  const original=globalThis.fetch;
  Object.assign(process.env,{SUPABASE_URL:'https://auto.fixture',SUPABASE_PUBLISHABLE_KEY:'fixture',SUPABASE_SECRET_KEY:'server'});
  let entitled=false, accountReads=0, reservedMode=null;
  globalThis.fetch=async (url, init={})=>{
    const path=String(url);
    if(path.includes('/rest/v1/ai_budget_requests')||path.includes('/rest/v1/ai_response_cache'))return Response.json(null);
    if(path.includes('auth/v1/user')) return Response.json({id:'11111111-1111-4111-8111-111111111111',aud:'authenticated'});
    if(path.includes('account_limits')) {accountReads++;return Response.json({olympus_entitled:entitled});}
    if(path.includes('reserve_ai_budget')) {reservedMode=JSON.parse(init.body).p_limits.engine;return Response.json({allowed:false,reason:'budget_limit'});}
    throw new Error('Unexpected request: '+path);
  };
  const invoke=async (olympusAuto,mode='zeus',content='Faça uma auditoria completa de segurança e arquitetura')=>{
    const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
    await handler({method:'POST',headers:{authorization:'Bearer fixture'},body:{mode,olympusAuto,messages:messages(content)}},res);
    return res;
  };
  try {
    assert.equal((await invoke(false)).code,429);assert.equal(accountReads,0);assert.equal(reservedMode,'zeus');
    assert.equal((await invoke(true)).code,429);assert.equal(accountReads,0);assert.equal(reservedMode,'zeus');
    entitled=true;
    assert.equal((await invoke(true)).code,429);assert.equal(reservedMode,'zeus');
    assert.equal((await invoke(true,'zeus','Olá')).code,429);assert.equal(reservedMode,'zeus');
    assert.equal((await invoke(false,'olympus')).code,429);assert.equal(reservedMode,'olympus');
    assert.equal((await invoke('true')).code,400);
  } finally {globalThis.fetch=original;for(const [k,v] of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
