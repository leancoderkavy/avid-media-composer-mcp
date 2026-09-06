import {it,expect} from "vitest";
import {rankSpeechLanguages} from "../src/library/speech-language.js";
import {speechLanguages} from "../src/library/speech-options.js";
function fixture(){const languages=speechLanguages.filter(code=>code!=="auto"),tokens=Object.fromEntries(languages.map((language,index)=>[`<|${language}|>`,index])),data=new Float32Array(100);data[tokens["<|zh|>"]!]=10;return {tokens,logits:{dims:[1,1,100],data}};}
it("ranks only the complete language vocabulary with finite bounded model probabilities",()=>{
  const {tokens,logits}=fixture();logits.data[99]=1000;
  const result=rankSpeechLanguages(logits,tokens);expect(result[0]?.language).toBe("zh");expect(result).toHaveLength(5);expect(result[0]!.modelProbability).toBeGreaterThan(0.99);expect(result.every(row=>row.modelProbability>0&&row.modelProbability<=1)).toBe(true);
});
it("rejects incompatible logits, incomplete maps and nonfinite or repeated token scores",()=>{
  const {tokens,logits}=fixture();expect(()=>rankSpeechLanguages({...logits,dims:[1,2,50]},tokens)).toThrow("logits");
  expect(()=>rankSpeechLanguages(logits,{...tokens,"<|en|>":-1})).toThrow("token map");
  expect(()=>rankSpeechLanguages(logits,{...tokens,"<|en|>":tokens["<|zh|>"]})).toThrow("token map");
  const missing={...tokens};delete missing["<|en|>"];expect(()=>rankSpeechLanguages(logits,missing)).toThrow("Incomplete");
  logits.data[tokens["<|zh|>"]!]=NaN;expect(()=>rankSpeechLanguages(logits,tokens)).toThrow("Nonfinite");
});
