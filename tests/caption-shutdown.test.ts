import {mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {beforeEach,it,expect,vi} from 'vitest';
import {FrameCaptions} from '../src/library/captions.js';
import {MediaLibrary} from '../src/library/media-library.js';
import {loadConfig} from '../src/config.js';
import {sha256File} from '../src/analysis/file-inventory.js';
const model=vi.hoisted(()=>({generate:vi.fn(),dispose:vi.fn(),Tensor:class {dims=[1,2];}}));
vi.mock('../src/process.js',()=>({runProcess:async(_exe:string,args:string[])=>{await writeFile(args.at(-1)!,'frame');return {exitCode:0};}}));
vi.mock('../src/library/model-runtime.js',()=>({modelRuntime:async()=>({
 AutoProcessor:{from_pretrained:async()=>Object.assign(async()=>({}),{construct_prompts:()=>'',batch_decode:()=>['caption'],post_process_generation:()=>({'<MORE_DETAILED_CAPTION>':'Fixture caption'})})},
 Florence2ForConditionalGeneration:{from_pretrained:async()=>({generate:model.generate,dispose:model.dispose})},
 RawImage:{read:async()=>({size:[1,1]})},Tensor:model.Tensor,
})}));
beforeEach(()=>{model.generate.mockReset().mockResolvedValue(new model.Tensor());model.dispose.mockReset();});
async function fixture(){
 const root=await mkdtemp(path.join(os.tmpdir(),'caption-shutdown-')),source=path.join(root,'source.mp4');await writeFile(source,'source');const id=await sha256File(source);
 const config=loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:root,AVID_MCP_CAPABILITIES:'inspect,export,project-write'}),directory=await new MediaLibrary(config).directory();
 await writeFile(path.join(directory,`${id}.json`),JSON.stringify({id,file:source,metadata:{format:{duration:4},streams:[{codec_type:'video'}]},transcript:[]}));return {id,captions:new FrameCaptions(config)};
}
it.each([false,true])('drains queued caption work before disposal (first failure=%s)',async fail=>{
 const {id,captions}=await fixture();let enter!:()=>void,release!:()=>void;
 const entered=new Promise<void>(resolve=>{enter=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
 model.generate.mockImplementationOnce(async()=>{enter();await gate;if(fail)throw new Error('generation failed');return new model.Tensor();});
 const first=captions.generate(id,0).then(result=>({result}),error=>({error}));await entered;
 const queued=captions.generate(id,1),disposal=captions.dispose();expect(captions.dispose()).toBe(disposal);
 await expect(captions.generate(id,2)).rejects.toThrow('closing');expect(model.dispose).not.toHaveBeenCalled();
 release();expect('error' in await first).toBe(fail);expect(await queued).toMatchObject({text:'Fixture caption'});await disposal;
 expect(model.generate).toHaveBeenCalledTimes(2);expect(model.dispose).toHaveBeenCalledOnce();
});
it('retains cleanup failure without disposing twice',async()=>{
 const {id,captions}=await fixture();await captions.generate(id,0);model.dispose.mockRejectedValueOnce(new Error('cleanup failed'));
 await expect(captions.dispose()).rejects.toThrow('cleanup failed');await expect(captions.dispose()).rejects.toThrow('cleanup failed');expect(model.dispose).toHaveBeenCalledOnce();
});
