import test from 'node:test';import assert from 'node:assert/strict';
import handler from '../api/chat.js';import {__resetProviderHealthForTests} from '../api/lib/providers.js';import {__resetPricingForTests} from '../api/lib/model-pricing.js';
import {feedFixture} from './helpers/price-fixture.js';import {admissionPolicy} from './helpers/authorization-fixture.js';
test('API aborts paid inference on refused/revoked/unavailable authorization and ignores forged client privileges',async()=>{
 const names=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY','GOOGLE_AI_API_KEY','GEMINI_API_KEY'];
 const saved=Object.fromEntries(names.map(k=>[k,process.env[k]])),oldFetch=globalThis.fetch,owner='11111111-1111-4111-8111-111111111111';
 Object.assign(process.env,{SUPABASE_URL:'https://permit.fixture',SUPABASE_PUBLISHABLE_KEY:'fixture',SUPABASE_SECRET_KEY:'fixture',OPENAI_API_KEY:'fixture',ANTHROPIC_API_KEY:'fixture'});delete process.env.GOOGLE_AI_API_KEY;delete process.env.GEMINI_API_KEY;
 let deny=0,storageFailure=false,bindDeny=false,policy,paid,permits,settled,reserved;
 globalThis.fetch=async(url,init={})=>{
  const path=String(url),body=init.body?JSON.parse(init.body):null;
  if(path.includes('auth/v1/user'))return Response.json({id:owner,aud:'authenticated'});
  if(path.includes('reserve_ai_budget')){reserved=body;return Response.json({allowed:true,olympusEntitled:true,authorizationPolicy:policy});}
  if(path.includes('bind_ai_execution'))return Response.json(bindDeny?{allowed:false,reason:'plan_level_not_allowed'}:{allowed:true});
  if(path.includes('authorize_ai_attempt')){
   permits.push(body);assert.equal(body.p_owner_id,owner);
   if(storageFailure)return Response.json({message:'fixture outage'},{status:500});
   return Response.json(permits.length===deny?{allowed:false,reason:'account_not_active'}:{allowed:true,attemptId:body.p_event.attemptId});
  }
  if(path.includes('complete_ai_response'))return Response.json(JSON.parse(init.body).p_response);
  if(path.includes('settle_ai_budget')){settled=body;return Response.json(true);}
  if(path.includes('/rest/v1/'))return Response.json({id:crypto.randomUUID()},{status:201});
  if(path==='https://openrouter.ai/api/v1/models')return Response.json(feedFixture());
  if(path.includes('openai.com')||path.includes('anthropic.com')){
   const last=permits.at(-1);assert.ok(last,'paid fetch must follow a permit');assert.equal(last.p_event.model,body.model);paid.push(body.model);
   const router=(body.instructions||body.system||'').includes('Return ONLY JSON with domain');
   const text=router?JSON.stringify({domain:'engineering',taskType:'coding',complexity:'moderate',level:2,executorId:'anthropic:economy'}):'Fixture answer';
   return Response.json(path.includes('anthropic.com')?{content:[{type:'text',text}],usage:{input_tokens:5,output_tokens:5}}:{output:[{content:[{type:'output_text',text}]}],usage:{input_tokens:5,output_tokens:5,total_tokens:10}});
  }
  throw Error('Unexpected fixture request '+path);
 };
 const invoke=async(overrides={})=>{
  policy={...admissionPolicy(),...overrides};paid=[];permits=[];settled=null;__resetProviderHealthForTests();__resetPricingForTests();
  const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await handler({method:'POST',headers:{authorization:'Bearer fixture'},body:{mode:'zeus',olympusAuto:false,ownerId:crypto.randomUUID(),maxCalls:999,level:4,executor:'unapproved',authorizationPolicy:{maxLevel:4},messages:[{role:'user',content:'Oi'}]}},res);return res;
 };
 try{
  let r=await invoke();assert.equal(r.code,200);assert.equal(paid.length,3);assert.equal(reserved.p_limits.maxCalls,3);assert.equal(reserved.p_limits.allowOlympus,false);
  r=await invoke({maxLevel:1});assert.equal(r.code,403);assert.equal(paid.length,1);
  r=await invoke({allowedTiers:['economy']});assert.equal(r.code,200);assert.ok(paid.every(m=>!m.includes('gpt-5')&&!m.includes('sonnet')));
  deny=1;r=await invoke();assert.equal(r.code,403);assert.equal(paid.length,0);assert.equal(settled.p_charged_tokens,0);assert.equal(settled.p_trace[0].outcome,'blocked');
  deny=3;r=await invoke();assert.equal(r.code,403);assert.equal(paid.length,2);assert.equal(settled.p_trace.at(-1).outcome,'blocked');assert.equal(settled.p_charged_tokens,20);
  deny=0;storageFailure=true;r=await invoke();assert.equal(r.code,503);assert.equal(paid.length,0);assert.equal(settled.p_charged_tokens,0);
  storageFailure=false;bindDeny=true;r=await invoke();assert.equal(r.code,403);assert.equal(paid.length,1);assert.equal(settled.p_charged_tokens,10);
 }finally{globalThis.fetch=oldFetch;for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}__resetProviderHealthForTests();__resetPricingForTests();}
});
