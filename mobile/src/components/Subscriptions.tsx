import {useState} from 'react';
import {Linking,Platform,Text,View} from 'react-native';
import Purchases,{type PurchasesPackage} from 'react-native-purchases';
import {Button,C} from '../ui';
import {requireSupabase} from '../lib/supabase';
export function Subscriptions(){
 const [packages,setPackages]=useState<PurchasesPackage[]>([]),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
 async function identity(){
  const key=process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  const {data:{session}}=await requireSupabase().auth.getSession();
  if(Platform.OS!=='ios'||!key||!session)throw Error('Apple subscriptions require an iOS development or App Store build and purchase configuration.');
  if(!await Purchases.isConfigured())Purchases.configure({apiKey:key,appUserID:session.user.id});
  else if(await Purchases.getAppUserID()!==session.user.id)await Purchases.logIn(session.user.id);
  return session;
 }
 async function sync(){
  const session=await identity(),base=process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/,'');
  if(!base)throw Error('API address not configured.');
  const r=await fetch(`${base}/api/subscription`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`},signal:AbortSignal.timeout(20000)});
  const body=await r.json();if(!r.ok)throw Error(body.error||'Could not verify the subscription.');
  setStatus(body.active?`${body.plan} active until ${new Date(body.expiresAt).toLocaleDateString()}`:'Free plan');
 }
 async function run(action:'load'|'restore'|'refresh'|'buy',pkg?:PurchasesPackage){
  setBusy(true);setError('');
  try{await identity();if(action==='load')setPackages((await Purchases.getOfferings()).current?.availablePackages||[]);
   if(action==='buy'&&pkg)await Purchases.purchasePackage(pkg);
   if(action==='restore')await Purchases.restorePurchases();
   await sync();
  }catch(e){if(!(e&&typeof e==='object'&&'userCancelled' in e&&e.userCancelled))setError(e instanceof Error?e.message:'Purchase could not complete.');}finally{setBusy(false);}
 }
 return <View style={{gap:12,paddingVertical:16}}>
  <Text style={{color:C.text,fontSize:20,fontWeight:'700'}}>Subscription</Text>
  <Text style={{color:C.muted}}>Apple handles payment. AI usage is subject to your plan limits. Subscriptions renew automatically unless cancelled in Apple settings.</Text>
  <Button title="View Apple plans" disabled={busy} onPress={()=>void run('load')}/>
  {packages.map(pkg=><View key={pkg.identifier} style={{gap:8}}><Text style={{color:C.text}}>{pkg.product.title} · {pkg.product.priceString}{pkg.product.subscriptionPeriod?` / ${pkg.product.subscriptionPeriod}`:''}</Text><Text style={{color:C.muted}}>{pkg.product.description}</Text><Button title={`Subscribe · ${pkg.product.priceString}`} disabled={busy} onPress={()=>void run('buy',pkg)}/></View>)}
  <Button title="Restore purchases" kind="secondary" disabled={busy} onPress={()=>void run('restore')}/>
  <Button title="Refresh subscription / Try again" kind="secondary" disabled={busy} onPress={()=>void run('refresh')}/>
  <Button title="Manage Apple subscription" kind="quiet" onPress={()=>{void Linking.openURL('https://apps.apple.com/account/subscriptions').catch(()=>setError('Could not open Apple subscriptions.'));}}/>
  <Button title="Apple standard terms" kind="quiet" onPress={()=>{void Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/');}}/>
  {!!status&&<Text style={{color:C.green}}>{status}</Text>}{!!error&&<Text accessibilityRole="alert" style={{color:C.red}}>{error}</Text>}
 </View>;
}
