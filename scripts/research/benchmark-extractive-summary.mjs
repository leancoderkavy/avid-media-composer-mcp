// Original research candidate: sentence selection with source offsets, no model.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const fixtures=JSON.parse(await readFile(new URL('./fixtures/summary-evidence.json',import.meta.url),'utf8'));
fixtures.push({name:'reinstated-identical-instruction',text:'Use version two. Cancel that instruction. Use version two.',reviewCriteria:['Preserve the final reinstatement of version two','Do not collapse the later instruction into the earlier cancelled occurrence']});
const root=path.resolve('.avid-mcp-analysis',`extractive-summary-${randomUUID()}`);await mkdir(root);
const stop=new Set('a an the and or of to for in on at is are was were be been with it its this that as by from will must so but'.split(' '));
const words=text=>new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu)??[]).filter(w=>!stop.has(w)));
const segmenter=new Intl.Segmenter('en',{granularity:'sentence'});
const results=[];
for(const fixture of fixtures){
 const began=performance.now();
 const sentences=[...segmenter.segment(fixture.text)].map(s=>({start:s.index,end:s.index+s.segment.trimEnd().length,text:s.segment.trimEnd()})).filter(s=>s.text.trim());
 assert.ok(sentences.length<=256);
 const unique=sentences.filter((s,i)=>sentences.findIndex(t=>t.text===s.text)===i);
 const tokens=unique.map(s=>words(s.text)),frequency=new Map();
 for(const terms of tokens)for(const term of terms)frequency.set(term,(frequency.get(term)??0)+1);
 const remaining=new Set(unique.map((_,i)=>i)),chosen=[];let characters=0;
 while(remaining.size&&chosen.length<5){
  let winner=-1,best=-Infinity;
  for(const i of remaining){
   if(characters+unique[i].text.length>600)continue;
   const terms=tokens[i],salience=[...terms].reduce((sum,t)=>sum+Math.log1p(frequency.get(t)),0)/Math.sqrt(Math.max(1,terms.size));
   let redundancy=0;for(const selected of chosen){const other=tokens[selected],overlap=[...terms].filter(t=>other.has(t)).length;redundancy=Math.max(redundancy,overlap/Math.max(1,terms.size+other.size-overlap));}
   const score=salience*(1-redundancy);if(score>best){best=score;winner=i;}
  }
  if(winner<0)break;chosen.push(winner);characters+=unique[winner].text.length;remaining.delete(winner);
 }
 const excerpts=chosen.sort((a,b)=>a-b).map(i=>unique[i]);
 for(const excerpt of excerpts)assert.equal(fixture.text.slice(excerpt.start,excerpt.end),excerpt.text);
 results.push({fixture:fixture.name,sourceSha256:createHash('sha256').update(fixture.text).digest('hex'),reviewCriteria:fixture.reviewCriteria,sourceCharacters:fixture.text.length,selectedCharacters:characters,sourceSentences:sentences.length,distinctSentences:unique.length,excerpts,omittedOccurrences:sentences.filter(s=>!excerpts.some(e=>e.start===s.start)),omittedDistinctSentences:unique.filter((_,i)=>!chosen.includes(i)).map(s=>s.text),exactSourceSpans:true,elapsedMs:performance.now()-began});
}
await writeFile(path.join(root,'evidence.json'),JSON.stringify({recipe:'sentence-salience-diversity-v1',budget:{characters:600,sentences:5},fixtures,results,scope:'Research-only English sentence selection. Exact source spans do not establish context preservation, coverage or current decision status. No production behavior changed.'},null,2),{flag:'wx'});
console.log(JSON.stringify({root,results:results.map(r=>({fixture:r.fixture,selected:r.excerpts.map(e=>e.text),omitted:r.omittedDistinctSentences}))}));
