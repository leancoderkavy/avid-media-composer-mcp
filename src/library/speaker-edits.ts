import * as z from "zod/v4";
import {randomUUID} from "node:crypto";
export const speakerLabel=z.string().regex(/^speaker-[1-9][0-9]{0,3}$/);
const spanId=z.union([z.string().regex(/^span-[1-9][0-9]{0,3}$/),z.string().regex(/^added-[a-f0-9-]{36}$/).refine(value=>z.string().uuid().safeParse(value.slice(6)).success)]);
export const speakerSpan=z.object({spanId,start:z.number().nonnegative(),end:z.number().positive(),speaker:speakerLabel}).strict().refine(value=>value.end>value.start,"Speaker span end must follow start");
export const speakerEdits=z.array(z.discriminatedUnion("action",[
  z.object({action:z.literal("replace"),spanId,start:z.number().nonnegative(),end:z.number().positive(),speaker:speakerLabel}).strict(),
  z.object({action:z.literal("remove"),spanId}).strict(),
  z.object({action:z.literal("add"),start:z.number().nonnegative(),end:z.number().positive(),speaker:speakerLabel}).strict(),
  z.object({action:z.literal("merge"),from:speakerLabel,into:speakerLabel}).strict(),
])).min(1).max(1000);
export function applySpeakerEdits(original:z.infer<typeof speakerSpan>[],input:z.input<typeof speakerEdits>,range:{start:number;end:number}){
  const edits=speakerEdits.parse(input),spans=new Map(original.map(span=>[span.spanId,{...span}]));
  for(const edit of edits){
    if(edit.action==="merge"){
      if(edit.from===edit.into||![...spans.values()].some(span=>span.speaker===edit.from)||![...spans.values()].some(span=>span.speaker===edit.into))throw new Error("Merge requires two distinct existing speaker labels");
      for(const [id,span] of spans)if(span.speaker===edit.from)spans.set(id,{...span,speaker:edit.into});
    }else if(edit.action==="remove"){
      if(!spans.delete(edit.spanId))throw new Error("Speaker span missing");
    }else{
      if(edit.action==="replace"&&!spans.has(edit.spanId))throw new Error("Speaker span missing");
      const span=speakerSpan.parse({spanId:edit.action==="add"?`added-${randomUUID()}`:edit.spanId,start:edit.start,end:edit.end,speaker:edit.speaker});
      if(span.start<range.start||span.end>range.end)throw new Error("Corrected speaker span exceeds analyzed source range");spans.set(span.spanId,span);
    }
    if(spans.size>5000)throw new Error("Speaker span limit exceeded");
  }
  return [...spans.values()].sort((a,b)=>a.start-b.start||a.end-b.end||a.spanId.localeCompare(b.spanId));
}
