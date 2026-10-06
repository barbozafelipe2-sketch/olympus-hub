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


test("provider failover cycles through healthy configured providers in both directions", async () => {
  const previousFetch = globalThis.fetch;
  const previousEnv = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY
  };
  const calls = [];
  let scenario = 1;

  process.env.OPENAI_API_KEY = "test-openai";
  process.env.ANTHROPIC_API_KEY = "test-anthropic";
  process.env.GOOGLE_AI_API_KEY = "test-google";
  delete process.env.GEMINI_API_KEY;

  globalThis.fetch = async (url) => {
    const endpoint = String(url);
    calls.push(endpoint);

    if (scenario === 1) {
      if (endpoint.includes("api.openai.com")) {
        return new Response(JSON.stringify({ error: { message: "temporary failure" } }), { status: 503 });
      }
      if (endpoint.includes("api.anthropic.com")) {
        return new Response(JSON.stringify({
          content: [{ type: "text", text: "Anthropic fallback answer." }],
          usage: { input_tokens: 4, output_tokens: 6 }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
    } else {
      if (endpoint.includes("api.anthropic.com")) {
        return new Response(JSON.stringify({ error: { message: "temporary failure" } }), { status: 503 });
      }
      if (endpoint.includes("api.openai.com")) {
        return new Response(JSON.stringify({ error: { message: "temporary failure" } }), { status: 503 });
      }
    }

    return new Response(JSON.stringify({
      model: "test-google",
      steps: [{ type: "model_output", content: [{ type: "text", text: "Google fallback answer." }] }],
      usage: { total_input_tokens: 4, total_output_tokens: 6, total_tokens: 10 }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const openAiPrimary = await executeMode({
      mode: "zeus",
      systemContext: "",
      messages: [{ role: "user", content: "Say hello." }]
    });
    assert.equal(openAiPrimary.provider, "Anthropic");
    assert.equal(openAiPrimary.fallbackUsed, true);
    assert.equal(openAiPrimary.trace[0].fallbackFrom, "openai");
    assert.deepEqual(
      calls.map((url) => url.includes("api.openai.com") ? "openai" : url.includes("api.anthropic.com") ? "anthropic" : "google"),
      ["openai", "anthropic"]
    );

    scenario = 2;
    calls.length = 0;
    const anthropicPrimary = await executeMode({
      mode: "zeus",
      systemContext: "",
      messages: [{ role: "user", content: "Rewrite this proposal clearly." }]
    });
    assert.equal(anthropicPrimary.provider, "Google AI");
    assert.equal(anthropicPrimary.fallbackUsed, true);
    assert.equal(anthropicPrimary.trace[0].fallbackFrom, "anthropic -> openai");
    assert.deepEqual(
      calls.map((url) => url.includes("api.openai.com") ? "openai" : url.includes("api.anthropic.com") ? "anthropic" : "google"),
      ["anthropic", "openai", "google"]
    );
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
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
