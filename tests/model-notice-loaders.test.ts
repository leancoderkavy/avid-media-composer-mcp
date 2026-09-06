import {it,expect,vi,beforeEach} from "vitest";
const mocks=vi.hoisted(()=>({notice:vi.fn(),runtime:vi.fn(),load:vi.fn(),pipeline:vi.fn()}));
vi.mock("../src/library/model-notices.js",()=>({installModelNotice:mocks.notice}));
vi.mock("../src/library/model-runtime.js",()=>({modelRuntime:mocks.runtime}));
import {loadVisualModels,VISUAL_MODEL,VISUAL_REVISION} from "../src/library/visual.js";
import {loadSpeechModel} from "../src/library/speech.js";
import {speechModels} from "../src/library/speech-options.js";
import {loadCaptionModel,CAPTION_MODEL,CAPTION_REVISION} from "../src/library/captions.js";
beforeEach(()=>{
 vi.resetAllMocks();mocks.notice.mockResolvedValue({created:true});mocks.load.mockResolvedValue({});mocks.pipeline.mockResolvedValue({});
 const loader={from_pretrained:mocks.load};mocks.runtime.mockResolvedValue({AutoTokenizer:loader,AutoProcessor:loader,CLIPTextModelWithProjection:loader,CLIPVisionModelWithProjection:loader,Florence2ForConditionalGeneration:loader,pipeline:mocks.pipeline});
});
const cases=[
 {name:"visual",load:loadVisualModels,model:VISUAL_MODEL,revision:VISUAL_REVISION},
 {name:"captions",load:loadCaptionModel,model:CAPTION_MODEL,revision:CAPTION_REVISION},
 ...(["tiny","tiny.en"] as const).map(selection=>({name:selection,load:(cache:string,download:boolean)=>loadSpeechModel(cache,download,selection),...speechModels[selection]})),
];
it.each(cases)("retains notices before explicit $name setup and skips them offline",async item=>{
 await item.load("fixture-cache",true);expect(mocks.notice).toHaveBeenCalledWith("fixture-cache",item.model,item.revision);
 expect(mocks.notice.mock.invocationCallOrder[0]!).toBeLessThan(mocks.runtime.mock.invocationCallOrder[0]!);
 mocks.notice.mockClear();await item.load("fixture-cache",false);expect(mocks.notice).not.toHaveBeenCalled();
});
it.each(cases)("stops $name setup before runtime access when notice verification fails",async item=>{
 mocks.notice.mockRejectedValue(new Error("notice changed"));await expect(item.load("fixture-cache",true)).rejects.toThrow("notice changed");expect(mocks.runtime).not.toHaveBeenCalled();expect(mocks.load).not.toHaveBeenCalled();expect(mocks.pipeline).not.toHaveBeenCalled();
});
