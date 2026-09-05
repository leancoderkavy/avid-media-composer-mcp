import {mkdtemp,writeFile,unlink,readFile} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {it,expect,vi,beforeEach} from "vitest";
import {MediaSummaries,summaryChunks} from "../src/library/summaries.js";
import {MediaLibrary} from "../src/library/media-library.js";
import {loadConfig} from "../src/config.js";
const inference=vi.hoisted(()=>vi.fn());
beforeEach(()=>{inference.mockReset();inference.mockResolvedValue([{summary_text:"Generated test summary"}]);});
vi.mock("../src/library/model-runtime.js",()=>({modelRuntime:async()=>({pipeline:async()=>Object.assign(inference,{tokenizer:async()=>({input_ids:{dims:[1,100]}}),dispose:async()=>{}})})}));
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
  expect(root.sources.map(source=>source.index)).toEqual([0,1]);expect(root.sourceScope).toBe("descendant_leaves");
  expect(leaf.sources.map(source=>source.index)).toEqual([0]);expect(leaf.sourceScope).toBe("direct_leaf");
  expect(root.sources[0]?.text).toBe("source words ".repeat(250));
  await writeFile(transcript.path,JSON.stringify({id,segments:[{start:0,end:2,text:"changed"}]}));await expect(summaries.node(saved.revision)).rejects.toThrow("provenance");
});
it("permits discovery and deletion after transcript removal while protecting source scope",async()=>{
  const {id,config,transcript,summaries}=await fixture(),saved=await summaries.generate(id,transcript.revision);await unlink(transcript.path);
  const list=await summaries.list(id);expect(list.summaries).toHaveLength(1);await expect(summaries.node(saved.revision)).rejects.toThrow();
  await expect(new MediaSummaries({...config,allowedRoots:[]}).list(id)).rejects.toThrow();
  await expect(summaries.remove(saved.revision,"wrong")).rejects.toThrow("changed");expect((await summaries.remove(saved.revision,list.summaries[0]!.sha256)).deleted).toBe(true);
});
it("reuses an interrupted prefix after restart and validates the final output",async()=>{
  const {id,config,transcript,summaries}=await fixture();inference.mockResolvedValueOnce([{summary_text:"First committed node."}]).mockRejectedValueOnce(new Error("interrupted"));
  await expect(summaries.generate(id,transcript.revision)).rejects.toMatchObject({code:"SUMMARY_INCOMPLETE"});
  const [partial]=(await summaries.runs(id)).runs;expect(partial).toMatchObject({state:"partial",completedNodes:1});
  const directory=await new MediaLibrary(config).directory(),checkpoint=path.join(directory,`summary-run-${partial!.runId}`,"0.json"),original=await readFile(checkpoint,"utf8");
  await expect(summaries.checkpoints.append(partial!.runId,0,JSON.parse(original))).rejects.toMatchObject({code:"EEXIST"});
  const resumed=await new MediaSummaries(config).resume(partial!.runId);expect(resumed.reusedNodes).toBe(1);expect(inference).toHaveBeenCalledTimes(resumed.nodes+1);
  expect(await readFile(checkpoint,"utf8")).toBe(original);expect(await summaries.runStatus(resumed.runId)).toMatchObject({state:"completed",completedNodes:resumed.nodes});
  await expect(summaries.resume(resumed.runId)).rejects.toThrow("completed");
  const output=path.join(directory,`summary-${resumed.revision}.json`),record=JSON.parse(await readFile(output,"utf8"));record.nodes[0].summary="Changed summary.";await writeFile(output,JSON.stringify(record));
  await expect(summaries.runStatus(resumed.runId)).rejects.toThrow("differs");
});
it("rejects incompatible transcript, input checkpoints and scope without rewriting the parent",async()=>{
  const {id,config,transcript,summaries}=await fixture();inference.mockResolvedValueOnce([{summary_text:"Saved."}]).mockRejectedValueOnce(new Error("stop"));await expect(summaries.generate(id,transcript.revision)).rejects.toThrow();
  const run=(await summaries.runs(id)).runs[0]!.runId;await expect(new MediaSummaries({...config,allowedRoots:[]}).resume(run)).rejects.toThrow();
  const directory=await new MediaLibrary(config).directory(),file=path.join(directory,`summary-run-${run}`,"0.json"),original=await readFile(file,"utf8"),record=JSON.parse(original);record.inputHash="0".repeat(64);await writeFile(file,JSON.stringify(record));
  await expect(summaries.resume(run)).rejects.toThrow("input changed");await writeFile(file,original);
  await writeFile(transcript.path,JSON.stringify({id,segments:[{start:0,end:2,text:"Different transcript"}]}));await expect(summaries.resume(run)).rejects.toThrow("changed");expect(await readFile(file,"utf8")).toBe(original);
});
it("keeps healthy runs discoverable after an older transcript is deleted",async()=>{
  const {id,config,transcript,summaries}=await fixture(),old=await summaries.generate(id,transcript.revision);
  const newer=await new MediaLibrary(config).importTranscript(id,[{start:0,end:10,text:"New editorial notes."}]),current=await summaries.generate(id,newer.revision);
  await unlink(transcript.path);
  const first=await summaries.runs(id,undefined,1);expect(first.nextAfter).not.toBeNull();const second=await summaries.runs(id,first.nextAfter!,1);expect(second.nextAfter).toBeNull();
  const rows=[...first.runs,...second.runs];expect(rows).toHaveLength(2);expect(rows.find(run=>run.runId===old.runId)).toMatchObject({state:"unavailable",problem:{code:"PATH_NOT_FOUND"}});expect(rows.find(run=>run.runId===current.runId)).toMatchObject({state:"completed"});
  await expect(summaries.runStatus(old.runId)).rejects.toThrow();await expect(new MediaSummaries({...config,allowedRoots:[]}).runs(id)).rejects.toThrow();
});
