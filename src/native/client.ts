import { readFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { connect } from "node:http2";
import protobuf from "protobufjs";
import descriptor from "protobufjs/ext/descriptor.js";
import { runProcess } from "../process.js";
import { AvidMcpError } from "../errors.js";

export const QUALIFIED_BUILD = {
  version: "2024.12.58720",
  sha256: "3ca4d082a3afe00a120d6061d6ee94e20e6113238f0b016398700f3439ec9194",
};
const LIMIT = 1024 * 1024;

export function decodeFrames(data: Buffer): Buffer[] {
  const result: Buffer[] = [];
  for (let offset = 0; offset < data.length;) {
    if (offset + 5 > data.length || data[offset] !== 0) throw new Error("Invalid gRPC framing");
    const size = data.readUInt32BE(offset + 1);
    offset += 5;
    if (size > LIMIT || offset + size > data.length) throw new Error("Invalid gRPC length");
    result.push(data.subarray(offset, offset + size));
    offset += size;
    if (result.length > 2048) throw new Error("Too many gRPC messages");
  }
  return result;
}

/** Derive schemas locally: no Avid descriptor or SDK payload is shipped. */
export async function loadNativeSchema(binary: string): Promise<protobuf.Root> {
  const raw = await readFile(binary);
  if (createHash("sha256").update(raw).digest("hex") !== QUALIFIED_BUILD.sha256) {
    throw new AvidMcpError("NATIVE_BUILD_UNQUALIFIED", "Native adapter requires the qualified Windows 2024.12 build");
  }
  const file = [[67769184, 5684], [67787024, 25675]].map(([offset, size]) => {
    const value = descriptor.FileDescriptorProto.decode(raw.subarray(offset!, offset! + size!));
    // Custom MethodOptions describe SDK scopes; they are not wire message fields.
    value.extension = [];
    return value;
  });
  const root = protobuf.Root.fromDescriptor(descriptor.FileDescriptorSet.encode({ file }).finish());
  root.resolveAll();
  return root;
}

export async function verifyNativeOwner(binary: string): Promise<string> {
  if (process.platform !== "win32") throw new AvidMcpError("NATIVE_PLATFORM_UNQUALIFIED", "Native host qualification is Windows-only");
  const result = await runProcess("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    // NetTCPIP's installed CDXML maps Listen to State=2 on this CIM class.
    // Query the same provider directly to avoid loading the NetTCPIP module per RPC.
    `$ErrorActionPreference='Stop'; @(Get-CimInstance -Namespace root/StandardCimv2 -ClassName MSFT_NetTCPConnection -Filter "LocalPort = 9100 AND LocalAddress = '127.0.0.1' AND State = 2" | ForEach-Object { $p=Get-Process -Id $_.OwningProcess; @{path=$p.Path;pid=$p.Id;started=$p.StartTime.ToUniversalTime().ToString('o')} }) | ConvertTo-Json -Compress`],
  { timeoutMs: 10000, maxOutputBytes: 8192 });
  if (result.exitCode !== 0) throw new AvidMcpError("NATIVE_NOT_CONNECTED", "Cannot identify the native listener owner");
  const value: unknown = JSON.parse(result.stdout);
  const owners = Array.isArray(value)?value:[value];
  if (owners.length !== 1 || !owners[0] || typeof owners[0].path !== "string" ||
    (await realpath(owners[0].path)).toLowerCase() !== (await realpath(binary)).toLowerCase()) {
    throw new AvidMcpError("NATIVE_OWNER_MISMATCH", "Loopback service is not owned by the configured editor");
  }
  return `${owners[0].pid}:${owners[0].started}`;
}

function exchange(method: string, payload: Buffer): Promise<Buffer[]> {
  return new Promise((resolve, reject) => {
    const connection = connect("http://127.0.0.1:9100");
    let finished = false;
    const timer = setTimeout(() => finish(new Error("Native RPC timed out; do not retry a write without inspecting state")), 6000);
    const finish = (error?: Error, result?: Buffer[]) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      connection.destroy();
      if (error) reject(error); else resolve(result!);
    };
    connection.on("error", finish);
    const request = connection.request({ ":method": "POST", ":path": `/mcapi.MCAPI/${method}`,
      "content-type": "application/grpc", te: "trailers", "grpc-timeout": "5S" });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let headers: Record<string, unknown> = {};
    request.on("response", value => { headers = { ...headers, ...value }; });
    request.on("trailers", value => { headers = { ...headers, ...value }; });
    request.on("error", finish);
    request.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > LIMIT) finish(new Error("Native response exceeds limit"));
      else chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        if (headers[":status"] !== 200 || headers["grpc-status"] !== "0" ||
          !String(headers["content-type"]).startsWith("application/grpc")) {
          let detail=String(headers["grpc-message"]??"").slice(0,1024);
          try { detail=decodeURIComponent(detail); } catch { /* retain malformed service diagnostic */ }
          throw new Error(`Native RPC rejected: HTTP ${headers[":status"]}, gRPC ${headers["grpc-status"]}: ${detail}`);
        }
        finish(undefined, decodeFrames(Buffer.concat(chunks)));
      } catch (error) { finish(error as Error); }
    });
    const frame = Buffer.alloc(5);
    frame.writeUInt32BE(payload.length, 1);
    request.end(Buffer.concat([frame, payload]));
  });
}

export const NATIVE_READS = ["GetAppInfo", "GetOpenProjectInfo", "GetBins", "GetBinInfo", "GetBinColumnInfo", "GetMobTrackInfo", "GetViewerMobs",
  "GetListOfBinItems", "GetListOfLinkSettings", "GetListOfExportSettings", "GetListOfExportEDLSettings", "GetListOfImportSettings", "GetMobInfo", "GetMarkers"] as const;
export const NATIVE_WRITES = ["CreateBin", "CloseBin", "OpenBin", "LinkFile", "AddMarker", "CreateSubClip",
  "CopyBinItems", "SelectMobsInBin", "ChangeMarker", "DeleteMarkers", "SetMobInfo", "LoadMobsIntoViewer", "ExportFile", "ExportEDL", "ImportFile"] as const;
type NativeMethod = typeof NATIVE_READS[number] | typeof NATIVE_WRITES[number];

/** protobuf fromObject otherwise silently drops unknown keys and coerces bad enums. */
export function validateWireObject(type:protobuf.Type,value:Record<string,unknown>):void {
  for(const [key,item] of Object.entries(value)){
    const field=type.fields[key];
    if(!field)throw new Error(`Unknown native field: ${type.name}.${key}`);
    field.resolve();
    if(field.repeated&&!Array.isArray(item))throw new Error(`Expected repeated field: ${key}`);
    for(const element of field.repeated?item as unknown[]:[item]){
      if(field.resolvedType instanceof protobuf.Type){
        if(!element||typeof element!=="object"||Array.isArray(element))throw new Error(`Expected message: ${key}`);
        validateWireObject(field.resolvedType,element as Record<string,unknown>);
      }else if(field.resolvedType instanceof protobuf.Enum){
        const values=field.resolvedType.values;
        if(!(typeof element==="string"&&Object.hasOwn(values,element))&&!(typeof element==="number"&&Object.values(values).includes(element)))throw new Error(`Invalid native enum: ${key}`);
      }else if(field.type==="string"?typeof element!=="string":field.type==="bool"?typeof element!=="boolean":typeof element!=="number"||!Number.isFinite(element))throw new Error(`Invalid native value: ${key}`);
      if(!field.resolvedType&&typeof element==="number"&&/int|fixed/.test(field.type)){
        const unsigned=/^u|^fixed/.test(field.type);
        if(!Number.isSafeInteger(element)||(unsigned&&element<0)||(/32$/.test(field.type)&&(element>(unsigned?4294967295:2147483647)||element<(unsigned?0:-2147483648))))throw new Error(`Native integer out of range: ${key}`);
      }
    }
  }
}

export class NativeClient {
  ownerIdentity = "";
  constructor(readonly binary: string) {}
  async call(method: NativeMethod, body: Record<string, unknown> = {}, expectedOwner?:string): Promise<Record<string, any>[]> {
    if (![...NATIVE_READS, ...NATIVE_WRITES].includes(method)) throw new Error("Unsupported native method");
    this.ownerIdentity = await verifyNativeOwner(this.binary);
    if(expectedOwner&&this.ownerIdentity!==expectedOwner)throw new Error("Native listener owner changed before dispatch");
    const root = await loadNativeSchema(this.binary);
    const requestType = root.lookupType(`mcapi.${method}Request`);
    const responseType = root.lookupType(`mcapi.${method}Response`);
    validateWireObject(requestType,{body});
    const message = requestType.fromObject({ body });
    const invalid = requestType.verify(message);
    if (invalid) throw new Error(invalid);
    const payload = Buffer.from(requestType.encode(message).finish());
    const frames = await exchange(method, payload);
    const responses = frames.map(frame => responseType.toObject(responseType.decode(frame), { longs: String, enums: String, defaults: method === "GetBinInfo" || method === "GetBinColumnInfo" || method === "GetMobTrackInfo" || method === "GetViewerMobs" }));
    if (!responses.length || responses.some(value => !value.header || value.header.error) ||
      responses.at(-1)?.header.status !== "Completed") throw new Error("Native application did not complete the operation");
    return responses.filter(value => value.body).map(value => value.body);
  }
}
