import { createExecutionAuthorization } from './lib/execution-authorization.js';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { createImageQuote, verifyImageQuote, generateWorkflowImage, workflowPrompt, env } from './lib/image-workflow.js';
import { createBudget, redactSecrets } from './lib/budget.js';
import { makeBudgetClient, reserveQuota, settleQuota } from './lib/quota.js';

const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const error = (code,message,status=400) => Object.assign(new Error(message),{code,status});
async function auth(req) {
  const token=/^Bearer\s+(.+)$/i.exec(req.headers.authorization||'')?.[1];
  if(!token)return null;
  const client=createClient(env('SUPABASE_URL'),env('SUPABASE_PUBLISHABLE_KEY'),{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error:failure}=await client.auth.getUser(token);
  return failure||!data.user?null:{client,ownerId:data.user.id};
}
async function image(client,ownerId,id) {
  if(!uuid(id))throw error('IMAGE_SOURCE_INVALID','Invalid image id.');
  const {data:row,error:failure}=await client.from('artifacts').select('*').eq('id',id).eq('owner_id',ownerId).single();
  if(failure||!row||!/^image\/(png|jpeg|webp)$/.test(row.mime_type))throw error('IMAGE_SOURCE_DENIED','Image unavailable.',404);
  const [{data:asset},{data:version},{data:file}]=await Promise.all([
    client.from('image_workflow_assets').select('*').eq('artifact_id',id).maybeSingle(),
    client.from('artifact_versions').select('content,model,provider').eq('artifact_id',id).eq('version',row.current_version).single(),
    client.from('artifact_files').select('*').eq('artifact_id',id).eq('version',row.current_version).single()
  ]);
  if(!file)throw error('IMAGE_SOURCE_MISSING','Stored image is unavailable.',404);
  return {...row,file,asset,ownerId,groupId:asset?.group_id||id,prompt:redactSecrets(asset?.prompt||version?.content?.replace(/^Generated image prompt:\s*/,'')||''),
    model:asset?.model||String(version?.model||'').split(' + ').at(-1),provider:asset?.provider||({'OpenAI':'openai','OpenRouter':'openrouter','Google AI':'gemini',google:'gemini'}[version?.provider]||version?.provider||'openai'),mimeType:row.mime_type,conversationId:row.conversation_id,projectId:row.project_id};
}
async function ensureAsset(admin,source) {
  if(source.asset)return;
  const {error:failure}=await admin.from('image_workflow_assets').upsert({artifact_id:source.id,owner_id:source.ownerId,group_id:source.groupId,prompt:source.prompt.slice(0,12000),provider:source.provider,model:source.model,operation:'original',source_ids:[]},{onConflict:'artifact_id',ignoreDuplicates:true});
  if(failure)throw error('IMAGE_STORAGE_UNAVAILABLE','Image workspace storage unavailable.',503);
}
async function images(client,admin,ownerId,root) {
  await ensureAsset(admin,root);
  const {data:assets,error:failure}=await client.from('image_workflow_assets').select('*').eq('group_id',root.groupId).eq('owner_id',ownerId).order('created_at',{ascending:true}).limit(40);
  if(failure)throw error('IMAGE_STORAGE_UNAVAILABLE','Image workspace storage unavailable.',503);
  const ids=(assets||[]).map(a=>a.artifact_id);
  const {data:rows}=await client.from('artifacts').select('*').in('id',ids);
  return Promise.all((rows||[]).map(async row=>{
    const s=await image(client,ownerId,row.id);
    const {data}=await client.storage.from(s.file.bucket_id).createSignedUrl(s.file.storage_path,3600);
    return {...row,previewUrl:data?.signedUrl||null,selected:assets.find(a=>a.artifact_id===row.id)?.selected||false,operation:s.asset?.operation||'original',model:s.model};
  }));
}

export default async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  let authenticated,admin,budget,quote,storedId=null,storagePath=null,jobCommitted=false;
  try {
    authenticated=await auth(req);if(!authenticated)return res.status(401).json({error:'Authentication required.'});
    const {client,ownerId}=authenticated;admin=makeBudgetClient();
    if(req.method==='GET'){
      const root=await image(client,ownerId,req.query?.artifactId);
      return res.status(200).json({images:await images(client,admin,ownerId,root),level:2});
    }
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
    const body=req.body||{};
    if(Buffer.byteLength(JSON.stringify(body))>40000)throw error('IMAGE_PAYLOAD_TOO_LARGE','Image request too large.',413);
    if(body.action==='select'){
      const selected=await image(client,ownerId,body.artifactId);await ensureAsset(admin,selected);
      const {data:chosen,error:selectionError}=await admin.rpc('select_image_version',{p_owner_id:ownerId,p_artifact_id:selected.id});
      if(selectionError||!chosen)throw error('IMAGE_SELECTION_FAILED','Could not save selection.',503);
      return res.status(200).json({images:await images(client,admin,ownerId,selected),selectedId:selected.id,calls:0});
    }
    if(body.action==='quote'){
      const ids=Array.isArray(body.sourceIds)?body.sourceIds:[];
      if(ids.length>2)throw error('IMAGE_SOURCE_INVALID','Select at most two images.');
      const sources=await Promise.all(ids.map(id=>image(client,ownerId,id)));
      const source=sources[0];
      const conversationId=source?.conversationId||body.conversationId;
      if(!uuid(conversationId))throw error('IMAGE_SCOPE_REQUIRED','Open a conversation before generating images.');
      const {data:conversation}=await client.from('conversations').select('id,project_id').eq('id',conversationId).eq('owner_id',ownerId).single();
      if(!conversation)throw error('IMAGE_SCOPE_DENIED','Conversation unavailable.',403);
      return res.status(200).json({quote:createImageQuote({ownerId,operation:body.operation,sources,prompt:redactSecrets(body.prompt||''),instructions:redactSecrets(body.instructions||''),conversationId,projectId:conversation.project_id})});
    }
    if(body.action!=='execute'||body.confirm!==true)throw error('IMAGE_CONFIRMATION_REQUIRED','Confirm the quoted action.');
    quote=verifyImageQuote(body.token,ownerId);
    const sources=await Promise.all(quote.sourceIds.map(id=>image(client,ownerId,id)));
    if(sources.some(s=>s.groupId!==quote.groupId||s.conversationId!==quote.conversationId||s.projectId!==quote.projectId))throw error('IMAGE_SOURCE_DENIED','Image source changed.',409);
    const {data:conversation}=await client.from('conversations').select('id').eq('id',quote.conversationId).eq('owner_id',ownerId).single();
    if(!conversation)throw error('IMAGE_SCOPE_DENIED','Conversation unavailable.',403);
    const {data:prior}=await client.from('image_workflow_jobs').select('*').eq('request_id',quote.requestId).eq('owner_id',ownerId).maybeSingle();
    if(prior){
      if(prior.state==='completed'&&prior.artifact_id){const root=await image(client,ownerId,prior.artifact_id);return res.status(200).json({images:await images(client,admin,ownerId,root),replayed:true});}
      throw error('IMAGE_REQUEST_ALREADY_ACCEPTED','This action was already accepted. Refresh images before retrying.',409);
    }
    const quota=await reserveQuota(admin,{ownerId,requestId:quote.requestId,fingerprint:createHash('sha256').update(body.token).digest('hex'),maxCalls:1,kind:'image',mode:'zeus'});
    if(!quota?.allowed)throw error('IMAGE_BUDGET_LIMIT','Image budget unavailable or action already accepted.',429);
    const authorization=createExecutionAuthorization({client:admin,ownerId,requestId:quote.requestId,quota,requestedMode:'zeus',isImage:true,hasWeb:false,imageRoute:quote.route});
    budget=createBudget({maxCalls:1,timeoutMs:65000,authorizeAttempt:authorization.authorizeAttempt});
    await authorization.bindImage();
    const {error:claimError}=await admin.from('image_workflow_jobs').insert({owner_id:ownerId,request_id:quote.requestId,state:'running'});
    if(claimError)throw error('IMAGE_STORAGE_UNAVAILABLE','Could not reserve image workspace.',503);
    const references=quote.operation==='combine'?await Promise.all(sources.map(async s=>{
      const {data,error:downloadError}=await client.storage.from(s.file.bucket_id).download(s.file.storage_path);
      if(downloadError||!data)throw error('IMAGE_SOURCE_MISSING','A reference image is missing.',404);
      if(data.size>8*1024*1024)throw error('IMAGE_TOO_LARGE','Reference exceeds 8 MB.',413);
      return {bytes:new Uint8Array(await data.arrayBuffer()),mimeType:s.mimeType};
    })):[];
    const event=await budget.reserveAuthorized('capability:generate_image',quote.route.provider,quote.route.model,Math.min(24000,workflowPrompt(quote).length),4096,{tier:'capability',inputBytes:Buffer.byteLength(workflowPrompt(quote))});
    let generated;
    try { generated=await generateWorkflowImage({route:quote.route,prompt:workflowPrompt(quote),references,signal:budget.signal});budget.complete(event,{model:generated.model,usage:generated.usage ? {reported:Number.isSafeInteger(generated.usage.total_tokens),totalTokens:generated.usage.total_tokens} : null},null); }
    catch(failure){budget.complete(event,null,failure);throw failure;}
    const {data:created,error:creationError}=await client.rpc('create_artifact_with_version',{p_project_id:quote.projectId,p_conversation_id:quote.conversationId,p_title:quote.operation==='compare'?'Comparison image':quote.operation==='combine'?'Combined interpretation':'Generated image',p_kind:'image',p_mime_type:generated.mimeType,p_content:'Generated image prompt:\n'+quote.originalPrompt,p_provider:generated.provider,p_model:generated.model,p_request_id:quote.requestId});
    if(creationError||!created?.[0]?.artifact_id)throw error('IMAGE_STORAGE_FAILED','Could not save the image.',503);
    storedId=created[0].artifact_id;
    const ext=generated.mimeType==='image/jpeg'?'jpg':generated.mimeType==='image/webp'?'webp':'png';
    storagePath=`${ownerId}/${storedId}/1.${ext}`;
    const {error:uploadError}=await client.storage.from('artifact-files').upload(storagePath,generated.bytes,{contentType:generated.mimeType,upsert:false});
    if(uploadError)throw error('IMAGE_STORAGE_FAILED','Could not save the image.',503);
    const {error:fileError}=await client.from('artifact_files').insert({artifact_id:storedId,owner_id:ownerId,version:1,storage_path:storagePath,mime_type:generated.mimeType,size_bytes:generated.bytes.length,bucket_id:'artifact-files'});
    if(fileError)throw error('IMAGE_STORAGE_FAILED','Could not save image metadata.',503);
    for(const s of sources)await ensureAsset(admin,s);
    const {error:assetError}=await admin.from('image_workflow_assets').insert({artifact_id:storedId,owner_id:ownerId,group_id:quote.groupId,prompt:quote.originalPrompt,provider:generated.provider,model:generated.model,operation:quote.operation,source_ids:quote.sourceIds});
    if(assetError)throw error('IMAGE_STORAGE_FAILED','Could not save image lineage.',503);
    const {error:jobError}=await admin.from('image_workflow_jobs').update({state:'completed',artifact_id:storedId}).eq('owner_id',ownerId).eq('request_id',quote.requestId);
    if(jobError)throw error('IMAGE_STORAGE_FAILED','Could not finalize image action.',503);
    jobCommitted=true;
    await settleQuota(admin,{ownerId,requestId:quote.requestId,budget});
    const root=await image(client,ownerId,storedId);storedId=null;storagePath=null;
    return res.status(201).json({images:await images(client,admin,ownerId,root),level:2,calls:1});
  }catch(failure){
    if(authenticated&&storedId&&!jobCommitted){if(storagePath)await authenticated.client.storage.from('artifact-files').remove([storagePath]).catch(()=>{});await authenticated.client.from('artifacts').delete().eq('id',storedId).catch(()=>{});}
    if(budget&&quote&&!jobCommitted){await admin.from('image_workflow_jobs').update({state:'failed'}).eq('owner_id',authenticated.ownerId).eq('request_id',quote.requestId).catch(()=>{});await settleQuota(admin,{ownerId:authenticated.ownerId,requestId:quote.requestId,budget,failed:true}).catch(()=>{});}
    return res.status(Number(failure.status)||502).json({error:failure.code?.startsWith('IMAGE_')?failure.message:'Image action could not complete. Existing images were preserved.',code:failure.code||'IMAGE_WORKFLOW_FAILED'});
  }finally{budget?.close();}
}
