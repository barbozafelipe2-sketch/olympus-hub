import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';
import {authorizationDb} from './helpers/authorization-db.js';
test('commercial migration: atomic monetary caps, durable response/replay, deletion, selection and subscription expiry',async()=>{
 const db=await authorizationDb(),owner=crypto.randomUUID(),other=crypto.randomUUID(),conversation=crypto.randomUUID();
 try{
  await db.exec(`create table public.messages(id uuid primary key default gen_random_uuid(),owner_id uuid references auth.users(id) on delete cascade,conversation_id uuid references conversations(id) on delete cascade,role text,content text,metadata jsonb,created_at timestamptz default now());create table public.artifacts(id uuid primary key,owner_id uuid references auth.users(id));grant all on messages,artifacts to service_role;`);
  await db.exec(readFileSync('supabase/migrations/20261019053006_commercial_completion.sql','utf8'));
  for(const file of readdirSync('supabase/migrations').filter(n=>n.endsWith('_commercial_foreign_key_indexes.sql')))await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
  await db.query('insert into auth.users values($1),($2)',[owner,other]);await db.query('insert into account_limits(user_id,monthly_cost_limit_microusd) values($1,100),($2,100)',[owner,other]);
  await db.query('insert into conversations(id,owner_id) values($1,$2)',[conversation,owner]);
  await db.exec('set role service_role');
  const reserve=async()=>{const id=crypto.randomUUID();const r=(await db.query('select reserve_ai_budget($1,$2,$3,300288,$4::jsonb) r',[owner,id,'a'.repeat(64),JSON.stringify({engine:'zeus',maxCalls:3,dailyRequests:100,dailyTokens:1e7,monthlyTokens:1e7})])).rows[0].r;assert.equal(r.allowed,true);return id;};
  const permit=async(id,cost=60)=> (await db.query('select authorize_ai_attempt($1,$2,$3::jsonb) r',[owner,id,JSON.stringify({attemptId:crypto.randomUUID(),role:'lead',mode:'zeus',tier:'economy',provider:'openrouter',model:'google/fixture',inputChars:100,outputTokens:20,estimatedMicrousd:cost})])).rows[0].r;
  let id=await reserve();await db.query("select bind_ai_execution($1,$2,'zeus',1,3)",[owner,id]);assert.equal((await permit(id)).allowed,true);assert.equal((await permit(id)).reason,'monthly_cost_limit');
  const response={reply:'Durable answer',sources:[],requestId:id};
  const complete=()=>db.query('select complete_ai_response($1,$2,$3,$4::jsonb,20,\'[]\'::jsonb) r',[owner,id,conversation,JSON.stringify(response)]);
  const first=(await complete()).rows[0].r;assert.equal(first.assistantMessage.content,'Durable answer');assert.deepEqual((await complete()).rows[0].r,first);
  assert.equal((await db.query('select count(*) n from messages')).rows[0].n,1);
  assert.equal((await permit(id)).reason,'reservation_inactive');
  assert.equal((await db.query('select reconcile_ai_cost($1,$2,10,$3) ok',[owner,id,'fixture-invoice'])).rows[0].ok,true);
  await db.query('select reconcile_ai_cost($1,$2,10,$3)',[owner,id,'fixture-invoice']);
  assert.equal((await db.query('select jsonb_array_length(cost_reconciliations) n from ai_budget_requests where request_id=$1',[id])).rows[0].n,1);
  await db.exec('reset role');await db.query('delete from conversations where id=$1',[conversation]);assert.equal((await db.query('select count(*) n from ai_response_cache')).rows[0].n,0);assert.equal((await db.query('select count(*) n from ai_budget_requests')).rows[0].n,1);
  const plan={code:'pro',maxLevel:4,allowedTiers:['economy','premium'],allowImage:true,allowWeb:true,dailyRequests:100,dailyTokens:1e7,monthlyTokens:1e7,monthlyCostMicrousd:10000};
  await db.exec('set role service_role');const observed=new Date().toISOString();
  await db.query('select sync_apple_subscription($1,$2::jsonb,now()+interval \'1 hour\',$3::timestamptz)',[owner,JSON.stringify(plan),observed]);
  assert.equal((await db.query('select plan_code from account_limits where user_id=$1',[owner])).rows[0].plan_code,'pro');
  await db.query('select sync_apple_subscription($1,null,null,$2::timestamptz)',[owner,new Date(Date.now()-10000).toISOString()]);assert.equal((await db.query('select plan_code from account_limits where user_id=$1',[owner])).rows[0].plan_code,'pro','stale snapshot cannot downgrade');
  id=await reserve();await db.query("select bind_ai_execution($1,$2,'zeus',1,3)",[owner,id]);
  await db.exec('reset role');await db.query('update account_limits set subscription_expires_at=now()-interval \'1 second\' where user_id=$1',[owner]);await db.exec('set role service_role');assert.equal((await permit(id,1)).reason,'subscription_expired');
  const a=crypto.randomUUID(),b=crypto.randomUUID(),g=crypto.randomUUID();await db.query('insert into artifacts values($1,$3),($2,$3)',[a,b,owner]);await db.query("insert into image_workflow_assets(artifact_id,owner_id,group_id,prompt,provider,model,operation) values($1,$3,$4,'p','openai','m','original'),($2,$3,$4,'p','google','m2','compare')",[a,b,owner,g]);
  await db.query('select select_image_version($1,$2)',[owner,a]);await db.query('select select_image_version($1,$2)',[owner,b]);assert.equal((await db.query('select count(*) n from image_workflow_assets where selected')).rows[0].n,1);assert.equal((await db.query('select select_image_version($1,$2) ok',[other,a])).rows[0].ok,false);
  await db.exec('reset role;set role authenticated');await assert.rejects(()=>db.query('select sync_apple_subscription($1,null,null,now())',[owner]),/permission denied/);await assert.rejects(()=>db.query('select * from ai_response_cache'),/permission denied/);
 }finally{await db.close();}
});
