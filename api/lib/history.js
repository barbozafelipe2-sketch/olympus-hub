// Adapted from zeus-proxy 33a9478: newest-first, sanitized history selection.
import { redactSecrets } from './budget.js';

// Input: newest-first rows from SELECT ... ORDER BY created_at DESC, id DESC.
// Allocate budget newest-first so old turns never displace recent decisions.
// Output: chronological order, as required by provider chat history formats.
export function selectRecentHistory(rows,{maxChars=18000,perMessageChars=4000}={}){
  const budget=Math.max(0,Math.min(90000,Math.floor(Number(maxChars)||0)));
  const messageCap=Math.max(0,Math.min(16000,Math.floor(Number(perMessageChars)||0)));
  if(!Array.isArray(rows)||!budget||!messageCap)return [];
  const selected=[];
  let remaining=budget;
  // Do not mutate input: these rows may also be used for the owner's history UI.
  for(const item of rows){
    if(item?.role!=='user'&&item?.role!=='assistant')continue;
    // Sanitize BEFORE truncating so a clipped secret cannot bypass redaction.
    const safe=redactSecrets(String(item.content||''));
    if(!safe.trim())continue;
    const content=safe.length>messageCap
      ?safe.slice(0,Math.max(0,messageCap-13))+'\n[truncated]'
      :safe;
    // The current (most recent) message wins; never exceed total budget.
    // Skipping a large old turn preserves room for smaller, more recent context.
    if(content.length>remaining)continue;
    selected.push({role:item.role,content});
    remaining-=content.length;
    if(remaining===0)break;
  }
  return selected.reverse();
}

