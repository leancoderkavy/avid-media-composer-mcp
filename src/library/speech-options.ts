import * as z from "zod/v4";

export const speechModel=z.enum(["tiny.en","tiny"]);
export const speechModels={
  "tiny.en":{model:"onnx-community/whisper-tiny.en",revision:"2575352d61be1bf7225cf8f8b268a4678025fc58",multilingual:false},
  tiny:{model:"onnx-community/whisper-tiny",revision:"ff4177021cc41f7db950912b73ea4fdf7d01d8e7",multilingual:true},
} as const;
// Language tokens from the pinned multilingual generation_config.json.
export const speechLanguages=["auto","af","am","ar","as","az","ba","be","bg","bn","bo","br","bs","ca","cs","cy","da","de","el","en","es","et","eu","fa","fi","fo","fr","gl","gu","haw","ha","he","hi","hr","ht","hu","hy","id","is","it","ja","jw","ka","kk","km","kn","ko","la","lb","ln","lo","lt","lv","mg","mi","mk","ml","mn","mr","ms","mt","my","ne","nl","nn","no","oc","pa","pl","ps","pt","ro","ru","sa","sd","si","sk","sl","sn","so","sq","sr","su","sv","sw","ta","te","tg","th","tk","tl","tr","tt","uk","ur","uz","vi","yi","yo","zh"] as const;
export const speechOptions=z.object({model:speechModel.default("tiny.en"),language:z.enum(speechLanguages).default("auto")}).strict().refine(value=>value.model!=="tiny.en"||["auto","en"].includes(value.language),"Non-English language selection requires model tiny");
export type SpeechOptions=z.input<typeof speechOptions>;
