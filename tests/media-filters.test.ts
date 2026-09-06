import {describe,it,expect} from 'vitest';
import {mediaFilters,matchesMediaFilters as matches} from '../src/library/media-filters.js';

const metadata={format:{duration:'10'},streams:[
 {codec_type:'video',codec_name:'h264',width:1280,height:720,r_frame_rate:'30000/1001'},
 {codec_type:'video',codec_name:'hevc',width:3840,height:2160,r_frame_rate:'25/1'},
 {codec_type:'audio',codec_name:'aac',channels:2,sample_rate:'48000'},
 {codec_type:'audio',codec_name:'pcm_s24le',channels:6,sample_rate:'96000'},
]};
describe('recorded media filters',()=>{
 it('matches color declarations on the same video stream without inferring HDR',()=>{
  const streams=[{codec_type:'video',codec_name:'h264',pix_fmt:'yuv420p',color_range:'tv',color_space:'bt709',color_transfer:'bt709',color_primaries:'bt709'},{codec_type:'video',codec_name:'hevc',pix_fmt:'yuv420p10le',color_range:'tv',color_space:'bt2020nc',color_transfer:'smpte2084',color_primaries:'bt2020'}];
  expect(matches({streams},{video:{codec:'HEVC',pixelFormat:'YUV420P10LE',colorRange:'tv',colorSpace:'bt2020nc',colorTransfer:' SMPTE2084 ',colorPrimaries:'bt2020'}})).toBe(true);
  expect(matches({streams},{video:{codec:'h264',colorTransfer:'smpte2084'}})).toBe(false);
  expect(matches({streams},{video:{pixelFormat:'yuv420p',colorPrimaries:'bt2020'}})).toBe(false);
  expect(matches({streams:[{codec_type:'video',pix_fmt:'yuv420p10le'}]},{video:{colorTransfer:'smpte2084'}})).toBe(false);
 });
 it('requires explicit declarations including unknown and rejects empty color constraints',()=>{
  for(const [key,field] of Object.entries({pixelFormat:'pix_fmt',colorRange:'color_range',colorSpace:'color_space',colorTransfer:'color_transfer',colorPrimaries:'color_primaries'})){
   expect(matches({streams:[{codec_type:'video',[field]:'unknown'}]},{video:{[key]:'unknown'}})).toBe(true);
   expect(matches({streams:[{codec_type:'video'}]},{video:{[key]:'unknown'}})).toBe(false);
   expect(mediaFilters.safeParse({video:{[key]:' '}}).success).toBe(false);
  }
 });
 it('requires video constraints to match one stream',()=>{
  expect(matches(metadata,{video:{codec:' H264 ',width:1280,height:720,frameRate:'60000/2002'}})).toBe(true);
  expect(matches(metadata,{video:{codec:'h264',width:3840}})).toBe(false);
  expect(matches(metadata,{video:{width:1280,frameRate:'25'}})).toBe(false);
 });
 it('requires audio constraints to match one stream and combines stream kinds',()=>{
  expect(matches(metadata,{video:{codec:'hevc'},audio:{codec:'AAC',channels:2,sampleRate:48000}})).toBe(true);
  expect(matches(metadata,{audio:{codec:'aac',channels:6}})).toBe(false);
  expect(matches(metadata,{audio:{channels:2,sampleRate:96000}})).toBe(false);
  expect(matches({streams:[{codec_type:'audio',sample_rate:true}]},{audio:{sampleRate:1}})).toBe(false);
 });
 it('uses inclusive duration bounds and refuses unavailable duration',()=>{
  expect(matches(metadata,{duration:{min:10,max:10}})).toBe(true);
  expect(matches(metadata,{duration:{min:10.1}})).toBe(false);
  expect(matches(metadata,{duration:{max:9.9}})).toBe(false);
  for(const duration of [undefined,null,'','N/A',Infinity,-1,true])expect(matches({format:{duration}},{duration:{min:0}})).toBe(false);
 });
 it('does not infer streams or rates',()=>{
  expect(matches({},{})).toBe(true);
  expect(matches({},{video:{}})).toBe(false);
  expect(matches(metadata,{audio:{}})).toBe(true);
  for(const r_frame_rate of ['0/0','0/1','30000/0','N/A',30,undefined,'999999999999999999999999/1'])expect(matches({streams:[{codec_type:'video',r_frame_rate}]},{video:{frameRate:'30'}})).toBe(false);
 });
 it('rejects invalid constraints instead of silently ignoring them',()=>{
  for(const filter of [{video:{width:0}},{audio:{channels:1.5}},{video:{frameRate:'29.97'}},{video:{frameRate:'30/0'}},{duration:{min:11,max:10}},{duration:{max:Infinity}},{video:{cfr:true}},{unknown:true}])expect(mediaFilters.safeParse(filter).success).toBe(false);
 });
});
