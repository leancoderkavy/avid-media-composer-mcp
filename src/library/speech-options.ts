import * as z from "zod/v4";

export const speechModel=z.enum(["tiny.en","tiny","base"]);
export const speechModels={
  "tiny.en":{model:"onnx-community/whisper-tiny.en",revision:"2575352d61be1bf7225cf8f8b268a4678025fc58",multilingual:false},
  tiny:{model:"onnx-community/whisper-tiny",revision:"ff4177021cc41f7db950912b73ea4fdf7d01d8e7",multilingual:true},
  base:{model:"onnx-community/whisper-base",revision:"1846881b6b3a3024392c1eea3ad983695bc23925",multilingual:true},
} as const;
// Language tokens from the pinned multilingual generation_config.json.
export const speechLanguages=["auto","af","am","ar","as","az","ba","be","bg","bn","bo","br","bs","ca","cs","cy","da","de","el","en","es","et","eu","fa","fi","fo","fr","gl","gu","haw","ha","he","hi","hr","ht","hu","hy","id","is","it","ja","jw","ka","kk","km","kn","ko","la","lb","ln","lo","lt","lv","mg","mi","mk","ml","mn","mr","ms","mt","my","ne","nl","nn","no","oc","pa","pl","ps","pt","ro","ru","sa","sd","si","sk","sl","sn","so","sq","sr","su","sv","sw","ta","te","tg","th","tk","tl","tr","tt","uk","ur","uz","vi","yi","yo","zh"] as const;
export const speechOptions=z.object({model:speechModel.default("tiny.en"),language:z.enum(speechLanguages).default("auto")}).strict().refine(value=>value.model!=="tiny.en"||["auto","en"].includes(value.language),"Non-English language selection requires a multilingual model");
export type SpeechOptions=z.input<typeof speechOptions>;
export const speechLanguageDecision=z.object({
  language:z.enum(speechLanguages).refine(value=>value!=="auto"),
  selection:z.enum(["model_candidate","explicit","english_only_model","english_fallback"]),
  candidates:z.array(z.object({language:z.enum(speechLanguages).refine(value=>value!=="auto"),modelProbability:z.number().min(0).max(1)}).strict()).max(5).default([]),
  analyzedSeconds:z.number().positive().max(30).optional(),
}).strict().refine(value=>value.selection!=="model_candidate"||(value.candidates.length===5&&value.candidates[0]?.language===value.language&&value.analyzedSeconds!==undefined),"Auto language decision requires ranked evidence");
export function validSpeechDecision(options:z.output<typeof speechOptions>,decision:z.output<typeof speechLanguageDecision>){
  if(decision.selection==="english_only_model")return options.model==="tiny.en"&&decision.language==="en";
  if(!speechModels[options.model].multilingual)return false;
  if(decision.selection==="explicit")return options.language!=="auto"&&options.language===decision.language;
  if(options.language!=="auto")return false;
  if(decision.selection==="english_fallback")return decision.language==="en";
  return new Set(decision.candidates.map(row=>row.language)).size===decision.candidates.length&&decision.candidates.every((row,index)=>index===0||row.modelProbability<=decision.candidates[index-1]!.modelProbability);
}
