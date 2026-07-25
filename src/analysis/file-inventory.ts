import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { AvidFileKind, FileRecord } from "../types.js";

const MEDIA_EXTENSIONS = new Set([
  ".3gp",
  ".aac",
  ".aif",
  ".aiff",
  ".ari",
  ".avc",
  ".avi",
  ".braw",
  ".caf",
  ".crm",
  ".dng",
  ".dv",
  ".flac",
  ".m2t",
  ".m2ts",
  ".m4a",
  ".m4v",
  ".mkv",
  ".mov",
  ".mp3",
  ".mp4",
  ".mpeg",
  ".mpg",
  ".mxf",
  ".ogg",
  ".omf",
  ".r3d",
  ".rf64",
  ".ts",
  ".wav",
  ".webm",
  ".wma",
  ".wmv",
]);

const DOCUMENT_EXTENSIONS = new Set([
  ".csv",
  ".doc",
  ".docx",
  ".html",
  ".md",
  ".pdf",
  ".rtf",
  ".txt",
]);

const SIDECAR_EXTENSIONS = new Set([
  ".json",
  ".scc",
  ".srt",
  ".stl",
  ".vtt",
  ".xml",
  ".xmp",
]);

export function classifyFile(filePath: string): AvidFileKind {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".avp":
      return "project";
    case ".avb":
      return "bin";
    case ".avs":
      return "settings";
    case ".lck":
      return "bin-lock";
    case ".aaf":
      return "aaf";
    case ".ale":
      return "ale";
    case ".edl":
      return "edl";
    default:
      if (MEDIA_EXTENSIONS.has(extension)) return "media";
      if (SIDECAR_EXTENSIONS.has(extension)) return "sidecar";
      if (DOCUMENT_EXTENSIONS.has(extension)) return "document";
      return "unknown";
  }
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

export interface InventoryOptions {
  maxFiles: number;
  includeHashes: boolean;
}

export interface FileInventory {
  root: string;
  files: FileRecord[];
  countsByKind: Record<AvidFileKind, number>;
  totalBytes: number;
  directoriesScanned: number;
  skippedSymlinks: string[];
  truncated: boolean;
}

export async function inventoryFiles(
  root: string,
  options: InventoryOptions,
): Promise<FileInventory> {
  const files: FileRecord[] = [];
  const skippedSymlinks: string[] = [];
  const directories = [root];
  let directoriesScanned = 0;
  let truncated = false;

  while (directories.length > 0) {
    const directory = directories.pop();
    if (!directory) break;
    directoriesScanned += 1;
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        skippedSymlinks.push(path.relative(root, absolutePath));
        continue;
      }
      if (entry.isDirectory()) {
        directories.push(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (files.length >= options.maxFiles) {
        truncated = true;
        directories.length = 0;
        break;
      }

      const info = await stat(absolutePath);
      const record: FileRecord = {
        absolutePath,
        relativePath: path.relative(root, absolutePath),
        extension: path.extname(entry.name).toLowerCase(),
        kind: classifyFile(absolutePath),
        sizeBytes: info.size,
        modifiedAt: info.mtime.toISOString(),
      };
      if (options.includeHashes) record.sha256 = await sha256File(absolutePath);
      files.push(record);
    }
  }

  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const countsByKind = {
    project: 0,
    bin: 0,
    settings: 0,
    "bin-lock": 0,
    aaf: 0,
    ale: 0,
    edl: 0,
    media: 0,
    sidecar: 0,
    document: 0,
    unknown: 0,
  } satisfies Record<AvidFileKind, number>;
  let totalBytes = 0;
  for (const file of files) {
    countsByKind[file.kind] += 1;
    totalBytes += file.sizeBytes;
  }

  return {
    root,
    files,
    countsByKind,
    totalBytes,
    directoriesScanned,
    skippedSymlinks,
    truncated,
  };
}
