import * as z from "zod/v4";
const codec=z.string().trim().min(1).max(64).transform(value=>value.toLowerCase());
const positive=z.number().int().positive();
const duration=z.object({min:z.number().finite().nonnegative().optional(),max:z.number().finite().nonnegative().optional()}).strict().refine(value=>value.min===undefined||value.max===undefined||value.max>=value.min,"Duration maximum must not precede minimum");
export const mediaFilters=z.object({
  video:z.object({codec:codec.optional(),width:positive.max(65536).optional(),height:positive.max(65536).optional(),frameRate:z.string().regex(/^[1-9]\d{0,5}(?:\/[1-9]\d{0,5})?$/).optional(),pixelFormat:codec.optional(),colorRange:codec.optional(),colorSpace:codec.optional(),colorTransfer:codec.optional(),colorPrimaries:codec.optional()}).strict().optional(),
  audio:z.object({codec:codec.optional(),channels:positive.max(1024).optional(),sampleRate:positive.max(768000).optional()}).strict().optional(),
  duration:duration.optional(),
}).strict();
function rateEquals(a:unknown,b:string){
  if(typeof a!=="string"||!/^\d+(?:\/\d+)?$/.test(a)||a.length>32)return false;
  const [an,ad=1]=a.split('/').map(Number),[bn,bd=1]=b.split('/').map(Number);
  return Number.isSafeInteger(an)&&Number.isSafeInteger(ad)&&an!>0&&ad>0&&Number.isSafeInteger(an!*bd)&&Number.isSafeInteger(bn!*ad)&&an!*bd===bn!*ad;
}
/** Recorded probe declarations only; all constraints of one kind apply to one stream. */
export function matchesMediaFilters(metadata:Record<string,any>,input:z.input<typeof mediaFilters>){
  const filters=mediaFilters.parse(input),streams=Array.isArray(metadata.streams)?metadata.streams:[];
  if(filters.duration){
    const raw=metadata.format?.duration,value=typeof raw==="number"||typeof raw==="string"&&raw.trim()!==""?Number(raw):NaN;
    if(!Number.isFinite(value)||value<0||filters.duration.min!==undefined&&value<filters.duration.min||filters.duration.max!==undefined&&value>filters.duration.max)return false;
  }
  if(filters.video&&!streams.some(s=>s&&s.codec_type==="video"&&
    (filters.video!.codec===undefined||s.codec_name===filters.video!.codec)&&
    (filters.video!.width===undefined||s.width===filters.video!.width)&&
    (filters.video!.height===undefined||s.height===filters.video!.height)&&
    (filters.video!.pixelFormat===undefined||s.pix_fmt===filters.video!.pixelFormat)&&
    (filters.video!.colorRange===undefined||s.color_range===filters.video!.colorRange)&&
    (filters.video!.colorSpace===undefined||s.color_space===filters.video!.colorSpace)&&
    (filters.video!.colorTransfer===undefined||s.color_transfer===filters.video!.colorTransfer)&&
    (filters.video!.colorPrimaries===undefined||s.color_primaries===filters.video!.colorPrimaries)&&
    (filters.video!.frameRate===undefined||rateEquals(s.r_frame_rate,filters.video!.frameRate))))return false;
  if(filters.audio&&!streams.some(s=>s&&s.codec_type==="audio"&&
    (filters.audio!.codec===undefined||s.codec_name===filters.audio!.codec)&&
    (filters.audio!.channels===undefined||s.channels===filters.audio!.channels)&&
    (filters.audio!.sampleRate===undefined||(typeof s.sample_rate==="number"||typeof s.sample_rate==="string"&&/^\d+$/.test(s.sample_rate))&&Number(s.sample_rate)===filters.audio!.sampleRate)))return false;
  return true;
}
