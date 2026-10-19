import test from 'node:test';
import assert from 'node:assert/strict';
import { priceNumber, estimateCost, parsePriceFeed, priceSnapshot, priceCatalog, overridePrice, scheduledRates, __resetPricingForTests } from '../api/lib/model-pricing.js';
import { cheapestRouter } from '../api/lib/ai-router.js';
import { feedFixture, fixturePrice } from './helpers/price-fixture.js';

test('prices require explicit finite numbers, keep real zero, and include per-request fees',()=>{
 for(const v of ['',null,undefined,false,[],{},'NaN','Infinity','-1',' 0 '])assert.equal(priceNumber(v),null);
 for(const v of [0,'0','0.000001','1e-6'])assert.ok(priceNumber(v)>=0);
 assert.equal(estimateCost({input:1,output:2,request:0.01},{inputTokens:1000,outputTokens:500}),0.012);
 assert.equal(estimateCost(null),Infinity);
 assert.equal(estimateCost({...fixturePrice(),expiresAt:Date.now()-1}),Infinity);
 const paid={id:'paid',price:fixturePrice(0.1,0.1,0)};
 const freeWithFee={id:'misleading-zero-token-price',price:fixturePrice(0,0,1)};
 assert.equal(cheapestRouter([freeWithFee,paid]).id,'paid');
});
test('feed conversion rejects malformed, expired, ambiguous and non-text models',()=>{
 const now=Date.now(), body=feedFixture();
 body.data.push({...body.data[0]}); // duplicates cannot become ambiguous winners
 body.data.push({...body.data[1],id:'bad',pricing:{prompt:'',completion:'0',request:'0'}});
 body.data.push({...body.data[1],id:'expired',expiration_date:new Date(now-1000).toISOString()});
 body.data.push({...body.data[1],id:'audio',architecture:{input_modalities:['audio'],output_modalities:['audio']}});
 const parsed=parsePriceFeed(body,now);
 assert.equal(parsed.models.has('openai/gpt-4.1-mini'),false);
 for(const id of ['bad','expired','audio'])assert.equal(parsed.models.has(id),false);
 assert.equal(parsed.models.get('openai/gpt-5-mini').input,0.25);
 assert.equal(parsed.models.get('openai/gpt-5-mini').source,'openrouter_reference');
 assert.throws(()=>parsePriceFeed({data:[]}),/no usable/);
});
test('cache coalesces requests, refreshes prices, bounds stale use and backs off failures',async()=>{
 __resetPricingForTests();let calls=0,fail=false;const now=Date.now();
 const fetcher=async(url,init)=>{calls++;assert.equal(url,'https://openrouter.ai/api/v1/models');assert.ok(init.signal instanceof AbortSignal);assert.equal(init.headers.Authorization,undefined);if(fail)throw Error('fixture outage');return Response.json(feedFixture());};
 const all=await Promise.all(Array.from({length:8},()=>priceSnapshot({fetcher,now})));
 assert.equal(calls,1);assert.ok(all.every(x=>x.models.size>0));
 await priceSnapshot({fetcher,now:now+60_000});assert.equal(calls,1);
 fail=true;
 const stale=await priceSnapshot({fetcher,now:now+16*60_000});assert.ok(stale.models.size>0);assert.equal(calls,2);
 await priceSnapshot({fetcher,now:now+16*60_000+1});assert.equal(calls,2);
 const expired=await priceSnapshot({fetcher,now:now+61*60_000});assert.equal(expired.models.size,0);assert.equal(calls,3);
 fail=false;const fresh=await priceSnapshot({fetcher,now:now+63*60_000});assert.ok(fresh.models.size>0);assert.equal(calls,4);
 __resetPricingForTests();
});
test('dated direct-provider overrides and exact mappings never confuse provider billing',async()=>{
 const old=process.env.OLYHUB_MODEL_PRICES_JSON, oldMap=process.env.OLYHUB_PRICE_MODEL_MAP_JSON,now=Date.now();
 const candidate={id:'openai:economy',provider:'openai',model:'custom-model'};
 const value={input:0.1,output:0.2,request:0,updatedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+60_000).toISOString()};
 try {
  process.env.OLYHUB_MODEL_PRICES_JSON=JSON.stringify({'openai:custom-model':value});
  const result=await priceCatalog([candidate],{now,fetcher:()=>{throw Error('must not fetch when all overrides are valid');}});
  assert.equal(result[0].price.source,'provider_override');assert.equal(result[0].price.input,0.1);
  process.env.OLYHUB_MODEL_PRICES_JSON=JSON.stringify({'openai:custom-model':{...value,expiresAt:new Date(now-1).toISOString()}});
  assert.equal(overridePrice('openai','custom-model',now),null);
  process.env.OLYHUB_MODEL_PRICES_JSON=JSON.stringify({'openai:custom-model':[0.1,0.2]});assert.equal(overridePrice('openai','custom-model',now),null);
  process.env.OLYHUB_MODEL_PRICES_JSON='{}';process.env.OLYHUB_PRICE_MODEL_MAP_JSON=JSON.stringify({'openai:custom-model':'openai/gpt-5-mini'});
  __resetPricingForTests();const mapped=await priceCatalog([candidate],{now,fetcher:async()=>Response.json(feedFixture())});
  assert.equal(mapped[0].price.modelId,'openai/gpt-5-mini');assert.equal(mapped[0].price.source,'openrouter_reference');
 }finally{if(old===undefined)delete process.env.OLYHUB_MODEL_PRICES_JSON;else process.env.OLYHUB_MODEL_PRICES_JSON=old;if(oldMap===undefined)delete process.env.OLYHUB_PRICE_MODEL_MAP_JSON;else process.env.OLYHUB_PRICE_MODEL_MAP_JSON=oldMap;__resetPricingForTests();}
});
test('HTTP errors and oversized feeds never become free-price catalogs',async()=>{
 for(const response of [new Response('error',{status:500}),new Response('{}',{headers:{'content-length':String(4*1024*1024)}}),Response.json({data:[{id:'invalid',pricing:{}}]})]){
  __resetPricingForTests();const result=await priceSnapshot({fetcher:async()=>response});assert.equal(result.models.size,0);
 }
 __resetPricingForTests();
});

test('a catalog refresh changes the cheapest route without any hardcoded model price list',async()=>{
 __resetPricingForTests();const now=Date.now();let calls=0;
 const candidates=[{id:'first',provider:'openai',model:'gpt-4.1-mini'},{id:'second',provider:'openai',model:'gpt-5-mini'},{id:'new-model',provider:'openai',model:'brand-new-model'}];
 const fetcher=async()=>{
  calls++;const body=feedFixture();
  if(calls>1)body.data.push({...body.data[0],id:'openai/brand-new-model',pricing:{prompt:'0.000000001',completion:'0.000000001',request:'0'}});
  return Response.json(body);
 };
 const before=await priceCatalog(candidates,{fetcher,now});assert.equal(cheapestRouter(before).id,'second');
 const after=await priceCatalog(candidates,{fetcher,now:now+16*60_000});assert.equal(cheapestRouter(after).id,'new-model');assert.equal(calls,2);
 __resetPricingForTests();
});

test('live-style optional request fees remain distinguishable from malformed advertised fees',()=>{
 const row=feedFixture().data[0];delete row.pricing.request;
 const q=parsePriceFeed({data:[row]}).models.get(row.id);assert.equal(q.request,0);assert.equal(q.requestFeeListed,false);
 row.pricing.request='';assert.throws(()=>parsePriceFeed({data:[row]}),/no usable/);
});


test('UTC schedules use the current applicable quote and expire it before a rate boundary',()=>{
 const base={prompt:'0.000002',completion:'0.000003',overrides:[{utc_days:['monday'],utc_start:0,utc_end:100,prompt:'0.000001'}]};
 const before=scheduledRates(base,Date.UTC(2026,9,19,0,30));
 assert.equal(before.rates.prompt,'0.000001');assert.equal(before.rates.completion,'0.000003');assert.equal(before.rateKind,'scheduled_override');
 assert.equal(before.boundary,Date.UTC(2026,9,19,1));
 assert.equal(scheduledRates(base,Date.UTC(2026,9,19,2)).rates.prompt,'0.000002');
 const overnight={prompt:'1',completion:'1',overrides:[{utc_days:['monday'],utc_start:2200,utc_end:200,prompt:'0.1'}]};
 assert.equal(scheduledRates(overnight,Date.UTC(2026,9,20,1)).rates.prompt,'0.1');
 assert.equal(scheduledRates(overnight,Date.UTC(2026,9,20,3)).rates.prompt,'1');
 assert.throws(()=>scheduledRates({...base,overrides:[base.overrides[0],base.overrides[0]]},Date.UTC(2026,9,19,0,30)),/Ambiguous/);
});
