import test from 'node:test';import assert from 'node:assert/strict';
import { createExecutionAuthorization } from '../api/lib/execution-authorization.js';
import { createBudget } from '../api/lib/budget.js';
import { admissionPolicy } from './helpers/authorization-fixture.js';import { fixturePrice } from './helpers/price-fixture.js';
const model={id:'openai:economy',provider:'openai',model:'fixture',tier:'economy',domains:['engineering'],maxComplexity:'moderate',price:{...fixturePrice(),contextLength:128000}};
const plan={mode:'zeus',level:2,domain:'engineering',complexity:'moderate',executor:model,pricedExecutors:[model]};

test('each paid permit binds immutable owner/request, actual model, tier, capability and context',async()=>{
 const calls=[];let deny=false;
 const client={rpc:async(name,args)=>{calls.push({name,args});return {data:deny?{allowed:false,reason:'account_not_active'}:{allowed:true,attemptId:args.p_event?.attemptId},error:null};}};
 const controller=createExecutionAuthorization({client,ownerId:'owner',requestId:'request',quota:{allowed:true,authorizationPolicy:admissionPolicy()},requestedMode:'zeus',isImage:false,hasWeb:false});
 const returned=controller.filterCatalog([model]);returned[0].model='tampered';
 const budget=createBudget({maxCalls:3,authorizeAttempt:controller.authorizeAttempt});
 try {
  const r=await budget.reserveAuthorized('router','openai','fixture',100,320,{tier:'economy',inputBytes:100});budget.complete(r,{usage:{reported:true,totalTokens:5}});
  await controller.bindExecution(plan,3);
  await assert.rejects(()=>budget.reserveAuthorized('author','openai','not-configured',100,20,{tier:'economy',inputBytes:100}),e=>e.code==='AI_AUTHORIZATION_DENIED');
  assert.equal(budget.chargedTokens(),5);assert.equal(budget.calls,1);assert.equal(budget.slots,2);assert.equal(calls.filter(c=>c.name==='authorize_ai_attempt').length,1);
  deny=true;
  await assert.rejects(()=>budget.reserveAuthorized('author','openai','fixture',100,20,{tier:'economy',inputBytes:100}),e=>e.code==='AI_AUTHORIZATION_DENIED');
  assert.equal(budget.chargedTokens(),5);assert.equal(budget.calls,1);
  for(const c of calls){assert.equal(c.args.p_owner_id,'owner');assert.equal(c.args.p_request_id,'request');}
  assert.throws(()=>{budget.maxCalls=4;},/only narrow/);
 }finally{budget.close();}
});
test('unavailable authorization and missing grant block spend; malformed usage stays conservative',async()=>{
 const missing=createBudget({maxCalls:1});
 try{await assert.rejects(()=>missing.reserveAuthorized('lead','openai','fixture'),e=>e.code==='AI_AUTHORIZATION_REQUIRED');assert.equal(missing.chargedTokens(),0);assert.equal(missing.calls,0);}finally{missing.close();}
 const controller=createExecutionAuthorization({client:{rpc:async()=>({error:{code:'fixture'}})},ownerId:'owner',requestId:'request',quota:{allowed:true,authorizationPolicy:admissionPolicy()},requestedMode:'zeus'});
 controller.filterCatalog([model]);const budget=createBudget({maxCalls:1,authorizeAttempt:controller.authorizeAttempt});
 try{await assert.rejects(()=>budget.reserveAuthorized('router','openai','fixture',100,20,{tier:'economy',inputBytes:100}),e=>e.code==='AI_AUTHORIZATION_UNAVAILABLE');assert.equal(budget.calls,0);assert.equal(budget.chargedTokens(),0);}finally{budget.close();}
 const usage=createBudget({maxCalls:1,authorizeAttempt:async()=>{}});
 try{const event=await usage.reserveAuthorized('lead','openai','fixture',100,20);usage.complete(event,{usage:{reported:true,totalTokens:-1}});assert.equal(usage.chargedTokens(),420);}finally{usage.close();}
});
test('context and task capability violations never reach the permit RPC',async()=>{
 let permits=0;
 const c=createExecutionAuthorization({client:{rpc:async(name,args)=>{if(name==='authorize_ai_attempt')permits++;return {data:{allowed:true,attemptId:args.p_event?.attemptId}};}},ownerId:'o',requestId:'r',quota:{allowed:true,authorizationPolicy:admissionPolicy()},requestedMode:'zeus'});
 c.filterCatalog([{...model,price:{...fixturePrice(),contextLength:1024}}]);await c.bindExecution(plan,2);
 const budget=createBudget({maxCalls:2,authorizeAttempt:c.authorizeAttempt});
 try {
  await assert.rejects(()=>budget.reserveAuthorized('author','openai','fixture',100,20,{tier:'economy',inputBytes:100}),/not authorized/);
  assert.equal(permits,0);assert.equal(budget.calls,0);
 }finally{budget.close();}
});
