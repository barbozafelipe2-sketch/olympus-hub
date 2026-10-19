export type WorkflowImage = {id:string;title:string;model:string;previewUrl:string|null;selected:boolean};
export type ImageQuote = {token:string;model:string;costLabel:string;expiresAt:number};
export type ImageAction = 'compare'|'combine';
export async function imageWorkflowRequest(base:string,token:string,body:Record<string,unknown>|null,artifactId?:string) {
  const response=await fetch(`${base}/api/image-workflow${body?'':`?artifactId=${encodeURIComponent(artifactId||'')}`}`,{
    method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(85000)
  });
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Image action failed.');
  return data as {images?:WorkflowImage[];quote?:ImageQuote};
}
