/**
 * Metadata-only timecode continuity over indexed media. Reads declared container/stream
 * timecode, nominal frame rate and frame counts from cached probe metadata. Nothing is
 * decoded and no camera, clip or media identity is inferred.
 */
const TIMECODE=/^(\d{2}):(\d{2}):(\d{2})([:;])(\d{2})$/;
const MAX_NOMINAL_RATE=120;
type Stream=Record<string,unknown>;
export interface ContinuityEntry {id:string;file:string;metadata:Record<string,any>}
export interface ParsedTimecode {frames:number;dropFrame:boolean;nominalRate:number}
type FileStatus="assessed"|"missing_timecode"|"invalid_timecode"|"missing_frame_count"|"unsupported_rate";
type Source="format"|"stream"|"tmcd";
export interface ContinuityFile {id:string;file:string;status:FileStatus;timecode:string|null;source:Source|null;frameRate:string|null;nominalRate:number|null;dropFrame:boolean|null;frameCount:number|null;startFrame:number|null;endFrame:number|null;endTimecode:string|null;endExceedsDay:boolean|null}
export interface ContinuityPair {fromId:string;toId:string;relation:"contiguous"|"gap"|"overlap"|"incomparable";frames:number|null;seconds:number|null;reason?:string}

function rate(declaration:unknown){
  if(typeof declaration!=="string")return null;
  const match=/^(\d+)\/(\d+)$/.exec(declaration.trim());if(!match)return null;
  const numerator=Number(match[1]),denominator=Number(match[2]);
  if(!denominator||!numerator)return null;
  const value=numerator/denominator;
  if(!Number.isFinite(value)||value<=0||value>MAX_NOMINAL_RATE)return null;
  const nominal=Math.round(value);
  // Drop-frame numbering only exists for the 29.97/59.94 families.
  const dropCapable=denominator===1001&&(numerator===30000||numerator===60000);
  return {nominal,dropCapable,dropPerMinute:nominal===60?4:2};
}
export function parseTimecode(timecode:string,frameRate:string):ParsedTimecode|null{
  const match=TIMECODE.exec(timecode.trim()),declared=rate(frameRate);
  if(!match||!declared)return null;
  const hours=Number(match[1]),minutes=Number(match[2]),seconds=Number(match[3]),dropFrame=match[4]===";",frames=Number(match[5]);
  const {nominal}=declared;
  if(minutes>59||seconds>59||frames>=nominal)return null;
  if(dropFrame&&!declared.dropCapable)return null;
  const totalMinutes=hours*60+minutes;
  if(!dropFrame)return {frames:(totalMinutes*60+seconds)*nominal+frames,dropFrame:false,nominalRate:nominal};
  const drop=declared.dropPerMinute;
  if(seconds===0&&minutes%10!==0&&frames<drop)return null; // Those frame numbers are skipped.
  return {frames:(totalMinutes*60+seconds)*nominal+frames-drop*(totalMinutes-Math.floor(totalMinutes/10)),dropFrame:true,nominalRate:nominal};
}
export function formatTimecode(frames:number,nominalRate:number,dropFrame:boolean){
  let adjusted=frames;
  if(dropFrame){
    const drop=nominalRate===60?4:2,perMinute=60*nominalRate-drop,perTenMinutes=10*60*nominalRate-9*drop;
    const tens=Math.floor(frames/perTenMinutes),remainder=frames%perTenMinutes;
    adjusted=frames+drop*9*tens+(remainder<drop?0:drop*Math.floor((remainder-drop)/perMinute));
  }
  const pad=(value:number)=>String(value).padStart(2,"0");
  const ff=adjusted%nominalRate,total=Math.floor(adjusted/nominalRate);
  return `${pad(Math.floor(total/3600))}:${pad(Math.floor(total/60)%60)}:${pad(total%60)}${dropFrame?";":":"}${pad(ff)}`;
}
function tag(container:Stream|undefined){
  const tags=container?.tags;if(!tags||typeof tags!=="object")return undefined;
  for(const [key,value] of Object.entries(tags as Record<string,unknown>))if(key.toLowerCase()==="timecode"&&typeof value==="string")return value;
  return undefined;
}
function declaration(metadata:Record<string,any>):{timecode:string;source:Source}|null{
  const streams:Stream[]=Array.isArray(metadata.streams)?metadata.streams:[];
  const format=tag(metadata.format);if(format!==undefined)return {timecode:format,source:"format"};
  const video=tag(streams.find(stream=>stream.codec_type==="video"));if(video!==undefined)return {timecode:video,source:"stream"};
  const tmcd=tag(streams.find(stream=>stream.codec_tag_string==="tmcd"));if(tmcd!==undefined)return {timecode:tmcd,source:"tmcd"};
  return null;
}
function dayFrames(nominalRate:number,dropFrame:boolean){return dropFrame?24*6*(600*nominalRate-9*(nominalRate===60?4:2)):86400*nominalRate;}
function describe(entry:ContinuityEntry):ContinuityFile{
  const streams:Stream[]=Array.isArray(entry.metadata.streams)?entry.metadata.streams:[];
  const video=streams.find(stream=>stream.codec_type==="video");
  const frameRate=typeof video?.r_frame_rate==="string"?video.r_frame_rate:null;
  const declared=declaration(entry.metadata);
  const base:ContinuityFile={id:entry.id,file:entry.file,status:"assessed",timecode:declared?.timecode??null,source:declared?.source??null,frameRate,nominalRate:null,dropFrame:null,frameCount:null,startFrame:null,endFrame:null,endTimecode:null,endExceedsDay:null};
  const declaredRate=frameRate===null?null:rate(frameRate);
  if(!declaredRate)return {...base,status:"unsupported_rate"};
  base.nominalRate=declaredRate.nominal;
  if(!declared)return {...base,status:"missing_timecode"};
  const parsed=parseTimecode(declared.timecode,frameRate!);
  if(!parsed)return {...base,status:"invalid_timecode"};
  base.dropFrame=parsed.dropFrame;base.startFrame=parsed.frames;
  const raw=video?.nb_frames,count=typeof raw==="string"&&/^\d+$/.test(raw)?Number(raw):typeof raw==="number"?raw:NaN;
  if(!Number.isSafeInteger(count)||count<=0)return {...base,status:"missing_frame_count"};
  base.frameCount=count;base.endFrame=parsed.frames+count;
  base.endTimecode=formatTimecode(base.endFrame,parsed.nominalRate,parsed.dropFrame);
  base.endExceedsDay=base.endFrame>dayFrames(parsed.nominalRate,parsed.dropFrame);
  return base;
}
export function assessTimecodeContinuity(entries:ContinuityEntry[]){
  const files=entries.map(describe).sort((a,b)=>{
    const seconds=(file:ContinuityFile)=>file.startFrame===null?Number.POSITIVE_INFINITY:file.startFrame/file.nominalRate!;
    return seconds(a)-seconds(b)||a.file.localeCompare(b.file);
  });
  const assessed=files.filter(file=>file.status==="assessed"),pairs:ContinuityPair[]=[];
  for(let index=1;index<assessed.length;index++){
    const previous=assessed[index-1]!,next=assessed[index]!;
    if(previous.nominalRate!==next.nominalRate||previous.dropFrame!==next.dropFrame){pairs.push({fromId:previous.id,toId:next.id,relation:"incomparable",frames:null,seconds:null,reason:"Different nominal rate or drop-frame declaration"});continue;}
    const frames=next.startFrame!-previous.endFrame!;
    pairs.push({fromId:previous.id,toId:next.id,relation:frames===0?"contiguous":frames>0?"gap":"overlap",frames,seconds:frames/next.nominalRate!});
  }
  const count=(relation:ContinuityPair["relation"])=>pairs.filter(pair=>pair.relation===relation).length;
  return {files,pairs,summary:{files:files.length,assessed:assessed.length,pairs:pairs.length,contiguous:count("contiguous"),gaps:count("gap"),overlaps:count("overlap"),incomparable:count("incomparable"),unassessed:files.length-assessed.length}};
}
