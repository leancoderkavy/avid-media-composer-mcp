const escape=(value:unknown)=>String(value??"Not recorded").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!));
const fields=["index","codec_type","codec_name","profile","width","height","pix_fmt","r_frame_rate","avg_frame_rate","time_base","start_time","duration","color_range","color_space","color_transfer","color_primaries","field_order","sample_rate","sample_fmt","channels","channel_layout","bits_per_raw_sample"];
const tags=new Set(["make","model","manufacturer","camera_model","camera_serial_number","timecode","reel_name","creation_time","com.apple.quicktime.make","com.apple.quicktime.model","com.apple.quicktime.creationdate"]);
function recordedTags(value:unknown){
 if(!value||typeof value!=="object"||Array.isArray(value))return [];
 return Object.entries(value).filter(([key,item])=>tags.has(key.toLowerCase())&&(typeof item==="string"||typeof item==="number"));
}
function table(values:[string,unknown][]){return `<table><thead><tr><th scope="col">Field</th><th scope="col">Recorded value</th></tr></thead><tbody>${values.map(([key,value])=>`<tr><th scope="row">${escape(key)}</th><td>${escape(value)}</td></tr>`).join("")}</tbody></table>`;}
/** Displays probe declarations only; does not infer camera identity or validate media fidelity. */
export function inventoryStreamDetails(metadata:Record<string,unknown>){
 const format=metadata.format as {tags?:unknown}|undefined;
 const containerTags=recordedTags(format?.tags);
 const streams=Array.isArray(metadata.streams)?metadata.streams:[];
 return `<h3>Container camera and timecode tags</h3>${containerTags.length?table(containerTags):"<p>Not recorded.</p>"}<h3>Streams</h3>${streams.map((raw,position)=>{
  const stream=raw&&typeof raw==="object"?raw as Record<string,unknown>:{};
  const values: [string,unknown][]=fields.map(key=>[key,typeof stream[key]==="string"||typeof stream[key]==="number"?stream[key]:null]);
  return `<h4>Stream ${escape(stream.index??position)}</h4>${table(values)}${recordedTags(stream.tags).length?`<h4>Stream tags</h4>${table(recordedTags(stream.tags))}`:""}`;
 }).join("")||"<p>No streams recorded.</p>"}`;
}
