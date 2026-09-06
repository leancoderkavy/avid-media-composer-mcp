import {mkdtemp,mkdir,writeFile,readFile} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {randomUUID} from "node:crypto";
import {it,expect,vi,beforeEach} from "vitest";
import {VisualSummaries} from "../src/library/visual-summaries.js";
import {FrameCaptions,CAPTION_MODEL,CAPTION_REVISION,CAPTION_TASK} from "../src/library/captions.js";
import {MediaLibrary} from "../src/library/media-library.js";
import {loadConfig} from "../src/config.js";
import {sha256File} from "../src/analysis/file-inventory.js";
const inference=vi.hoisted(()=>vi.fn());
vi.mock("../src/library/model-runtime.js",()=>({modelRuntime:async()=>({pipeline:async()=>Object.assign(inference,{tokenizer:async()=>({input_ids:{dims:[1,100]}}),dispose:async()=>{}})})}));
beforeEach(()=>{inference.mockReset();inference.mockResolvedValue([{summary_text:"Generated overview."}]);});
async function fixture(){
 const root=await mkdtemp(path.join(os.tmpdir(),"avid-visual-summary-")),source=path.join(root,"source.mp4");await writeFile(source,"source");const id=await sha256File(source);
 const config=loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:root,AVID_MCP_CAPABILITIES:"inspect,project-write"}),directory=await new MediaLibrary(config).directory(),captions=new FrameCaptions(config);
 await writeFile(path.join(directory,`${id}.json`),JSON.stringify({id,file:source,metadata:{format:{duration:20},streams:[{codec_type:"video"}]},transcript:[]}));
 const references=[];for(let i=0;i<5;i++){const captionId=randomUUID(),dir=path.join(directory,`caption-${captionId}`);await mkdir(dir);await writeFile(path.join(dir,"frame.jpg"),"image");await writeFile(path.join(dir,"caption.json"),JSON.stringify({schema:1,captionId,revision:randomUUID(),id,time:i+1,imageSha256:await sha256File(path.join(dir,"frame.jpg")),model:CAPTION_MODEL,modelRevision:CAPTION_REVISION,task:CAPTION_TASK,runtime:"4.2.0",dtype:"q4",machineText:`Caption ${i}.`,text:`Caption ${i}.`,edited:false,mayBeTruncated:false,createdAt:new Date().toISOString()}));references.push({captionId,sha256:(await captions.read(captionId)).sha256});}
 return {id,config,source,directory,captions,references,summaries:new VisualSummaries(config)};
}
it("builds a deterministic hierarchy preserving caption leaves and all descendant sources",async()=>{
 const f=await fixture(),saved=await f.summaries.generate(f.id,f.references),overview=await f.summaries.node(saved.revision);
 expect(saved.nodes).toBe(8);expect(inference).toHaveBeenCalledTimes(3);expect(overview.sources.map(source=>source.captionId)).toEqual(f.references.map(ref=>ref.captionId));expect(overview.node).toMatchObject({firstSampleTime:1,lastSampleTime:5,children:["n5","n6"],generated:true});expect(overview.factualEntailmentVerified).toBe(false);
 const leaf=await f.summaries.node(saved.revision,"n0");expect(leaf.node).toMatchObject({text:"Caption 0.",firstSampleTime:1,lastSampleTime:1,generated:false});expect(leaf.sources).toHaveLength(1);expect(await sha256File(f.source)).toBe(f.id);
});
it("rejects changed references but permits orphan discovery and checksum deletion",async()=>{
 const f=await fixture(),saved=await f.summaries.generate(f.id,f.references);
 const corrected=await f.captions.correct(f.references[0]!.captionId,f.references[0]!.sha256,"Reviewed caption.");
 await expect(f.summaries.node(saved.revision)).rejects.toThrow("provenance");
 const reviewed=await f.summaries.generate(f.id,[{captionId:corrected.captionId,sha256:corrected.sha256},...f.references.slice(1)]);
 expect((await f.summaries.node(reviewed.revision,"n0")).node.text).toBe("Reviewed caption.");
 const list=await f.summaries.list(f.id);const previous=list.summaries.find(row=>row.revision===saved.revision)!;expect(previous).toMatchObject({revision:saved.revision,provenanceVerified:false});
 await expect(f.summaries.remove(saved.revision,"0".repeat(64))).rejects.toThrow("changed");
 expect(await f.summaries.remove(saved.revision,previous.sha256)).toMatchObject({deleted:true,captionsModified:false});
 expect((await f.captions.list(f.id)).captions).toHaveLength(5);expect(await sha256File(f.source)).toBe(f.id);
});
it("rejects malformed hierarchy and incorrect leaf text",async()=>{
 const f=await fixture(),saved=await f.summaries.generate(f.id,f.references),file=path.join(f.directory,`visual-summary-${saved.revision}.json`),original=JSON.parse(await readFile(file,"utf8"));
 const changed=structuredClone(original);changed.nodes[7].children=["n7"];await writeFile(file,JSON.stringify(changed));await expect(f.summaries.node(saved.revision)).rejects.toThrow("structure");
 original.nodes[0].text="Invented caption.";await writeFile(file,JSON.stringify(original));await expect(f.summaries.node(saved.revision)).rejects.toThrow("caption text");
});
it("rejects duplicate/unordered references, source scope and writes without permission",async()=>{
 const f=await fixture();await expect(f.summaries.generate(f.id,[f.references[0]!,f.references[0]!])).rejects.toThrow("Duplicate");
 await expect(f.summaries.generate(f.id,[...f.references].reverse())).rejects.toThrow("increasing");
 await expect(new VisualSummaries({...f.config,allowedRoots:[]}).generate(f.id,f.references)).rejects.toThrow();
 await expect(new VisualSummaries({...f.config,capabilities:new Set(["inspect"])}).generate(f.id,f.references)).rejects.toThrow();
 await writeFile(f.source,"changed");await expect(f.summaries.generate(f.id,f.references)).rejects.toThrow("source changed");
});
it("continues bounded discovery past corrupt and unrelated revisions after restart",async()=>{
 const f=await fixture(),saved=await f.summaries.generate(f.id,f.references),damaged="00000000-0000-4000-8000-000000000001",other="00000000-0000-4000-8000-000000000002";
 const file=path.join(f.directory,`visual-summary-${saved.revision}.json`),hash=await sha256File(file);
 await writeFile(path.join(f.directory,`visual-summary-${damaged}.json`),"PRIVATE_BAD_CONTENT");await writeFile(path.join(f.directory,`visual-summary-${other}.json`),JSON.stringify({id:"b".repeat(64),private:"UNRELATED_CONTENT"}));
 const first=await f.summaries.list(f.id,"",1);expect(first.summaries).toEqual([]);expect(first.unavailable).toMatchObject([{revision:damaged,mediaIdentityVerified:false}]);expect(first.nextAfter).toBe(damaged);
 const restored=new VisualSummaries({...f.config,modelDirectory:undefined}),second=await restored.list(f.id,first.nextAfter!,1);expect(second.summaries).toEqual([]);expect(second.unavailable).toEqual([]);expect(second.nextAfter).toBe(other);
 const third=await restored.list(f.id,second.nextAfter!,1);expect(third.summaries[0]!.revision).toBe(saved.revision);expect(third.nextAfter).toBeNull();expect(JSON.stringify([first,second,third])).not.toMatch(/PRIVATE_BAD_CONTENT|UNRELATED_CONTENT/);
 expect(await sha256File(file)).toBe(hash);expect(await sha256File(f.source)).toBe(f.id);await expect(new VisualSummaries({...f.config,allowedRoots:[]}).list(f.id)).rejects.toThrow();
});
