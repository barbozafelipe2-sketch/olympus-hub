import {useState} from 'react';
import {requireSupabase} from '../lib/supabase';
import {imageWorkflowRequest,type WorkflowImage,type ImageQuote,type ImageAction} from '../lib/imageWorkflow';
export function ImageWorkflow({artifactId}:{artifactId:string}) {
 const [images,setImages]=useState<WorkflowImage[]>([]),[chosen,setChosen]=useState<string[]>([artifactId]);
 const [instructions,setInstructions]=useState(''),[quote,setQuote]=useState<ImageQuote|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function request(body:Record<string,unknown>|null) {
  const {data:{session}}=await requireSupabase().auth.getSession();
  if(!session)throw Error('Sign in again.');
  return imageWorkflowRequest('',session.access_token,body,artifactId);
 }
 async function run(body:Record<string,unknown>|null){
  setBusy(true);setError('');
  try{const data=await request(body);if(data.images)setImages(data.images);if(data.quote)setQuote(data.quote);if(body?.action==='execute')setQuote(null);}
  catch(e){setError(e instanceof Error?e.message:'Image action failed.');}finally{setBusy(false);}
 }
 const estimate=(operation:ImageAction)=>void run({action:'quote',operation,sourceIds:operation==='compare'?[chosen[0]||artifactId]:chosen,instructions});
 return <div className="image-workflow">
  <button disabled={busy} onClick={()=>void run(null)}>Show versions</button>
  <div className="image-version-grid">{images.map(img=><label key={img.id}>
   <input type="checkbox" checked={chosen.includes(img.id)} disabled={busy} onChange={()=>{setChosen(v=>v.includes(img.id)?v.filter(id=>id!==img.id):[...v.slice(-1),img.id]);setQuote(null);}}/>
   {img.previewUrl&&<img src={img.previewUrl} alt={img.title} loading="lazy"/>}<span>{img.model}{img.selected?' · Selected':''}</span>
   <button disabled={busy} onClick={()=>void run({action:'select',artifactId:img.id})}>Choose this image</button>
  </label>)}</div>
  <button disabled={busy||chosen.length!==1} onClick={()=>estimate('compare')}>Comparison</button>
  <label>What should Combine keep from each image?<textarea value={instructions} maxLength={2000} onChange={e=>{setInstructions(e.target.value);setQuote(null);}}/></label>
  <button disabled={busy||chosen.length!==2||!instructions.trim()} onClick={()=>estimate('combine')}>Combine</button>
  {quote&&<div role="status"><p>{quote.model} · {quote.costLabel}</p><button disabled={busy} onClick={()=>void run({action:'execute',token:quote.token,confirm:true})}>Confirm generation</button><button onClick={()=>setQuote(null)} disabled={busy}>Cancel</button></div>}
  {busy&&<p role="status">Processing image…</p>}
  {error&&<div role="alert"><p>{error}</p><button disabled={busy} onClick={()=>void run(null)}>Try again / refresh versions</button><p>For a new paid attempt, request Comparison or Combine again.</p></div>}
 </div>;
}
