import {MediaSummaries} from "./summaries.js";
import {MediaQc} from "./qc.js";
import {ShotDetection} from "./shots.js";
import {MediaLibrary} from "./media-library.js";
import {VisualSearch} from "./visual.js";
import {SpeechAnalysis} from "./speech.js";
import {People} from "./people.js";
import {jobSchema} from "./jobs.js";
import type {ServerConfig} from "../config.js";
let input="";
for await(const chunk of process.stdin){input+=chunk.toString();if(input.length>1024*1024)throw new Error("Worker input exceeds limit");}
try{
  const payload=JSON.parse(input);
  const config:ServerConfig={...payload.config,capabilities:new Set(payload.config.capabilities)};
  const spec=jobSchema.parse(payload.spec);
  const library=new MediaLibrary(config);
  let result;
  switch(spec.kind){
    case "shots":result=await new ShotDetection(config).detect(spec.id,spec.options);break;
    case "summary":result=await new MediaSummaries(config).generate(spec.id,spec.transcriptRevision);break;
    case "qc":result=await new MediaQc(config).analyze(spec.id,spec.options);break;
    case "index":result=await library.index(spec.files);break;
    case "visual":result=await new VisualSearch(config).index(spec.ids,spec.samples,spec.range);break;
    case "speech":result=await new SpeechAnalysis(config).transcribe(spec.id,spec.start,spec.end);break;
    case "people":result=await new People(config).index(spec.ids,spec.samples,spec.threshold);break;
    case "artifact":result=await library.artifact(spec.id,spec.format,spec.start,spec.end);break;
  }
  console.log(JSON.stringify(result));
}catch(error){console.error((error as Error).message);process.exitCode=1;}
