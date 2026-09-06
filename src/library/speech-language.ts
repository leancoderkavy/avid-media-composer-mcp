import {speechLanguages} from "./speech-options.js";

/** Rank only language tokens. Softmax scores are not calibrated confidence. */
export function rankSpeechLanguages(logits:unknown,languageTokens:unknown){
  const tensor=logits as {dims?:number[];data?:unknown};
  if(tensor?.dims?.length!==3||tensor.dims[0]!==1||tensor.dims[1]!==1||!(tensor.data instanceof Float32Array)||tensor.dims[2]!==tensor.data.length||tensor.data.length>100000)throw new Error("Unexpected language logits");
  if(!languageTokens||typeof languageTokens!=="object"||Array.isArray(languageTokens))throw new Error("Missing language token map");
  const seen=new Set<number>(),data=tensor.data;
  const ranked=Object.entries(languageTokens).map(([token,id])=>{
    const language=/^<\|([a-z]{2,3})\|>$/.exec(token)?.[1];
    if(!language||language==="auto"||!speechLanguages.includes(language as typeof speechLanguages[number])||!Number.isInteger(id)||id<0||id>=data.length||seen.has(id))throw new Error("Invalid language token map");
    seen.add(id);const logit=data[id]!;if(!Number.isFinite(logit))throw new Error("Nonfinite language score");return {language,logit};
  });
  if(ranked.length!==speechLanguages.length-1)throw new Error("Incomplete language token map");
  ranked.sort((a,b)=>b.logit-a.logit||a.language.localeCompare(b.language));const maximum=ranked[0]!.logit,total=ranked.reduce((sum,row)=>sum+Math.exp(row.logit-maximum),0);
  return ranked.slice(0,5).map(row=>({language:row.language,modelProbability:Math.exp(row.logit-maximum)/total}));
}
