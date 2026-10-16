import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("SQL budget reservations protect quotas, ownership and deletion retention", async () => {
  const db = new PGlite();
  const owner = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  const conversation = "33333333-3333-4333-8333-333333333333";
  const request = "44444444-4444-4444-8444-444444444444";
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema app_private;
      grant usage on schema auth to authenticated;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function app_private.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
      create table public.profiles(id uuid primary key,display_name text,avatar_url text);
      create table public.projects(id uuid primary key,owner_id uuid);
      create table public.conversations(id uuid primary key,owner_id uuid,project_id uuid references public.projects(id) on delete cascade);
    `);
    for (const path of [
      "20261001152742_durable_execution_traces.sql",
      "20261001154043_usage_ledger_and_account_limits.sql",
      "20261001154212_usage_quota_summary_rpc.sql",
      "20261014140427_commercial_ai_budget_controls.sql"
    ]) {
      if(path.includes("commercial_ai_budget")) {
        await db.exec(`insert into auth.users values ('77777777-7777-4777-8777-777777777777');
          insert into executions(owner_id,mode,provider,model,request_id,call_count,latency_ms) values('77777777-7777-4777-8777-777777777777','zeus','openai','fixture','legacy',1,1);
          insert into usage_events(owner_id,execution_id,provider,model,role,request_id,total_tokens) select owner_id,id,'openai','fixture','author','legacy',99 from executions;`);
      }
      await db.exec(readFileSync("supabase/migrations/" + path, "utf8"));
    }
    assert.equal(Number((await db.query("select charged_tokens from ai_budget_requests where owner_id='77777777-7777-4777-8777-777777777777'")).rows[0].charged_tokens),99);
    await db.query("insert into auth.users values ($1),($2)", [owner, other]);
    await db.query("insert into account_limits(user_id) values ($1),($2)", [owner, other]);
    await db.exec("set role service_role");
    const reserve = async (id, fingerprint = "a".repeat(64), limit = 1000) => (await db.query(
      "select public.reserve_ai_budget($1,$2,$3,100,$4::jsonb) as result",
      [owner, id, fingerprint, JSON.stringify({ dailyRequests: 2, dailyTokens: limit, monthlyTokens: limit, concurrent: 1 })]
    )).rows[0].result;
    assert.equal((await db.query("select reserve_ai_budget($1,$2,$3,100,'{\"engine\":\"olympus\"}') as r",[owner,crypto.randomUUID(),"a".repeat(64)])).rows[0].r.reason,"olympus_not_entitled");
    assert.equal((await reserve(request)).allowed, true);
    assert.equal((await reserve(request)).reason, "request_already_consumed");
    assert.equal((await reserve(request, "b".repeat(64))).reason, "request_id_reused");
    assert.equal((await reserve(crypto.randomUUID())).reason, "concurrency_limit");
    const [settled] = (await db.query("select settle_ai_budget($1,$2,25,false,'[]') as ok", [owner, request])).rows;
    assert.equal(settled.ok, true);
    assert.equal((await db.query("select settle_ai_budget($1,$2,0,false,'[]') as ok", [owner, request])).rows[0].ok, false);
    const second = crypto.randomUUID();
    assert.equal((await reserve(second, "a".repeat(64), 120)).reason, "budget_limit");
    assert.equal((await reserve(second)).allowed, true);
    await db.query("select settle_ai_budget($1,$2,12,true,'[]')", [owner, second]);
    assert.equal((await reserve(crypto.randomUUID())).reason, "budget_limit");
    await db.exec("reset role");
    await db.query("insert into conversations(id,owner_id) values ($1,$2)", [conversation,owner]);
    const execution = crypto.randomUUID();
    await db.query("insert into executions(id,owner_id,conversation_id,mode,provider,model,request_id,call_count,latency_ms) values($1,$2,$3,'zeus','openai','fixture','fixture',1,1)", [execution,owner,conversation]);
    await db.query("insert into usage_events(owner_id,execution_id,provider,model,role,request_id,total_tokens) values($1,$2,'openai','fixture','author','fixture',25)", [owner,execution]);
    await db.query("insert into ai_stage_checkpoints(owner_id,request_id,conversation_id,stage,provider,model,content) values($1,$2,$3,'author','openai','fixture','completed draft')",[owner,request,conversation]);
    await db.query("delete from conversations where id=$1", [conversation]);
    assert.equal((await db.query("select count(*)::int as n from ai_stage_checkpoints")).rows[0].n,0);
    assert.equal((await db.query("select count(*)::int as n from executions where id=$1", [execution])).rows[0].n,1);
    await db.query("delete from executions where id=$1", [execution]);
    assert.equal((await db.query("select count(*)::int as n from usage_events where owner_id=$1",[owner])).rows[0].n,1);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
    await db.exec("set role authenticated");
    const usage = (await db.query("select * from get_my_usage_summary()" )).rows[0];
    assert.equal(Number(usage.daily_requests),2);
    assert.equal(Number(usage.daily_tokens),37);
    await assert.rejects(() => reserve(crypto.randomUUID()), /permission denied/);
    await assert.rejects(() => db.query("update ai_budget_requests set charged_tokens=0"), /permission denied/);
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
    await db.exec("set role authenticated");
    assert.equal((await db.query("select * from ai_budget_requests")).rows.length,0);
    await db.exec("reset role");
    // Multiple queued reservations admit one request, never all callers reading the same old total.
    await db.exec("set role service_role");
    const ids=[crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()];
    const pending=await Promise.all(ids.map(id=>db.query("select reserve_ai_budget($1,$2,$3,100,'{}') as r",[other,id,"a".repeat(64)])));
    assert.equal(pending.filter(r=>r.rows[0].r.allowed).length,1);
    await db.exec("reset role");
    await db.query("update ai_budget_requests set expires_at=now()-interval '1 minute' where owner_id=$1",[other]);
    await db.exec("set role service_role");
    const afterExpiry=crypto.randomUUID();
    assert.equal((await db.query("select reserve_ai_budget($1,$2,$3,100,'{}') as r",[other,afterExpiry,"a".repeat(64)])).rows[0].r.allowed,true);
    assert.equal(Number((await db.query("select sum(charged_tokens) as n from ai_budget_requests where owner_id=$1",[other])).rows[0].n),200);
    await db.query("select settle_ai_budget($1,$2,1,false,'[]')",[other,afterExpiry]);
    for(let i=0;i<2;i++) {
      const imageId=crypto.randomUUID();
      assert.equal((await db.query("select reserve_ai_budget($1,$2,$3,100,'{}','image') as r",[other,imageId,"a".repeat(64)])).rows[0].r.allowed,true);
      await db.query("select settle_ai_budget($1,$2,1,false,'[]')",[other,imageId]);
    }
    assert.equal((await db.query("select reserve_ai_budget($1,$2,$3,100,'{}','image') as r",[other,crypto.randomUUID(),"a".repeat(64)])).rows[0].r.reason,"image_daily_limit");
    await db.exec("reset role");
    await db.query("update account_limits set olympus_entitled=true where user_id=$1",[other]);
    await db.exec("set role service_role");
    const entitledId=crypto.randomUUID();
    assert.equal((await db.query("select reserve_ai_budget($1,$2,$3,100,'{\"engine\":\"olympus\"}') as r",[other,entitledId,"a".repeat(64)])).rows[0].r.allowed,true);
    await db.query("select settle_ai_budget($1,$2,0,false,'[]')",[other,entitledId]);
    await db.exec("reset role");
    // Missing account is blocked, including a server call; no unlimited fallback.
    await db.query("delete from account_limits where user_id=$1",[other]);
    await db.exec("set role service_role");
    assert.equal((await db.query("select reserve_ai_budget($1,$2,$3,100,'{}') as r",[other,crypto.randomUUID(),"a".repeat(64)])).rows[0].r.reason,"account_not_active");
  } finally { await db.close(); }
});
