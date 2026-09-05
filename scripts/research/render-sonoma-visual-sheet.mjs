import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(path.resolve('.avid-mcp-analysis/models/runtime/package.json')),sharp=require('sharp');
const evidence=JSON.parse(await readFile('.avid-mcp-analysis/sonoma-library-20260905/visual-shots.json','utf8'));
if(evidence.samples.length!==32)throw new Error('Expected fixed 32-sample development set');
const layers=[];
for(const sample of evidence.samples){
  const x=(sample.index%4)*320,y=Math.floor(sample.index/4)*204;
  layers.push({input:await sharp(sample.image).resize(320,180,{fit:'contain'}).toBuffer(),left:x,top:y});
  layers.push({input:Buffer.from(`<svg width="320" height="24"><rect width="320" height="24" fill="white"/><text x="5" y="18" font-size="16">${sample.index} - ${sample.time.toFixed(3)}s</text></svg>`),left:x,top:y+180});
}
const output=path.resolve('.avid-mcp-analysis/sonoma-visual-benchmark-sheet.png');await sharp({create:{width:1280,height:1632,channels:3,background:'white'}}).composite(layers).png().toFile(output);console.log(output);
