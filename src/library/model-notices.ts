import path from "node:path";
import {fileURLToPath} from "node:url";
import {mkdir,realpath,lstat,writeFile,link,unlink} from "node:fs/promises";
import {createHash,randomUUID} from "node:crypto";
import {readBoundedFile} from "../security/bounded-read.js";
import {resolveReadablePath} from "../security/path-policy.js";

const notices:Record<string,{file:string;sha256:string}>={
 "Xenova/clip-vit-base-patch32":{file:"clip.LICENSE",sha256:"987e63b32f6c89ff5160e429458a872ff048e6860b590a3912e938f9da8f14db"},
 "onnx-community/whisper-tiny":{file:"whisper.LICENSE",sha256:"b5d65a59060e68c4ff940e1eddfa6f94b2d68fdf58ed7f4dd57721c997e35e9d"},
 "onnx-community/whisper-tiny.en":{file:"whisper.LICENSE",sha256:"b5d65a59060e68c4ff940e1eddfa6f94b2d68fdf58ed7f4dd57721c997e35e9d"},
 "onnx-community/Florence-2-base-ft":{file:"florence-2-base-ft.LICENSE",sha256:"c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383"},
};
/** Explicit setup only. Retains an original-project notice, not license clearance for a conversion. */
export async function installModelNotice(cache:string,model:string,revision:string){
 const notice=Object.hasOwn(notices,model)?notices[model]:undefined;
 if(!notice||!/^[a-f0-9]{40}$/.test(revision))throw new Error("No recorded notice or invalid model revision");
 const source=fileURLToPath(new URL(`../../docs/licenses/${notice.file}`,import.meta.url));
 const bytes=await readBoundedFile(source,16384),digest=(value:Buffer)=>createHash("sha256").update(value).digest("hex");
 if(digest(bytes)!==notice.sha256)throw new Error("Bundled upstream notice checksum mismatch");
 await mkdir(path.resolve(cache),{recursive:true});const root=await realpath(path.resolve(cache));let directory=root;
 for(const part of ["notices",...model.split("/"),revision]){
  directory=path.join(directory,part);await mkdir(directory,{recursive:true});
  if((await lstat(directory)).isSymbolicLink())throw new Error("Model notice directory cannot be a link");
  directory=await resolveReadablePath(directory,[root],"directory");
 }
 const file=path.join(directory,"UPSTREAM.LICENSE");let created=false;
 const staged=path.join(directory,`.notice-${randomUUID()}.creating`);
 // Publish a completed file exclusively; concurrent setup must never read a partial notice.
 await writeFile(staged,bytes,{flag:"wx"});
 try{
  try{await link(staged,file);created=true;}catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;}
 }finally{await unlink(staged);}
 if((await lstat(file)).isSymbolicLink())throw new Error("Model notice cannot be a link");
 if(digest(await readBoundedFile(file,16384))!==notice.sha256)throw new Error("Existing model notice changed; refusing to overwrite it");
 return {file,sha256:notice.sha256,created,scope:"Retained original-project notice; see packaged provenance documentation for conversion-specific limitations"};
}
