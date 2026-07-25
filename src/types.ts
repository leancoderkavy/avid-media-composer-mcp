export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface ToolError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ToolResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: ToolError;
  operationId?: string;
}

export interface FileRecord {
  absolutePath: string;
  relativePath: string;
  extension: string;
  kind: AvidFileKind;
  sizeBytes: number;
  modifiedAt: string;
  sha256?: string;
}

export type AvidFileKind =
  | "project"
  | "bin"
  | "settings"
  | "bin-lock"
  | "aaf"
  | "ale"
  | "edl"
  | "media"
  | "sidecar"
  | "document"
  | "unknown";

export interface DependencyStatus {
  available: boolean;
  executable?: string;
  version?: string;
  error?: string;
}
