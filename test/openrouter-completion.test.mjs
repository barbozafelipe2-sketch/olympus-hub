import test from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {fixtureBudget} from './helpers/authorization-fixture.js';import {fixturePrice} from './helpers/price-fixture.js';
import {callProvider,__resetProviderHealthForTests} from '../api/lib/providers.js';import {executeMode} from '../api/lib/orchestrator.js';
import {executionCatalog} from '../api/lib/ai-router.js';
test('OpenRouter uses configured exact models, bounded output, no hidden fallback and metered usage',async()=>{
 const saved={...process.env},old=fetch;let payload,calls=0;process.env.OPENROUTER_API_KEY='fixture';__resetProviderHealthForTests();
 globalThis.fetch=async(url,init)=>{calls++;assert.equal(String(url),'https://openrouter.ai/api/v1/chat/completions');payload=JSON.parse(init.body);return Response.json({id:'r',choices:[{message:{content:'Answer'}}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}});};
 const budget=fixtureBudget({maxCalls:1});
 try{const r=await callProvider('openrouter',{system:'s',messages:[{role:'user',content:'u'}],budget,maxOutputTokens:320});assert.equal(r.text,'Answer');assert.equal(payload.max_tokens,320);assert.equal(payload.provider.allow_fallbacks,false);assert.equal(calls,1);assert.equal(budget.chargedTokens(),5);
 await assert.rejects(()=>callProvider('openrouter',{system:'s',messages:[],model:'unconfigured',budget}),e=>e.code==='EXECUTOR_MODEL_DENIED');assert.equal(calls,1);
 }finally{budget.close();globalThis.fetch=old;process.env=saved;__resetProviderHealthForTests();}
});
test('same OpenRouter transport reviews with a different family; recover saved author without paying again',async()=>{
 const saved={...process.env},old=fetch;Object.assign(process.env,{OPENROUTER_API_KEY:'fixture',OPENROUTER_ECONOMY_MODEL:'google/fixture',OPENROUTER_PREMIUM_MODEL:'anthropic/fixture'});for(const key of ['OPENAI_API_KEY','ANTHROPIC_API_KEY','GOOGLE_AI_API_KEY','GEMINI_API_KEY'])delete process.env[key];
 let calls=[];globalThis.fetch=async(url,init)=>{const b=JSON.parse(init.body);calls.push(b.model);return Response.json({choices:[{message:{content:'Draft'}}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}});};
 const catalog=executionCatalog().map(c=>({...c,price:fixturePrice(),contextLength:128000}));const route={domain:'content',complexity:'moderate',executor:catalog[0],pricedExecutors:catalog};
 const budget=fixtureBudget({maxCalls:2}),stages=[];
 try{const r=await executeMode({mode:'zeus',gear:'compound',route,messages:[{role:'user',content:'Write'}],budget,onStage:async s=>stages.push(s)});assert.deepEqual(calls,['google/fixture','anthropic/fixture']);assert.equal(r.orchestration.independentFamilies,true);
 calls=[];const recovery=fixtureBudget({maxCalls:2});try{await executeMode({mode:'zeus',gear:'compound',route,messages:[{role:'user',content:'Write'}],budget:recovery,recoveredStages:[{stage:'author',input_hash:stages[0].inputHash,content:'Draft',provider:'openrouter',model:'google/fixture',request_id:crypto.randomUUID()}]});assert.deepEqual(calls,['anthropic/fixture']);assert.equal(recovery.calls,1);}finally{recovery.close();}
 }finally{budget.close();globalThis.fetch=old;process.env=saved;__resetProviderHealthForTests();}
});
test('OpenRouter failure falls back to direct Gemini within the original authorized slots',async()=>{
 const saved={...process.env},old=fetch;Object.assign(process.env,{OPENROUTER_API_KEY:'fixture',GEMINI_API_KEY:'fixture'});delete process.env.OPENAI_API_KEY;delete process.env.ANTHROPIC_API_KEY;__resetProviderHealthForTests();let calls=[];
 globalThis.fetch=async(url)=>{calls.push(String(url));return String(url).includes('openrouter')?Response.json({error:'outage'},{status:503}):Response.json({steps:[{type:'model_output',content:[{type:'text',text:'Fallback answer'}]}],usage:{total_input_tokens:1,total_output_tokens:1}});};
 const catalog=executionCatalog().map(c=>({...c,price:fixturePrice(),contextLength:128000})),route={domain:'content',complexity:'simple',executor:catalog.find(c=>c.provider==='openrouter'),pricedExecutors:catalog},budget=fixtureBudget({maxCalls:2});
 try{const r=await executeMode({mode:'zeus',gear:'simple',route,messages:[{role:'user',content:'Hi'}],budget});assert.equal(r.provider,'Google AI');assert.equal(budget.calls,2);assert.equal(r.fallbackUsed,true);assert.equal(calls.length,2);}finally{budget.close();globalThis.fetch=old;process.env=saved;__resetProviderHealthForTests();}
});
