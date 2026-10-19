import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizationDb } from './helpers/authorization-db.js';
test('persistent admission binds a plan and atomically rechecks each paid attempt',async()=>{
 const db=await authorizationDb(),owner=crypto.randomUUID(),other=crypto.randomUUID();
 const event=(role='lead',mode='zeus',tier='economy')=>({attemptId:crypto.randomUUID(),role,mode,tier,provider:'openai',model:'fixture',inputChars:100,outputTokens:20});
 const admin=async sql=>{await db.exec('reset role');await db.exec(sql);await db.exec('set role service_role');};
 const reserve=async(calls=3,extra={},kind='text')=>{
  const id=crypto.randomUUID(),limits={engine:'zeus',maxCalls:calls,allowOlympus:false,allowWeb:false,dailyRequests:100,dailyTokens:1e7,monthlyTokens:1e7,...extra};
  const r=(await db.query('select reserve_ai_budget($1,$2,$3,$4,$5::jsonb,$6) as r',[owner,id,'a'.repeat(64),calls*100096,JSON.stringify(limits),kind])).rows[0].r;
  return {id,result:r};
 };
 const bind=async(id,mode='zeus',level=1,calls=3)=>(await db.query('select bind_ai_execution($1,$2,$3,$4,$5) as r',[owner,id,mode,level,calls])).rows[0].r;
 const gate=async(id,e,who=owner)=>(await db.query('select authorize_ai_attempt($1,$2,$3::jsonb) as r',[who,id,JSON.stringify(e)])).rows[0].r;
 const settle=async(id,trace=[])=>(await db.query('select settle_ai_budget($1,$2,120,false,$3::jsonb) as ok',[owner,id,JSON.stringify(trace)])).rows[0].ok;
 try {
  await db.query('insert into auth.users values ($1),($2)',[owner,other]);await db.query('insert into account_limits(user_id) values ($1),($2)',[owner,other]);await db.exec('set role service_role');
  let q=await reserve();assert.equal(q.result.allowed,true);assert.equal(q.result.authorizationPolicy.maxLevel,4);
  assert.equal((await gate(q.id,event())).reason,'role_not_allowed');
  const router=event('router');assert.equal((await gate(q.id,router)).allowed,true);
  assert.equal((await gate(q.id,router)).reason,'attempt_already_authorized');
  assert.equal((await gate(q.id,event('router'))).reason,'role_not_allowed');
  assert.equal((await bind(q.id)).allowed,true);assert.equal((await bind(q.id)).reason,'execution_already_bound');
  assert.equal((await gate(q.id,event('director'))).reason,'role_not_allowed');
  assert.equal((await gate(q.id,event(),other)).reason,'reservation_inactive');
  const concurrent=await Promise.all([event(),event(),event()].map(e=>gate(q.id,e)));
  assert.equal(concurrent.filter(r=>r.allowed).length,2);assert.equal(concurrent.filter(r=>r.reason==='execution_budget_exhausted').length,1);
  assert.equal(await settle(q.id),true);assert.equal((await gate(q.id,event())).reason,'reservation_inactive');
  q=await reserve();await bind(q.id);
  await admin(`update account_limits set allowed_model_tiers=array['economy'] where user_id='${owner}'`);
  assert.equal((await gate(q.id,event('lead','zeus','premium'))).reason,'model_tier_not_allowed');
  await admin(`update account_limits set status='blocked' where user_id='${owner}'`);
  assert.equal((await gate(q.id,event())).reason,'account_not_active');await settle(q.id);
  await admin(`update account_limits set status='active',olympus_entitled=true,allowed_model_tiers=array['economy','premium'] where user_id='${owner}'`);
  q=await reserve(6,{allowOlympus:true,allowWeb:true});assert.equal(q.result.allowed,true);
  const trace=[event('router')];assert.equal((await gate(q.id,trace[0])).allowed,true);
  assert.equal((await bind(q.id,'olympus',4,6)).allowed,true);
  for(const role of ['capability:web_search','specialist-1','specialist-2','director','ceo']){
   const e=event(role,'olympus',role.startsWith('capability:')?'capability':'premium');trace.push(e);assert.equal((await gate(q.id,e)).allowed,true,role);
  }
  assert.equal(await settle(q.id,trace),true,'six-call traces must settle');
  q=await reserve(3,{allowOlympus:true});await bind(q.id,'olympus',3,3);
  await admin(`update account_limits set olympus_entitled=false where user_id='${owner}'`);
  assert.equal((await gate(q.id,event('author','olympus'))).reason,'olympus_not_entitled');await settle(q.id);
  q=await reserve();await bind(q.id);
  await admin(`update ai_budget_requests set expires_at=now()-interval '1 second' where owner_id='${owner}' and request_id='${q.id}'`);
  assert.equal((await gate(q.id,event())).reason,'reservation_inactive');await settle(q.id);
  q=await reserve();await bind(q.id);
  await admin(`update account_limits set daily_token_limit=1 where user_id='${owner}'`);
  assert.equal((await gate(q.id,event())).reason,'budget_limit_changed');await settle(q.id);
  await admin(`update account_limits set daily_token_limit=null where user_id='${owner}'`);
  q=await reserve();await bind(q.id,'zeus',2,3);
  await admin(`update account_limits set max_execution_level=1 where user_id='${owner}'`);
  assert.equal((await gate(q.id,event('author'))).reason,'plan_level_not_allowed');await settle(q.id);
  await admin(`update account_limits set max_execution_level=4 where user_id='${owner}'`);
  q=await reserve(1,{},'image');assert.equal(q.result.allowed,true);assert.equal((await bind(q.id,'zeus',2,1)).allowed,true);
  assert.equal((await gate(q.id,event('capability:generate_image','zeus','capability'))).allowed,true);await settle(q.id);
  await admin(`update account_limits set allow_image=false,allow_web=false where user_id='${owner}'`);
  assert.equal((await reserve(1,{},'image')).result.reason,'image_not_allowed');
  assert.equal((await reserve(3,{allowWeb:true})).result.reason,'web_not_allowed');
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.exec('set role authenticated');
  await assert.rejects(()=>gate(q.id,event()),/permission denied/);await assert.rejects(()=>bind(q.id),/permission denied/);
  await assert.rejects(()=>db.exec('update account_limits set max_execution_level=4'),/permission denied/);
 }finally{await db.close();}
});
