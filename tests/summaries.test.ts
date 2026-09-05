import {mkdtemp,writeFile,unlink} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {it,expect,vi} from "vitest";
import {MediaSummaries,summaryChunks} from "../src/library/summaries.js";
import {MediaLibrary} from "../src/library/media-library.js";
import {loadConfig} from "../src/config.js";
vi.mock("../src/library/model-runtime.js",()=>({modelRuntime:async()=>({pipeline:async()=>Object.assign(async()=>[{summary_text:"Generated test summary"}],{tokenizer:async()=>({input_ids:{dims:[1,100]}}),dispose:async()=>{}})})}));
async function fixture(){
  const root=await mkdtemp(path.join(os.tmpdir(),"avid-summary-")),source=path.join(root,"source.mp4"),id="a".repeat(64);await writeFile(source,"fixture");
  const config=loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:root,AVID_MCP_CAPABILITIES:"inspect,project-write"}),library=new MediaLibrary(config),directory=await library.directory();
  await writeFile(path.join(directory,`${id}.json`),JSON.stringify({id,file:source,metadata:{format:{duration:20}},transcript:[]}));
  const transcript=await library.importTranscript(id,[{start:0,end:10,text:"source words ".repeat(250)},{start:10,end:20,text:"other words ".repeat(200)}]);return {id,config,transcript,summaries:new MediaSummaries(config)};
}
it("bounds summary chunks without silently dropping long source segments",()=>{
  const text="a".repeat(5001),chunks=summaryChunks([{start:0,end:1,index:0,text}]);expect(chunks.map(c=>c.text).join("")).toBe(text);expect(chunks).toHaveLength(3);
  expect(()=>summaryChunks([])).toThrow();expect(()=>summaryChunks([{start:0,end:1,index:0,text:"a".repeat(130000)}])).toThrow();
});
it("builds a hierarchy with leaf references and refuses changed transcript provenance",async()=>{
  const {id,transcript,summaries}=await fixture();const saved=await summaries.generate(id,transcript.revision),root=await summaries.node(saved.revision);
  expect(root.children.length).toBeGreaterThan(1);const leaf=await summaries.node(saved.revision,root.children[0]!.nodeId);expect(leaf.sources[0]?.index).toBe(0);expect(root.factualEntailmentVerified).toBe(false);
  await writeFile(transcript.path,JSON.stringify({id,segments:[{start:0,end:2,text:"changed"}]}));await expect(summaries.node(saved.revision)).rejects.toThrow("provenance");
});
it("permits discovery and deletion after transcript removal while protecting source scope",async()=>{
  const {id,config,transcript,summaries}=await fixture(),saved=await summaries.generate(id,transcript.revision);await unlink(transcript.path);
  const list=await summaries.list(id);expect(list.summaries).toHaveLength(1);await expect(summaries.node(saved.revision)).rejects.toThrow();
  await expect(new MediaSummaries({...config,allowedRoots:[]}).list(id)).rejects.toThrow();
  await expect(summaries.remove(saved.revision,"wrong")).rejects.toThrow("changed");expect((await summaries.remove(saved.revision,list.summaries[0]!.sha256)).deleted).toBe(true);
});
