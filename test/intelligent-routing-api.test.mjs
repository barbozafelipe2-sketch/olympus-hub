import { admissionPolicy } from "./helpers/authorization-fixture.js";
import { __resetPricingForTests } from "../api/lib/model-pricing.js";
import { feedFixture } from "./helpers/price-fixture.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/chat.js';
import { __resetProviderHealthForTests, callProvider } from '../api/lib/providers.js';

test('AI-selected level and exact executor reach the pipeline; permissions, budget and failures remain enforced',async()=>{
 const names=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY','GOOGLE_AI_API_KEY','GEMINI_API_KEY'];
 const saved=Object.fromEntries(names.map(k=>[k,process.env[k]]));const original=globalThis.fetch;
 Object.assign(process.env,{SUPABASE_URL:'https://router.fixture',SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SECRET_KEY:'private',OPENAI_API_KEY:'fixture',ANTHROPIC_API_KEY:'fixture'});
 delete process.env.GOOGLE_AI_API_KEY;delete process.env.GEMINI_API_KEY;
 let allowed=true,entitled=true,route,routerFailure=false,priceUnavailable=false,omitReviewerPrices=false,executionWrites=0,sent=[],settlements=[],reservations=[];
 globalThis.fetch=async (url,init={})=>{
  const path=String(url);
    if(path.includes('bind_ai_execution'))return Response.json({allowed:true});
    if(path.includes('authorize_ai_attempt'))return Response.json({allowed:true,attemptId:JSON.parse(init.body).p_event.attemptId});
    if(path === "https://openrouter.ai/api/v1/models")return Response.json(priceUnavailable?{data:[]}:omitReviewerPrices?{data:feedFixture().data.filter(m=>m.id.startsWith("openai/"))}:feedFixture());
  if(path.includes('auth/v1/user'))return Response.json({id:'11111111-1111-4111-8111-111111111111',aud:'authenticated'});
  if(path.includes('reserve_ai_budget')){reservations.push(JSON.parse(init.body));return Response.json({allowed,authorizationPolicy:admissionPolicy(),olympusEntitled:entitled,reason:allowed?null:'budget_limit'});}
  if(path.includes('settle_ai_budget')){settlements.push(JSON.parse(init.body));return Response.json(true);}
  if(path.includes('/rest/v1/executions')){executionWrites++;return Response.json({id:crypto.randomUUID()},{status:201});}
  if(path.includes('/rest/v1/usage_events'))return Response.json(null,{status:201});
  if(path.includes('openai.com')||path.includes('anthropic.com')){
   assert.ok(reservations.length>0,'no inference before admission');
   const body=JSON.parse(init.body);const router=(body.instructions||body.system||'').includes('Return ONLY JSON with domain');
   sent.push({router,model:body.model,provider:path.includes('openai.com')?'openai':'anthropic'});
   if(router&&routerFailure)return Response.json({error:{message:'fixture outage'}},{status:503});
   const text=router?JSON.stringify(route):'Fixture answer';
   return Response.json(path.includes('anthropic.com')?{content:[{type:'text',text}],usage:{input_tokens:10,output_tokens:5}}:{output:[{content:[{type:'output_text',text}]}],usage:{input_tokens:10,output_tokens:5,total_tokens:15}});
  }
  throw Error('Unexpected fixture request '+path);
 };
 const invoke=async ({auto=false,mode='zeus',level=2,complexity='moderate',executorId='anthropic:economy',domain='engineering',taskType='coding'}={})=>{
  __resetProviderHealthForTests();__resetPricingForTests();executionWrites=0;sent=[];settlements=[];reservations=[];
  route={domain,taskType,complexity,level,executorId};
  const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await handler({method:'POST',headers:{authorization:'Bearer fixture'},body:{mode,olympusAuto:auto,requestId:crypto.randomUUID(),messages:[{role:'user',content:'Oi'}]}},res);
  return res;
 };
 try {
  let r=await invoke();assert.equal(r.code,200);assert.equal(r.body.orchestration.level,'compound');
  assert.equal(sent.filter(c=>c.router).length,1);assert.equal(sent.length,3);assert.equal(sent[1].model,'claude-haiku-4-5');
  assert.notEqual(sent[1].provider,sent[2].provider);assert.equal(settlements[0].p_trace.length,3);
  r=await invoke({auto:true,level:3,complexity:'complex',executorId:'openai:premium'});
  assert.equal(r.code,200);assert.equal(r.body.orchestration.level,'compound_plus');assert.equal(sent.length,4);
  r=await invoke({auto:true,level:4,complexity:'complex',executorId:'openai:premium'});
  assert.equal(r.code,200);assert.equal(r.body.orchestration.level,'turbo');assert.equal(r.body.orchestration.mode,'olympus');assert.equal(sent.length,5);
  r=await invoke({level:4,complexity:'complex',executorId:'openai:premium'});
  assert.equal(r.body.orchestration.mode,'zeus');assert.equal(sent.length,3);assert.ok(r.body.orchestration.routing.restrictions.includes('automatic_olympus_off'));
  entitled=false;r=await invoke({auto:true,level:4,complexity:'complex',executorId:'openai:premium'});
  assert.equal(r.body.orchestration.mode,'zeus');assert.ok(r.body.orchestration.routing.restrictions.includes('olympus_not_entitled'));
  r=await invoke({auto:true,level:1,complexity:'simple',executorId:'openai:economy',domain:'content',taskType:'answer'});
  assert.equal(r.code,200);assert.equal(sent.length,2);assert.equal(sent[1].model,'gpt-4.1-mini');assert.equal(r.body.orchestration.level,'simple');
  r=await invoke({executorId:'arbitrary:unapproved'});assert.equal(r.code,200);assert.equal(r.body.orchestration.routing.router,'rules_fallback');assert.equal(sent.length,2);
  routerFailure=true;r=await invoke();assert.equal(r.code,200);assert.equal(sent.length,2);assert.equal(settlements[0].p_trace[0].outcome,'failed');assert.ok(settlements[0].p_charged_tokens>0);
  routerFailure=false;omitReviewerPrices=true;r=await invoke({executorId:'openai:economy'});
  assert.equal(r.code,200);assert.equal(r.body.orchestration.degraded,true);assert.equal(sent.length,2);assert.ok(sent.every(c=>c.provider==='openai'));omitReviewerPrices=false;
  allowed=false;r=await invoke();assert.equal(r.code,429);assert.equal(sent.length,0);
  await assert.rejects(()=>callProvider('openai',{system:'test',messages:[{role:'user',content:'test'}],model:'unapproved-expensive-model'}),e=>e.code==='EXECUTOR_MODEL_DENIED');
  assert.equal(sent.length,0);
  allowed=true;priceUnavailable=true;r=await invoke();assert.equal(r.code,503);assert.equal(sent.length,0);assert.equal(settlements[0].p_trace.length,0);assert.equal(settlements[0].p_charged_tokens,0);assert.equal(executionWrites,0);assert.equal(r.body.code,'MODEL_PRICING_UNAVAILABLE');
 }finally{globalThis.fetch=original;for(const [k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}__resetProviderHealthForTests();}
});
