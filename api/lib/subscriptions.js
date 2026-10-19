import {createClient} from '@supabase/supabase-js';
import {timingSafeEqual} from 'node:crypto';
import {makeBudgetClient} from './quota.js';
export const subscriptionError=(message,status=503)=>Object.assign(new Error(message),{status});
export function validWebhook(header){
 const expected=process.env.REVENUECAT_WEBHOOK_AUTHORIZATION;
 return typeof expected==='string'&&expected.length>=24&&typeof header==='string'&&Buffer.byteLength(header)===Buffer.byteLength(expected)&&timingSafeEqual(Buffer.from(header),Buffer.from(expected));
}
export async function authenticatedOwner(req){
 const token=/^Bearer\s+(.+)$/i.exec(req.headers.authorization||'')?.[1];
 if(!token)return null;
 const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await client.auth.getUser(token);return error?null:data.user?.id;
}
export function subscriptionPlans(){
 let raw;try{raw=JSON.parse(process.env.OLYHUB_SUBSCRIPTION_PLANS_JSON||'{}');}catch{throw subscriptionError('Invalid subscription plans.');}
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw subscriptionError('Invalid subscription plans.');
 for(const [id,p] of Object.entries(raw)){
  const positive=n=>Number.isSafeInteger(n)&&n>0;
  if(!id||!p||!positive(p.monthlyCostMicrousd)||!positive(p.netMonthlyRevenueMicrousd)||p.monthlyCostMicrousd>p.netMonthlyRevenueMicrousd*(1-(p.minimumMargin??0.5))||!Number.isFinite(p.minimumMargin??0.5)||(p.minimumMargin??0.5)<0.1||(p.minimumMargin??0.5)>=1||!positive(p.dailyRequests)||!positive(p.dailyTokens)||!positive(p.monthlyTokens)||![1,2,3,4].includes(p.maxLevel)||!Array.isArray(p.allowedTiers)||!p.allowedTiers.length||p.allowedTiers.some(t=>!['economy','premium'].includes(t))||typeof p.allowImage!=='boolean'||typeof p.allowWeb!=='boolean')throw subscriptionError('Subscription budget or margin is invalid.');
 }
 return raw;
}
export async function syncSubscription(ownerId,{client=makeBudgetClient(),fetcher=fetch}={}){
 const key=process.env.REVENUECAT_SECRET_API_KEY;if(!key)throw subscriptionError('Subscriptions are not configured.');
 const response=await fetcher('https://api.revenuecat.com/v1/subscribers/'+encodeURIComponent(ownerId),{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw subscriptionError('Subscription verification unavailable.');
 const data=await response.json(),subscriber=data?.subscriber;
 if(!Number.isSafeInteger(data.request_date_ms)||Math.abs(data.request_date_ms-Date.now())>60000)throw subscriptionError('Subscription snapshot is stale.');
 if(!subscriber||typeof subscriber.entitlements!=='object'||typeof subscriber.subscriptions!=='object')throw subscriptionError('Invalid subscription response.');
 const plans=subscriptionPlans();let selected=null,expiresAt=null;
 for(const [entitlement,grant] of Object.entries(subscriber.entitlements)){
  const plan=plans[entitlement],expires=Date.parse(grant.expires_date),subscription=subscriber.subscriptions[grant.product_identifier];
  if(!plan||!Number.isFinite(expires)||expires<=Date.now()||!subscription||subscription.store!=='app_store'||subscription.refunded_at||subscription.is_sandbox&&process.env.REVENUECAT_ALLOW_SANDBOX!=='true')continue;
  if(!selected||plan.maxLevel>selected.maxLevel||plan.maxLevel===selected.maxLevel&&plan.monthlyCostMicrousd>selected.monthlyCostMicrousd){selected={...plan,code:entitlement};expiresAt=new Date(expires).toISOString();}
 }
 const {data:result,error}=await client.rpc('sync_apple_subscription',{p_owner_id:ownerId,p_plan:selected,p_expires_at:expiresAt,p_observed_at:new Date(data.request_date_ms).toISOString()});
 if(error||!result)throw subscriptionError('Could not update subscription.');
 return {plan:selected?.code||'free',expiresAt,active:!!selected};
}
