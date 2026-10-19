import { fixtureBudget } from "./helpers/authorization-fixture.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  checkpointRange,
  mergeCheckpointContent
} from "../api/lib/checkpoints.js";
import { executeMode } from "../api/lib/orchestrator.js";

test("checkpoint refresh starts after covered messages and preserves prior context", () => {
  assert.deepEqual(
    checkpointRange({ covered_message_count: 160 }, 192),
    { start: 160, endExclusive: 168 }
  );

  const merged = mergeCheckpointContent("USER: an older decision", [
    { role: "assistant", content: "A later conclusion" }
  ]);
  assert.match(merged, /older decision/);
  assert.match(merged, /later conclusion/);
});

test("long history checkpoints catch up in bounded batches without skipping the beginning", () => {
  assert.deepEqual(checkpointRange(null, 1000), {
    start: 0,
    endExclusive: 640
  });
  assert.deepEqual(
    checkpointRange({ covered_message_count: 640 }, 1000),
    { start: 640, endExclusive: 976 }
  );
});

test("oversized rolling checkpoints disclose when oldest excerpts are trimmed", () => {
  const content = mergeCheckpointContent("old".repeat(20000), [
    { role: "user", content: "new message" }
  ]);
  assert.equal(content.length, 40000);
  assert.match(content, /Oldest transcript excerpts were trimmed/);
  assert.match(content, /new message/);
});

test("Olympus degrades to one truthful Zeus route when only one provider is configured", async () => {
  const previousFetch = globalThis.fetch;
  const previousEnv = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY
  };
  let calls = 0;

  process.env.OPENAI_API_KEY = "test-key";
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GOOGLE_AI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(
      JSON.stringify({
        id: "resp-test",
        output: [{ content: [{ type: "output_text", text: "A useful answer." }] }],
        usage: { input_tokens: 4, output_tokens: 6, total_tokens: 10 }
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  try {
    const result = await executeMode({
      budget: fixtureBudget({maxCalls:1}),
      mode: "olympus",
      systemContext: "",
      messages: [{ role: "user", content: "Say hello." }]
    });

    assert.equal(calls, 1);
    assert.equal(result.orchestration.mode, "olympus");
    assert.equal(result.orchestration.degraded, true);
    assert.equal(result.orchestration.multiProvider, false);
    assert.equal(result.provider, "OpenAI");
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
});


test("fallback attempts consume the Compound cap and remain in the trace", async () => {
  const previousFetch = globalThis.fetch;
  const prev = Object.fromEntries(["OPENAI_API_KEY","ANTHROPIC_API_KEY","GOOGLE_AI_API_KEY","GEMINI_API_KEY"].map(k=>[k,process.env[k]]));
  process.env.OPENAI_API_KEY="fixture";process.env.ANTHROPIC_API_KEY="fixture";
  delete process.env.GOOGLE_AI_API_KEY;delete process.env.GEMINI_API_KEY;
  const {__resetProviderHealthForTests}=await import("../api/lib/providers.js");
  __resetProviderHealthForTests();
  let calls=0;
  globalThis.fetch=async url=>{
    calls++;
    if(String(url).includes("anthropic.com"))return new Response(JSON.stringify({error:{message:"fixture"}}),{status:503});
    return new Response(JSON.stringify({output:[{content:[{type:"output_text",text:"Recovered"}]}],usage:{input_tokens:4,output_tokens:6}}),{status:200});
  };
  try {
    const result=await executeMode({mode:"zeus",budget:fixtureBudget({maxCalls:2}),systemContext:"",messages:[{role:"user",content:"Fix this bug"}]});
    assert.equal(calls,2);assert.equal(result.orchestration.calls,2);
    assert.equal(result.trace.length,2);
    assert.equal(result.trace[0].outcome,"failed");assert.equal(result.trace[1].outcome,"completed");
    assert.equal(result.fallbackUsed,true);
    assert.equal(result.orchestration.degraded,true);
  } finally {
    globalThis.fetch=previousFetch;__resetProviderHealthForTests();
    for(const [k,v] of Object.entries(prev)){if(v==null)delete process.env[k];else process.env[k]=v;}
  }
});

test("direct provider modes are rejected by the orchestration boundary", async () => {
  for (const mode of ["openai", "claude", "google"]) {
    await assert.rejects(
      executeMode({
        mode,
        systemContext: "",
        messages: [{ role: "user", content: "This mode must not route." }]
      }),
      /Unsupported OlyHub mode/
    );
  }
});
