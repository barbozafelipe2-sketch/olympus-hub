import assert from "node:assert/strict";
import test from "node:test";
import { orderProviders, modelFamily, requestDomain } from "../api/lib/model-routing.js";
import { selectRecentHistory } from "../api/lib/history.js";
import { savePhaseCheckpoint } from "../api/lib/phase-checkpoints.js";
import { decideCommercialEngine } from "../api/lib/commercial-routing-policy.js";

test("domain and model-family routing preserves independent review",()=>{
  const providers=["openai","anthropic","google"];
  assert.equal(requestDomain("Crie uma interface frontend"),"visual");
  assert.equal(orderProviders(providers,{role:"author",domain:"visual"})[0],"google");
  assert.equal(orderProviders(providers,{role:"author",domain:"engineering"})[0],"anthropic");
  const finishers=orderProviders(providers,{role:"finisher",domain:"engineering",excluded:["anthropic"]});
  assert.ok(!finishers.includes("anthropic"));
  assert.equal(modelFamily({provider:"openrouter",id:"google/gemini-test"}),modelFamily({provider:"google"}));
  assert.equal(decideCommercialEngine({activation:"manual",manualOlympus:true,olympusEntitled:false}).engine,"zeus");
  assert.equal(decideCommercialEngine({activation:"manual",manualOlympus:true,olympusEntitled:true}).engine,"olympus");
});

test("ported history selector keeps latest corrections and removes secrets",()=>{
  const rows=[{role:"user",content:"Latest correction password=private-value"},...Array.from({length:30},()=>({role:"assistant",content:"x".repeat(5000)}))];
  const selected=selectRecentHistory(rows,{maxChars:10000,perMessageChars:4000});
  assert.match(selected.at(-1).content,/Latest correction/);
  assert.ok(!JSON.stringify(selected).includes("private-value"));
  assert.ok(selected.reduce((n,m)=>n+m.content.length,0)<=10000);
});

test("commercial checkpoints bind completed content to owner, request and conversation",async()=>{
  let row;
  const client={from(table){assert.equal(table,"ai_stage_checkpoints");return {async upsert(value){row=value;return {error:null};}};}};
  assert.equal(await savePhaseCheckpoint(client,{ownerId:"owner",requestId:"request",conversationId:"conversation",stage:"author",result:{providerId:"google",model:"fixture",text:"completed output"}}),true);
  assert.equal(row.owner_id,"owner");assert.equal(row.request_id,"request");assert.equal(row.content,"completed output");
  const failing={from(){return {upsert:async()=>({error:{code:"fixture"}})};}};
  await assert.rejects(()=>savePhaseCheckpoint(failing,{ownerId:"owner",requestId:"request",conversationId:"conversation",stage:"author",result:{providerId:"google",model:"fixture",text:"completed output"}}),e=>e.code==="CHECKPOINT_PERSISTENCE_FAILED");
});
