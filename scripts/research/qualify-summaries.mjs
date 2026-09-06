import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {loadConfig} from '../../dist/config.js';
import {MediaLibrary} from '../../dist/library/media-library.js';
import {MediaSummaries} from '../../dist/library/summaries.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const config=loadConfig({AVID_MCP_ALLOWED_ROOTS:'D:/Sonoma Escape Edit',AVID_MCP_OUTPUT_ROOT:'.avid-mcp-analysis/sonoma-library-20260905',AVID_MCP_MODEL_DIR:'.avid-mcp-analysis/models',AVID_MCP_CAPABILITIES:'inspect,project-write'});
const library=new MediaLibrary(config),summaries=new MediaSummaries(config),id='3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca';
const texts=[
  'The editing team reviewed the travel film and planned a shorter version. They wanted to keep the opening landscape and remove repeated shots. The reviewer asked for a clear introduction before the walking sequence. The music should continue beneath the first scene, with dialogue kept audible. No export was approved at this meeting.',
  'The team discussed the ending separately. They agreed to compare two closing shots and prepare a draft for review. The first version should use the wide landscape, while the second should end with the group walking away. The editor will label both versions clearly. The original media and existing project should remain available for comparison.',
];
try{
  // Synthetic editorial notes tied to real indexed media, not a claimed transcript of its audio.
  const segments=Array.from({length:10},(_,i)=>({start:i*10,end:i*10+9,text:texts[i<5?0:1]}));
  const transcript=await library.importTranscript(id,segments),started=Date.now(),saved=await summaries.generate(id,transcript.revision),root=await summaries.node(saved.revision);
  assert.ok(root.node.summary.length>10);assert.ok(root.children.length>=2);
  const child=await summaries.node(saved.revision,root.children[0].nodeId);assert.ok(child.sources.length>0);assert.equal(child.sources[0].text,texts[0]);
  const discovered=await summaries.list(id);assert.ok(discovered.summaries.some(s=>s.revision===saved.revision));
  assert.equal(await sha256File('D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4'),id);
  await writeFile('.avid-mcp-analysis/sonoma-library-20260905/summaries.json',JSON.stringify({transcript,saved,root,child,elapsedMs:Date.now()-started,sourceUnchanged:true,scope:'Synthetic review notes; factual summarization accuracy requires review'},null,2));
  console.log(JSON.stringify({passed:true,nodes:saved.nodes,summary:root.node.summary,elapsedMs:Date.now()-started}));
}finally{await summaries.dispose();}
