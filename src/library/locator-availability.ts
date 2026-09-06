import {lstat} from "node:fs/promises";
import path from "node:path";
import {resolveReadablePath} from "../security/path-policy.js";

const within = (file: string, root: string) => {
  const relative = path.relative(root, file);
  return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative));
};

/** Explicit metadata-only probe. Never interpret volume hints as filenames, map
 * foreign paths, follow locator symlinks, or scan for a similarly named file. */
export async function probeSavedLocator(field: string, value: string, allowedRoots: readonly string[], interpretAvidDrivePaths=false):Promise<{status:string;bytes?:number;modifiedAt?:string;errorCode?:string;interpretation?:string;interpretedPath?:string}> {
  if (field === "last_known_volume" || field === "last_known_volume_utf8") return {status: "volume_hint"};
  if (!["path", "path_posix", "path_utf8", "path2_utf8"].includes(field)) return {status: "unsupported_field"};
  if (!value || value.length > 4096 || /[\x00-\x1f]/.test(value)) return {status: "unsupported_path"};
  if(interpretAvidDrivePaths&&process.platform==="win32"&&/^[a-z]\/\/[^/\\]/i.test(value)){
    const interpretedPath=value[0]+":/"+value.slice(3);
    return {...await probeSavedLocator(field,interpretedPath,allowedRoots),interpretation:"avid_drive_double_slash",interpretedPath};
  }
  // A foreign absolute path must not become a path on the current drive.
  if (process.platform === "win32" ? !/^[a-z]:[\\/]/i.test(value) || value.slice(2).includes(":") : !value.startsWith("/") || value.startsWith("//"))
    return {status: "unsupported_path"};
  const target = path.resolve(value);
  const lexicalRoot = allowedRoots.map(root => path.resolve(root)).find(root => within(target, root));
  if (!lexicalRoot) return {status: "outside_allowed_roots"};
  try {
    const root = await resolveReadablePath(lexicalRoot, allowedRoots, "directory");
    const relative = path.relative(lexicalRoot, target), parts = relative.split(path.sep).filter(Boolean);
    let current = root;
    // Walk beneath the caller-authorized root without following saved-locator
    // symlinks/junctions, including intermediate directory links.
    for (let i = 0; i < parts.length; i++) {
      current = path.join(current, parts[i]!);
      const info = await lstat(current);
      if (info.isSymbolicLink()) return {status: "symlink_refused"};
      if (i < parts.length - 1 && !info.isDirectory()) return {status: "not_a_file"};
      if (i === parts.length - 1) {
        if (!info.isFile()) return {status: "not_a_file"};
        return {status: "file_present", bytes: info.size, modifiedAt: info.mtime.toISOString()};
      }
    }
    return {status: "not_a_file"};
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return {status: "not_found"};
    if (code === "EACCES" || code === "EPERM") return {status: "access_denied"};
    // An unavailable configured root or other I/O failure is not proof that the
    // declared media file is missing.
    return {status: "unavailable", errorCode: code ?? "UNKNOWN"};
  }
}
