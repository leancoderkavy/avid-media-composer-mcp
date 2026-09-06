import {it,expect} from "vitest";
import {mkdtemp,writeFile,mkdir,symlink} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {probeSavedLocator} from "../src/library/locator-availability.js";

it("distinguishes file presence, missing file and directory without reading media",async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),"avid-locator-")),file=path.join(root,"clip.mp4");await writeFile(file,"not real media");
 expect(await probeSavedLocator("path",file,[root])).toMatchObject({status:"file_present",bytes:14});
 expect(await probeSavedLocator("path",path.join(root,"missing.mp4"),[root])).toEqual({status:"not_found"});
 expect(await probeSavedLocator("path",root,[root])).toEqual({status:"not_a_file"});
 expect(await probeSavedLocator("path",path.join(file,"child"),[root])).toEqual({status:"not_a_file"});
});
it("refuses out-of-scope, foreign, relative, network and volume-hint paths",async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),"avid-locator-"));
 expect(await probeSavedLocator("path",path.join(root,"..","outside.mp4"),[root])).toEqual({status:"outside_allowed_roots"});
 for(const value of ["clip.mp4","https://host/clip.mp4","\\\\server\\share\\clip.mp4",process.platform==="win32"?"/Volumes/Media/clip.mp4":"C:\\Media\\clip.mp4", "bad\0path"])
  expect(await probeSavedLocator("path",value,[root])).toEqual({status:"unsupported_path"});
 expect(await probeSavedLocator("last_known_volume",root,[root])).toEqual({status:"volume_hint"});
 expect(await probeSavedLocator("unknown",root,[root])).toEqual({status:"unsupported_field"});
});
it("refuses directory symlinks/junctions into external media",async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),"avid-locator-")),outside=await mkdtemp(path.join(os.tmpdir(),"avid-locator-outside-"));
 await writeFile(path.join(outside,"clip.mp4"),"outside");await mkdir(path.join(root,"inside"));
 await symlink(outside,path.join(root,"inside","linked"),process.platform==="win32"?"junction":"dir");
 expect(await probeSavedLocator("path",path.join(root,"inside","linked","clip.mp4"),[root])).toEqual({status:"symlink_refused"});
});
it.skipIf(process.platform!=="win32")("interprets observed Avid drive syntax only with explicit opt-in and preserves scope",async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),"avid-locator-")),file=path.join(root,"clip.mp4");await writeFile(file,"fixture");
 const declared=file[0]+"//"+file.slice(3).replace(/\\/g,"/");
 expect(await probeSavedLocator("path_utf8",declared,[root])).toEqual({status:"unsupported_path"});
 expect(await probeSavedLocator("path_utf8",declared,[root],true)).toMatchObject({status:"file_present",interpretation:"avid_drive_double_slash"});
 expect(await probeSavedLocator("path_utf8",declared,[],true)).toMatchObject({status:"outside_allowed_roots"});
 expect(await probeSavedLocator("path_utf8",declared+":secret",[root],true)).toMatchObject({status:"unsupported_path"});
});
