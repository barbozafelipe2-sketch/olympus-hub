import { admissionPolicy } from "./helpers/authorization-fixture.js";
import { feedFixture } from "./helpers/price-fixture.js";
import assert from "node:assert/strict";
import test from "node:test";
import handler from "../api/chat.js";

test("API blocks provider spend before reservation and settles failed attempts", async()=>{
  const vars=["SUPABASE_URL","SUPABASE_PUBLISHABLE_KEY","SUPABASE_SECRET_KEY","OPENAI_API_KEY","ANTHROPIC_API_KEY","GOOGLE_AI_API_KEY","GEMINI_API_KEY"];
  const old=Object.fromEntries(vars.map(k=>[k,process.env[k]]));
  const oldFetch=globalThis.fetch;
  process.env.SUPABASE_URL="https://supabase.fixture";
  process.env.SUPABASE_PUBLISHABLE_KEY="fixture";
  process.env.SUPABASE_SECRET_KEY="fixture-server";
  process.env.OPENAI_API_KEY="fixture";
  for(const k of ["ANTHROPIC_API_KEY","GOOGLE_AI_API_KEY","GEMINI_API_KEY"])delete process.env[k];
  let allowed=false,failReservation=false,providerCalls=0,settlements=[];
  globalThis.fetch=async(url,options={})=>{
    const path=String(url);
    if(path.includes('/rest/v1/ai_budget_requests')||path.includes('/rest/v1/ai_response_cache'))return Response.json(null);
    if(path.includes('bind_ai_execution'))return Response.json({allowed:true});
    if(path.includes('authorize_ai_attempt'))return Response.json({allowed:true,attemptId:JSON.parse(options.body).p_event.attemptId});
    if(path === "https://openrouter.ai/api/v1/models")return Response.json(feedFixture());
    if(path.includes("auth/v1/user"))return Response.json({id:"11111111-1111-4111-8111-111111111111",aud:"authenticated"});
    if(path.includes("reserve_ai_budget"))return failReservation
      ?Response.json({message:"fixture unavailable",code:"fixture"},{status:500})
      :Response.json({allowed,authorizationPolicy:admissionPolicy(),reason:allowed?null:"budget_limit"});
    if(path.includes("settle_ai_budget")){settlements.push(JSON.parse(options.body));return Response.json(true);}
    if(path.includes("rest/v1/executions"))return Response.json({id:crypto.randomUUID()},{status:201});
    if(path.includes("openai.com")){providerCalls++;return Response.json({error:{message:"fixture outage"}},{status:503});}
    throw new Error("Unexpected fixture request: "+path);
  };
  const invoke=async()=>{
    const res={code:0,body:null,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
    await handler({method:"POST",headers:{authorization:"Bearer fixture-user"},body:{mode:"zeus",requestId:crypto.randomUUID(),messages:[{role:"user",content:"Oi"}]}},res);
    return res;
  };
  try {
    assert.equal((await invoke()).code,429);assert.equal(providerCalls,0);
    failReservation=true;assert.equal((await invoke()).code,503);assert.equal(providerCalls,0);
    failReservation=false;allowed=true;
    assert.equal((await invoke()).code,503);assert.equal(providerCalls,2); // router + authorized answer attempt
    assert.equal(settlements.length,1);
    assert.equal(settlements[0].p_failed,true);
    assert.equal(settlements[0].p_trace.length,2);
    assert.ok(settlements[0].p_charged_tokens>0,"unknown paid-attempt usage must not become zero");
  } finally {
    globalThis.fetch=oldFetch;
    for(const [k,v] of Object.entries(old)){if(v==null)delete process.env[k];else process.env[k]=v;}
  }
});
