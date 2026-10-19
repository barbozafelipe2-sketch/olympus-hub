import {validWebhook,syncSubscription} from './lib/subscriptions.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
 if(!validWebhook(req.headers.authorization))return res.status(401).json({error:'Unauthorized.'});
 const event=req.body?.event;
 if(!event||typeof event.id!=='string'||event.id.length>200)return res.status(400).json({error:'Invalid event.'});
 const candidates=event.type==='TRANSFER'?[...(event.transferred_from||[]),...(event.transferred_to||[])]:[event.app_user_id];
 const owners=[...new Set(candidates.filter(id=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)))];
 if(owners.length>20)return res.status(400).json({error:'Invalid event.'});
 try{const results=await Promise.allSettled(owners.map(owner=>syncSubscription(owner)));if(results.some(r=>r.status==='rejected'))throw Error('Retry synchronization');return res.status(200).json({received:true});}
 catch{return res.status(503).json({error:'Subscription synchronization unavailable; retry delivery.'});}
}
