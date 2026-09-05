import type {SummaryNode} from "./summary-checkpoints.js";

/** Structural/source coverage validation; this does not judge generated claims. */
export function validateSummaryTree(root:string,nodes:SummaryNode[],sources?:{index:number;start:number;end:number;text:string}[]){
  const byId=new Map(nodes.map(node=>[node.nodeId,node]));
  if(!nodes.length||nodes.length>100||byId.size!==nodes.length||!byId.has(root))throw new Error("Invalid summary node identities");
  const sourceMap=sources?new Map(sources.map(source=>[source.index,source])):undefined;
  if(sources&&sourceMap!.size!==sources.length)throw new Error("Duplicate summary source identities");
  const active=new Set<string>(),seen=new Set<string>(),covered=new Set<number>();
  const visit=(id:string):SummaryNode=>{
    if(active.has(id))throw new Error("Summary hierarchy contains a cycle");
    if(seen.has(id))throw new Error("Summary node has multiple parents");
    const node=byId.get(id);if(!node)throw new Error("Summary child is missing");
    if(!(node.end>node.start)||!node.summary.trim())throw new Error("Invalid summary node range or text");
    if(new Set(node.children).size!==node.children.length||new Set(node.sourceIndices).size!==node.sourceIndices.length)throw new Error("Duplicate summary references");
    active.add(id);seen.add(id);
    if(node.children.length){
      if(node.sourceIndices.length)throw new Error("Summary parent cannot claim direct source indices");
      const children=node.children.map(visit);
      if(node.start!==Math.min(...children.map(child=>child.start))||node.end!==Math.max(...children.map(child=>child.end)))throw new Error("Summary parent range differs from children");
    }else{
      if(!node.sourceIndices.length)throw new Error("Summary leaf has no source references");
      for(const index of node.sourceIndices)covered.add(index);
      if(sourceMap){
        const references=node.sourceIndices.map(index=>sourceMap.get(index));
        if(references.some(source=>!source||!source.text.trim()))throw new Error("Invalid summary source references");
        if(node.start!==Math.min(...references.map(source=>source!.start))||node.end!==Math.max(...references.map(source=>source!.end)))throw new Error("Summary leaf range differs from source references");
      }
    }
    active.delete(id);return node;
  };
  visit(root);
  if(seen.size!==nodes.length)throw new Error("Summary hierarchy contains unreachable nodes");
  if(sources&&sources.some(source=>source.text.trim()&&!covered.has(source.index)))throw new Error("Summary hierarchy omits source references");
}
