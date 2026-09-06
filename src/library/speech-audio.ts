/** Decode before trimming so delayed streams and discontinuous packet clocks
 * remain aligned with the source timeline. Late ranges may decode preceding media. */
export function speechAudioArguments(source:string,output:string,start:number,end:number){
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end-start>600)throw new Error("Invalid speech audio range");
  return ["-nostdin","-v","error","-n","-protocol_whitelist","file,pipe","-t",String(end),"-i",source,"-map","0:a:0","-af",`aresample=16000:async=1:first_pts=0,atrim=start=${start}:end=${end},asetpts=PTS-${start}/TB`,"-t",String(end-start),"-vn","-ac","1","-ar","16000","-f","f32le",output];
}
