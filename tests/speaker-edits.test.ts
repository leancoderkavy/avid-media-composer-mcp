import {it,expect} from "vitest";
import {applySpeakerEdits} from "../src/library/speaker-edits.js";
it("applies ordered edits without modifying their input and supports removing every detected span",()=>{
  const original=[{spanId:"span-1",start:1,end:2,speaker:"speaker-1"},{spanId:"span-2",start:2,end:3,speaker:"speaker-2"}],before=JSON.stringify(original);
  const result=applySpeakerEdits(original,[{action:"merge",from:"speaker-2",into:"speaker-1"},{action:"replace",spanId:"span-2",start:0,end:0.5,speaker:"speaker-3"}],{start:0,end:3});expect(result.map(span=>span.spanId)).toEqual(["span-2","span-1"]);expect(result[1]?.speaker).toBe("speaker-1");expect(JSON.stringify(original)).toBe(before);
  expect(applySpeakerEdits(original,[{action:"remove",spanId:"span-1"},{action:"remove",spanId:"span-2"}],{start:0,end:3})).toEqual([]);
});
it("refuses reversed intervals and overflow instead of dropping spans",()=>{
  expect(()=>applySpeakerEdits([],[{action:"add",start:2,end:1,speaker:"speaker-1"}],{start:0,end:3})).toThrow();
  const original=Array.from({length:5000},(_,index)=>({spanId:`span-${index+1}`,start:0,end:1,speaker:"speaker-1"}));expect(()=>applySpeakerEdits(original,[{action:"add",start:0,end:1,speaker:"speaker-2"}],{start:0,end:2})).toThrow("limit");expect(original).toHaveLength(5000);
});
