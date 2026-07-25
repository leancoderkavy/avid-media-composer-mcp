import { randomUUID } from "node:crypto";

export type AuditOutcome = "started" | "succeeded" | "denied" | "failed";

export interface AuditEvent {
  operationId: string;
  action: string;
  outcome: AuditOutcome;
  timestamp: string;
  details?: Record<string, unknown>;
}

export type AuditSink = (event: AuditEvent) => void;

export const stderrAuditSink: AuditSink = (event) => {
  console.error(JSON.stringify({ type: "avid-media-composer-mcp-audit", ...event }));
};

export function emitAudit(
  sink: AuditSink,
  event: Omit<AuditEvent, "timestamp" | "operationId"> & { operationId?: string },
): string {
  const operationId = event.operationId ?? randomUUID();
  sink({ ...event, operationId, timestamp: new Date().toISOString() });
  return operationId;
}
