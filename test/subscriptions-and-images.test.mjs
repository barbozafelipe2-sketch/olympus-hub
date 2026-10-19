import test from 'node:test';import assert from 'node:assert/strict';
import {createImageQuote,verifyImageQuote,generateWorkflowImage} from '../api/lib/image-workflow.js';
import {validWebhook,subscriptionPlans,syncSubscription} from '../api/lib/subscriptions.js';
test('image confirmations bind ownership, independent model and two real Combine references',async()=>{
 const saved={...process.env};process.env.IMAGE_WORKFLOW_QUOTE_SECRET='fixture-'.repeat(8);
 const source={id:crypto.randomUUID(),ownerId:'owner',groupId:crypto.randomUUID(),prompt:'A forest',model:'openai/a',provider:'openrouter',mimeType:'image/png',conversationId:'c',projectId:null};
 const routes=[{provider:'openai',model:'a',estimatedUsd:.1,supportsReferences:true},{provider:'openrouter',model:'google/b',estimatedUsd:.1,supportsReferences:true}];
 try{
 const quote=createImageQuote({ownerId:'owner',operation:'compare',sources:[source]},routes);assert.equal(quote.provider,'openrouter');assert.equal(quote.level,2);assert.throws(()=>verifyImageQuote(quote.token,'other',routes),e=>e.status===403);assert.equal(verifyImageQuote(quote.token,'owner',routes).sourceIds[0],source.id);
 assert.throws(()=>createImageQuote({ownerId:'owner',operation:'combine',sources:[source,{...source,id:crypto.randomUUID(),groupId:crypto.randomUUID()}],instructions:'Mix'},routes),e=>e.code==='IMAGE_GROUP_MISMATCH');
 let request;const client={chat:{completions:{create:async b=>{request=b;return {choices:[{message:{images:[{image_url:{url:'data:image/png;base64,AQID'}}]}}]};}}}};
 const references=[{bytes:new Uint8Array([1]),mimeType:'image/png'},{bytes:new Uint8Array([2]),mimeType:'image/png'}];
 const generated=await generateWorkflowImage({route:routes[1],prompt:'Combine both',references,clients:{openrouter:client}});assert.equal(generated.bytes.length,3);assert.equal(request.messages[0].content.filter(p=>p.type==='image_url').length,2);assert.equal(request.provider.allow_fallbacks,false);
 }finally{process.env=saved;}
});
test('subscriptions use server truth, reject sandbox/expired grants, preserve margin and authenticate webhooks',async()=>{
 const saved={...process.env};process.env.REVENUECAT_SECRET_API_KEY='fixture';process.env.REVENUECAT_WEBHOOK_AUTHORIZATION='Bearer '+'fixture'.repeat(6);
 const plan={monthlyCostMicrousd:1000000,netMonthlyRevenueMicrousd:4000000,minimumMargin:.5,dailyRequests:20,dailyTokens:1e6,monthlyTokens:1e7,maxLevel:4,allowedTiers:['economy','premium'],allowImage:true,allowWeb:true};
 process.env.OLYHUB_SUBSCRIPTION_PLANS_JSON=JSON.stringify({pro:plan});
 let payload;const client={rpc:async(_,p)=>{payload=p;return {data:true,error:null};}};
 const fixture=(sandbox=false,expires=Date.now()+3600000)=>async()=>Response.json({request_date_ms:Date.now(),subscriber:{entitlements:{pro:{expires_date:new Date(expires).toISOString(),product_identifier:'monthly'}},subscriptions:{monthly:{store:'app_store',is_sandbox:sandbox}}}});
 try{
 assert.equal(validWebhook(process.env.REVENUECAT_WEBHOOK_AUTHORIZATION),true);assert.equal(validWebhook('wrong'),false);
 assert.equal((await syncSubscription('owner',{client,fetcher:fixture()})).active,true);assert.equal(payload.p_plan.code,'pro');
 assert.equal((await syncSubscription('owner',{client,fetcher:fixture(true)})).active,false);assert.equal(payload.p_plan,null);
 assert.equal((await syncSubscription('owner',{client,fetcher:fixture(false,Date.now()-1000)})).active,false);
 process.env.OLYHUB_SUBSCRIPTION_PLANS_JSON=JSON.stringify({pro:{...plan,monthlyCostMicrousd:3500000}});assert.throws(subscriptionPlans,/margin/);
 }finally{process.env=saved;}
});
