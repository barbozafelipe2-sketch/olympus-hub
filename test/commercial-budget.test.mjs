import { fixtureBudget } from "./helpers/authorization-fixture.js";
import assert from "node:assert/strict";
import test from "node:test";
import { CALL_CAPS, MAX_INPUT_CHARS, compactInput, createBudget, decideGear, evidenceContext } from "../api/lib/budget.js";
import { executeMode } from "../api/lib/orchestrator.js";
import { __resetProviderHealthForTests } from "../api/lib/providers.js";
import { runWebSearchCapability } from "../api/lib/capabilities.js";
import { configuredLimits, DEFAULT_LIMITS } from "../api/lib/quota.js";

test("bounded context keeps newest turns and scrubs credentials from history", () => {
  const messages=Array.from({length:40},(_,i)=>({role:i%2?"user":"assistant",content:`turn ${i} `+"x".repeat(3990)}));
  messages.push({role:"user",content:"Newest instruction OPENAI_API_KEY=sk-"+"a".repeat(40)});
  const input=compactInput("system "+"x".repeat(20000),messages);
  assert.ok(input.system.length+input.messages.reduce((n,m)=>n+m.content.length,0)<=MAX_INPUT_CHARS);
  assert.match(input.messages.at(-1).content,/Newest instruction/);
  assert.ok(!JSON.stringify(input).includes("sk-"));
  assert.ok(!JSON.stringify(input).includes("turn 0 "));
  const evidence=evidenceContext({project:"PROJECT "+"p".repeat(40000), files:"FILE "+"f".repeat(30000),web:"WEB "+"w".repeat(10000)});
  assert.ok(evidence.length<8000);
  for(const label of ["PROJECT","FILE","WEB"])assert.ok(evidence.includes(label));
});

test("safe defaults cannot be disabled with absent or invalid environment limits",()=>{
  const old=process.env.OLYHUB_DAILY_REQUEST_LIMIT;
  try {
    for(const value of ["","0","-1","bad"]){process.env.OLYHUB_DAILY_REQUEST_LIMIT=value;assert.equal(configuredLimits().dailyRequests,DEFAULT_LIMITS.dailyRequests);}
  } finally { if(old==null)delete process.env.OLYHUB_DAILY_REQUEST_LIMIT;else process.env.OLYHUB_DAILY_REQUEST_LIMIT=old; }
});

test("deadline blocks new attempts and unknown usage retains a conservative charge",()=>{
  const expired=fixtureBudget({maxCalls:4,startedAt:Date.now()-100000});
  assert.throws(()=>expired.reserve("author","openai","fixture"),/budget exhausted/);expired.close();
  const budget=fixtureBudget({maxCalls:1});
  try {
    const event=budget.reserve("author","openai","fixture",100,20);
    budget.complete(event,null,{status:504});
    assert.equal(budget.calls,1);assert.equal(budget.chargedTokens(),420);
    assert.throws(()=>budget.reserve("retry","openai","fixture"),/budget exhausted/);
  } finally { budget.close(); }
});

test("all four gears enforce caps and web search shares the cap",async()=>{
  const oldFetch=globalThis.fetch;
  const vars=["OPENAI_API_KEY","ANTHROPIC_API_KEY","GOOGLE_AI_API_KEY","GEMINI_API_KEY"];
  const old=Object.fromEntries(vars.map(k=>[k,process.env[k]]));
  for(const key of vars)process.env[key]="fixture";
  let calls=0,fail=false;
  globalThis.fetch=async(url,options)=>{
    calls++;
    if(fail)return new Response(JSON.stringify({error:{message:"fixture"}}),{status:503});
    const data=String(url).includes("anthropic")
      ?{content:[{type:"text",text:"Final answer"}],usage:{input_tokens:10,output_tokens:5}}
      :String(url).includes("googleapis")
        ?{steps:[{type:"model_output",content:[{type:"text",text:"Final answer"}]}],usage:{total_input_tokens:10,total_output_tokens:5,total_tokens:15}}
        :{id:crypto.randomUUID(),output:[{content:[{type:"output_text",text:"Final answer"}]}],usage:{input_tokens:10,output_tokens:5,total_tokens:15}};
    const body=JSON.parse(options.body);
    assert.equal(typeof body.model,"string");
    assert.ok(options.signal instanceof AbortSignal);
    assert.ok((body.instructions||body.system||body.input||"").length<=MAX_INPUT_CHARS+100);
    return new Response(JSON.stringify(data),{status:200});
  };
  const requests={simple:"Oi",compound:"Corrija este bug",compound_plus:"Auditoria jurídica",turbo:"Crie app completo frontend backend database"};
  try {
    for(const shouldFail of [false,true])for(const [gear,text] of Object.entries(requests)){
      calls=0;fail=shouldFail;__resetProviderHealthForTests();
      const budget=fixtureBudget({maxCalls:CALL_CAPS[gear]});
      try {
        const result=await executeMode({mode:gear.startsWith("compound_plus")||gear==="turbo"?"olympus":"zeus",gear,messages:[{role:"user",content:text}],budget});
        assert.equal(result.orchestration.calls,calls);
        assert.equal(result.trace.length,calls);
        if(!shouldFail)assert.equal(calls,CALL_CAPS[gear]);
        if(!shouldFail&&gear==="compound")assert.notEqual(result.trace[0].providerId,result.trace[1].providerId);
      } catch(error){assert.ok(shouldFail,error.message);}
      finally{assert.ok(calls<=CALL_CAPS[gear]);assert.equal(budget.events.length,calls);budget.close();}
    }
    fail=false;calls=0;__resetProviderHealthForTests();
    const budget=fixtureBudget({maxCalls:3});
    try {
      const messages=[{role:"user",content:"Pesquise na internet as leis atuais"}];
      const web=await runWebSearchCapability({messages,budget});
      assert.equal(web.traces[0].status,"completed");
      const result=await executeMode({mode:"olympus",gear:"compound_plus",messages,systemContext:web.context,budget});
      assert.equal(calls,3);assert.equal(result.orchestration.calls,3);
      assert.equal(budget.events[0].role,"capability:web_search");
      assert.equal(budget.chargedTokens(),45);
    } finally{budget.close();}
    calls=0;__resetProviderHealthForTests();
    const checkpointBudget=fixtureBudget({maxCalls:4});
    try {
      await assert.rejects(()=>executeMode({mode:"olympus",gear:"turbo",messages:[{role:"user",content:"Crie um app completo"}],budget:checkpointBudget,onStage:async()=>{throw Object.assign(new Error("fixture"),{code:"CHECKPOINT_PERSISTENCE_FAILED"});}}),e=>e.code==="CHECKPOINT_PERSISTENCE_FAILED");
      assert.equal(calls,1,"checkpoint storage failure must not retry a paid call");
    } finally { checkpointBudget.close(); }
    assert.equal(decideGear("zeus",[{role:"user",content:"Oi"}]),"simple");
  } finally {
    globalThis.fetch=oldFetch;__resetProviderHealthForTests();
    for(const [k,v] of Object.entries(old)){if(v==null)delete process.env[k];else process.env[k]=v;}
  }
});
