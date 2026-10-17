import { test } from "node:test";
import { strict as assert } from "node:assert";
import { parseRouterAnswer, cheapestRouter } from "../api/lib/ai-router.js";
test("strict domain and malformed output falls back",()=>{assert.deepEqual(parseRouterAnswer('{"domain":"engineering"}'),{domain:"engineering"});assert.equal(parseRouterAnswer('{"domain":"deploy"}'),null);assert.equal(parseRouterAnswer("not-json"),null)});
test("router selects least expensive known configured model",()=>{const result=cheapestRouter(["anthropic","openai"],p=>p==="openai"?"gpt-4.1-mini":"claude-haiku-4-5");assert.equal(result.provider,"openai");assert.equal(cheapestRouter(["anthropic"],()=> "unknown-model"),null)});
