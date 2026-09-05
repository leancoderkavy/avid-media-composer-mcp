import {it,expect} from "vitest";
import {validateSummaryTree} from "../src/library/summary-tree.js";
import type {SummaryNode} from "../src/library/summary-checkpoints.js";
const sources=[{index:0,start:0,end:2,text:"First source."},{index:1,start:3,end:5,text:"Second source."}];
function tree():SummaryNode[]{return [
  {nodeId:"a",start:0,end:2,summary:"First.",mayBeTruncated:false,children:[],sourceIndices:[0]},
  {nodeId:"b",start:3,end:5,summary:"Second.",mayBeTruncated:false,children:[],sourceIndices:[1]},
  {nodeId:"root",start:0,end:5,summary:"Overview.",mayBeTruncated:false,children:["a","b"],sourceIndices:[]},
];}
it("accepts connected provenance without claiming factual accuracy",()=>{
  expect(()=>validateSummaryTree("root",tree(),sources)).not.toThrow();expect(()=>validateSummaryTree("root",tree())).not.toThrow();
});
it("rejects cycles, duplicate edges and unreachable nodes",()=>{
  const cyclic=tree();cyclic[2]!.children=["a","root"];expect(()=>validateSummaryTree("root",cyclic,sources)).toThrow("cycle");
  const duplicate=tree();duplicate[2]!.children=["a","a"];expect(()=>validateSummaryTree("root",duplicate,sources)).toThrow("Duplicate");
  const orphan=tree();orphan.push({...orphan[0]!,nodeId:"orphan"});expect(()=>validateSummaryTree("root",orphan,sources)).toThrow("unreachable");
});
it("rejects invented ranges, missing source coverage and malformed leaf references",()=>{
  const parent=tree();parent[2]!.end=6;expect(()=>validateSummaryTree("root",parent,sources)).toThrow("parent range");
  const leaf=tree();leaf[0]!.end=1;expect(()=>validateSummaryTree("root",leaf,sources)).toThrow("leaf range");
  expect(()=>validateSummaryTree("root",tree(),[...sources,{index:2,start:6,end:7,text:"Omitted source."}])).toThrow("omits");
  const missing=tree();missing[0]!.sourceIndices=[99];expect(()=>validateSummaryTree("root",missing,sources)).toThrow("source references");
});
