import {mkdtemp,mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {randomUUID} from "node:crypto";
import {it,expect} from "vitest";
import {VisualSearch,sampleTimes,VISUAL_MODEL,VISUAL_REVISION} from "../src/library/visual.js";
import {loadConfig} from "../src/config.js";
it("samples bounded source ranges uniformly and rejects invalid coverage before inference",()=>{
  expect(sampleTimes(100,3,{start:20,end:50})).toEqual([25,35,45]);
  expect(sampleTimes(100,120)).toHaveLength(120);
  expect(()=>sampleTimes(100,121)).toThrow();expect(()=>sampleTimes(100,5,{start:90,end:101})).toThrow();
  expect(()=>sampleTimes(100,5,{start:20,end:20})).toThrow();
});
it("paginates half-open sample scope without loading models or returning embeddings",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"avid-visual-")),directory=path.join(root,"avid-mcp-library");await mkdir(directory);
  const id="a".repeat(64),source=path.join(root,"source.mp4"),image=path.join(directory,"frame.jpg");await writeFile(source,"fixture");await writeFile(image,"image");
  await writeFile(path.join(directory,`${id}.json`),JSON.stringify({id,file:source,metadata:{format:{duration:10}},transcript:[]}));
  const indexId=randomUUID();await writeFile(path.join(directory,`visual-${indexId}.json`),JSON.stringify({model:VISUAL_MODEL,revision:VISUAL_REVISION,samples:[1,2,3,4].map(time=>({id,time,image,shot:{start:time-0.5,end:time+0.5},vector:Array(512).fill(0)}))}));
  const config=loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root}),visual=new VisualSearch(config);
  const first=await visual.samples(indexId,{ids:[id],range:{start:2,end:4}},-1,1);expect(first.samples[0]?.time).toBe(2);expect(first.nextAfter).toBe(1);expect(first.samples[0]).not.toHaveProperty("vector");
  const next=await visual.samples(indexId,{range:{start:2,end:4}},first.nextAfter!,1);expect(next.samples[0]?.time).toBe(3);expect(next.nextAfter).toBeNull();
  expect(next.samples[0]?.shot).toEqual({start:2.5,end:3.5});
  await expect(new VisualSearch({...config,allowedRoots:[]}).samples(indexId)).rejects.toThrow();
});
