type Interval={start:number;end:number;speaker:string};
/** Interval arithmetic only. Fractions describe time coverage, never confidence. */
export function alignSpeakerSegment(segment:{start:number;end:number},range:{start:number;end:number},spans:Interval[],candidateLimit=20){
  const start=Math.max(segment.start,range.start),end=Math.min(segment.end,range.end),duration=segment.end-segment.start,inside=Math.max(0,end-start);
  const events:{time:number;speaker:string;delta:number}[]=[];
  for(const span of spans){const a=Math.max(start,span.start),b=Math.min(end,span.end);if(b>a)events.push({time:a,speaker:span.speaker,delta:1},{time:b,speaker:span.speaker,delta:-1});}
  events.sort((a,b)=>a.time-b.time);
  const active=new Map<string,number>(),totals=new Map<string,number>();let previous=start,covered=0,competing=0;
  for(let i=0;i<events.length;){
    const time=events[i]!.time,elapsed=time-previous;
    if(active.size){covered+=elapsed;if(active.size>1)competing+=elapsed;for(const speaker of active.keys())totals.set(speaker,(totals.get(speaker)??0)+elapsed);}
    while(i<events.length&&events[i]!.time===time){const event=events[i++]!,count=(active.get(event.speaker)??0)+event.delta;if(count)active.set(event.speaker,count);else active.delete(event.speaker);}previous=time;
  }
  const ranked=[...totals].map(([speaker,overlapSeconds])=>({speaker,overlapSeconds,fractionOfSegment:Math.min(1,overlapSeconds/duration)})).sort((a,b)=>b.overlapSeconds-a.overlapSeconds||a.speaker.localeCompare(b.speaker));
  return {status:!ranked.length?"no_speech_overlap":competing>0?"overlapping_candidates":ranked.length>1?"multiple_candidates":"single_candidate",candidates:ranked.slice(0,candidateLimit),totalCandidates:ranked.length,candidatesTruncated:ranked.length>candidateLimit,analyzedSeconds:inside,outsideAnalysisSeconds:Math.max(0,duration-inside),speechSeconds:covered,uncoveredSeconds:Math.max(0,inside-covered),simultaneousSpeakerSeconds:competing,speechFractionOfSegment:Math.min(1,covered/duration)};
}
