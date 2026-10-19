import {authenticatedOwner,syncSubscription} from './lib/subscriptions.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
 try{const owner=await authenticatedOwner(req);if(!owner)return res.status(401).json({error:'Authentication required.'});return res.status(200).json(await syncSubscription(owner));}
 catch(e){return res.status(e.status||503).json({error:'Subscription verification unavailable. Try again.'});}
}
