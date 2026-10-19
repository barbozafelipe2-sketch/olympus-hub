import {hasAiProviderConsent} from "../lib/ai-consent";
import {useState} from 'react';
import {Alert,Image,Text,TextInput,View} from 'react-native';
import {Button,C} from '../ui';
import {requireSupabase} from '../lib/supabase';
import {imageWorkflowRequest,type WorkflowImage,type ImageQuote} from '../lib/imageWorkflow';
export function ImageWorkflow({artifactId}:{artifactId:string}) {
 const [images,setImages]=useState<WorkflowImage[]>([]),[chosen,setChosen]=useState<string[]>([artifactId]);
 const [instructions,setInstructions]=useState(''),[quote,setQuote]=useState<ImageQuote|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function run(body:Record<string,unknown>|null){
  setBusy(true);setError('');
  try{
   const base=process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/,'');
   const {data:{session}}=await requireSupabase().auth.getSession();
   if(!session||!base)throw Error('Sign in and configure the API address.');
   if(body?.action==='execute'&&!hasAiProviderConsent(session.user.id))throw Error('Allow AI data sharing in Settings before generating.');
   const data=await imageWorkflowRequest(base,session.access_token,body,artifactId);
   if(data.images)setImages(data.images);if(data.quote)setQuote(data.quote);if(body?.action==='execute')setQuote(null);
  }catch(e){setError(e instanceof Error?e.message:'Image action failed.');}finally{setBusy(false);}
 }
 function confirm(){if(!quote)return;Alert.alert('Generate another image?',`${quote.model}\n${quote.costLabel}`,[{text:'Cancel',style:'cancel'},{text:'Generate',onPress:()=>void run({action:'execute',token:quote.token,confirm:true})}]);}
 return <View style={{gap:10}}>
  <Button title="Show versions" disabled={busy} onPress={()=>void run(null)}/>
  {images.map(img=><View key={img.id} style={{gap:8}}>
   {img.previewUrl&&<Image source={{uri:img.previewUrl}} accessibilityLabel={img.title} style={{width:'100%',height:240}} resizeMode="contain"/>}
   <Text style={{color:C.text}}>{img.model}{img.selected?' · Selected':''}</Text>
   <Button title={chosen.includes(img.id)?'Remove from comparison selection':'Add to comparison selection'} kind="secondary" disabled={busy} onPress={()=>{setChosen(v=>v.includes(img.id)?v.filter(id=>id!==img.id):[...v.slice(-1),img.id]);setQuote(null);}}/>
   <Button title="Choose this image" disabled={busy} onPress={()=>void run({action:'select',artifactId:img.id})}/>
  </View>)}
  <Button title="Comparison" disabled={busy||chosen.length!==1} onPress={()=>void run({action:'quote',operation:'compare',sourceIds:chosen})}/>
  <TextInput accessibilityLabel="What to keep from each image" placeholder="What should Combine keep from each image?" placeholderTextColor={C.muted} style={{color:C.text,padding:12,borderWidth:1,borderColor:C.line}} multiline maxLength={2000} value={instructions} onChangeText={value=>{setInstructions(value);setQuote(null);}}/>
  <Button title="Combine" disabled={busy||chosen.length!==2||!instructions.trim()} onPress={()=>void run({action:'quote',operation:'combine',sourceIds:chosen,instructions})}/>
  {quote&&<><Text style={{color:C.text}}>{quote.model} · {quote.costLabel}</Text><Button title="Confirm generation" disabled={busy} onPress={confirm}/></>}
  {busy&&<Text style={{color:C.text}}>Processing image…</Text>}
  {!!error&&<><Text accessibilityRole="alert" style={{color:C.red}}>{error}</Text><Button title="Try again / refresh versions" disabled={busy} onPress={()=>void run(null)}/><Text style={{color:C.muted}}>For a new paid attempt, request Comparison or Combine again.</Text></>}
 </View>;
}
