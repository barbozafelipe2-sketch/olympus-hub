export const feedFixture = () => ({data:[
 ['openai/gpt-4.1-mini',0.4,1.6],['openai/gpt-5-mini',0.25,2],
 ['anthropic/claude-haiku-4-5',1,5],['anthropic/claude-sonnet-4-5',3,15],['google/gemini-2.5-flash',0.3,2.5]
].map(([id,input,output])=>({id,context_length:128000,architecture:{input_modalities:['text'],output_modalities:['text']},pricing:{prompt:String(input/1e6),completion:String(output/1e6),request:'0'}}))});
export const fixturePrice = (input=0.4,output=1.6,request=0) => ({input,output,request,source:'fixture',fetchedAt:Date.now(),expiresAt:Date.now()+3600000});
