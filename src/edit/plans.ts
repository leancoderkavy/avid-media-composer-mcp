import { createHash, randomUUID } from "node:crypto";
import type { ServerConfig } from "../config.js";
import { AvidMcpError } from "../errors.js";
import { emitAudit, stderrAuditSink, type AuditSink } from "../security/audit.js";
import { requireCapability } from "../security/capabilities.js";
import { getBridgeStatus, sendBridgeCommand } from "../bridge/file-bridge.js";
import { EDIT_ACTIONS } from "./catalog.js";

export interface EditOperation {
  action: string;
  arguments: Record<string, unknown>;
  expectedState?: Record<string, unknown>;
}

export interface EditPlan {
  projectId?: string;
  projectPath?: string;
  rationale?: string;
  allowDestructive?: boolean;
  operations: EditOperation[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

const MAX_PLAN_DEPTH = 20;
const MAX_PLAN_NODES = 10_000;
const MAX_PLAN_STRING_BYTES = 1024 * 1024;
const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function validateJsonValue(value: unknown, label: string): void {
  let nodes = 0;
  let stringBytes = 0;
  const ancestors = new Set<object>();

  const visit = (current: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > MAX_PLAN_NODES) {
      throw new AvidMcpError("INVALID_EDIT_PLAN", `${label} exceeds the node limit`);
    }
    if (depth > MAX_PLAN_DEPTH) {
      throw new AvidMcpError("INVALID_EDIT_PLAN", `${label} exceeds the nesting limit`);
    }
    if (
      current === null ||
      typeof current === "boolean" ||
      (typeof current === "number" && Number.isFinite(current))
    ) {
      return;
    }
    if (typeof current === "string") {
      stringBytes += Buffer.byteLength(current, "utf8");
      if (stringBytes > MAX_PLAN_STRING_BYTES) {
        throw new AvidMcpError("INVALID_EDIT_PLAN", `${label} exceeds the string-size limit`);
      }
      return;
    }
    if (!Array.isArray(current) && !isPlainObject(current)) {
      throw new AvidMcpError("INVALID_EDIT_PLAN", `${label} must contain only JSON values`);
    }
    if (ancestors.has(current)) {
      throw new AvidMcpError("INVALID_EDIT_PLAN", `${label} must not contain cycles`);
    }
    ancestors.add(current);
    if (Array.isArray(current)) {
      for (const item of current) visit(item, depth + 1);
    } else {
      for (const [key, item] of Object.entries(current)) {
        if (UNSAFE_OBJECT_KEYS.has(key)) {
          throw new AvidMcpError(
            "INVALID_EDIT_PLAN",
            `${label} contains unsafe object key '${key}'`,
          );
        }
        stringBytes += Buffer.byteLength(key, "utf8");
        visit(item, depth + 1);
      }
    }
    ancestors.delete(current);
  };

  visit(value, 0);
}

export function validateEditPlan(value: unknown): EditPlan {
  if (!isPlainObject(value)) {
    throw new AvidMcpError("INVALID_EDIT_PLAN", "Edit plan must be an object");
  }
  if (!Array.isArray(value.operations) || value.operations.length === 0) {
    throw new AvidMcpError("INVALID_EDIT_PLAN", "Edit plan must contain at least one operation");
  }
  if (value.operations.length > 100) {
    throw new AvidMcpError("INVALID_EDIT_PLAN", "Edit plans are limited to 100 operations");
  }

  const operations: EditOperation[] = value.operations.map((raw, index) => {
    if (!isPlainObject(raw) || typeof raw.action !== "string") {
      throw new AvidMcpError("INVALID_EDIT_PLAN", `Operation ${index} requires an action`);
    }
    if (!EDIT_ACTIONS.has(raw.action)) {
      throw new AvidMcpError("UNKNOWN_EDIT_ACTION", `Unknown edit action '${raw.action}'`, {
        index,
      });
    }
    if (!isPlainObject(raw.arguments)) {
      throw new AvidMcpError(
        "INVALID_EDIT_PLAN",
        `Operation ${index} arguments must be an object`,
      );
    }
    validateJsonValue(raw.arguments, `Operation ${index} arguments`);
    if (raw.expectedState !== undefined && !isPlainObject(raw.expectedState)) {
      throw new AvidMcpError(
        "INVALID_EDIT_PLAN",
        `Operation ${index} expectedState must be an object`,
      );
    }
    if (raw.expectedState !== undefined) {
      validateJsonValue(raw.expectedState, `Operation ${index} expectedState`);
    }
    return {
      action: raw.action,
      arguments: raw.arguments,
      ...(raw.expectedState ? { expectedState: raw.expectedState } : {}),
    };
  });

  const plan: EditPlan = { operations };
  for (const field of ["projectId", "projectPath", "rationale"] as const) {
    const selected = value[field];
    if (typeof selected === "string") {
      if (Buffer.byteLength(selected, "utf8") > 16_384) {
        throw new AvidMcpError("INVALID_EDIT_PLAN", `${field} exceeds the string-size limit`);
      }
      plan[field] = selected;
    }
  }
  if (typeof value.allowDestructive === "boolean") plan.allowDestructive = value.allowDestructive;
  return plan;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function confirmationToken(plan: EditPlan): string {
  return createHash("sha256").update(canonical(plan)).digest("hex");
}

export async function previewEditPlan(planValue: unknown, config: ServerConfig): Promise<unknown> {
  requireCapability(config.capabilities, "inspect");
  const plan = validateEditPlan(planValue);
  const bridge = await getBridgeStatus(config.bridgeDir);
  const changes = plan.operations.map((operation, index) => {
    const definition = EDIT_ACTIONS.get(operation.action);
    if (!definition) throw new Error(`Catalog invariant failed for ${operation.action}`);
    return {
      index,
      action: operation.action,
      category: definition.category,
      description: definition.description,
      risk: definition.risk,
      destructive: definition.destructive,
      supportedByConnectedBridge:
        bridge.connected &&
        bridge.capabilities?.supportedActions.includes("edit.applyPlan") === true &&
        bridge.capabilities.supportedEditOperations.includes(operation.action),
      verification: definition.verification,
      hasExpectedStateGuard: operation.expectedState !== undefined,
    };
  });
  const destructiveCount = changes.filter((change) => change.destructive).length;
  return {
    applied: false,
    bridge,
    plan,
    changes,
    destructiveCount,
    readyToApply:
      bridge.connected &&
      (destructiveCount === 0 || plan.allowDestructive === true) &&
      bridge.capabilities?.supportedActions.includes("edit.applyPlan") === true &&
      plan.operations.every(
        (operation) =>
          bridge.capabilities?.supportedEditOperations.includes(operation.action) === true,
      ),
    blockers: [
      ...(!bridge.connected ? [bridge.reason ?? "Media Composer bridge is not connected"] : []),
      ...(destructiveCount > 0 && plan.allowDestructive !== true
        ? ["Plan contains destructive operations but allowDestructive is not true"]
        : []),
      ...plan.operations
        .filter(
          (operation) =>
            bridge.connected &&
            bridge.capabilities?.supportedEditOperations.includes(operation.action) !== true,
        )
        .map((operation) => `Connected bridge does not support '${operation.action}'`),
      ...(plan.operations.some((operation) => operation.expectedState === undefined)
        ? ["One or more operations omit expectedState guards; the extension must revalidate targets"]
        : []),
    ],
    confirmationToken: confirmationToken(plan),
  };
}

export async function applyEditPlan(
  planValue: unknown,
  suppliedToken: string,
  config: ServerConfig,
  auditSink: AuditSink = stderrAuditSink,
): Promise<unknown> {
  const operationId = randomUUID();
  try {
    requireCapability(config.capabilities, "edit", operationId);
    const plan = validateEditPlan(planValue);
    const expectedToken = confirmationToken(plan);
    if (suppliedToken !== expectedToken) {
      throw new AvidMcpError(
        "CONFIRMATION_TOKEN_MISMATCH",
        "Confirmation token does not match this exact edit plan; preview it again",
        { operationId },
      );
    }
    const destructive = plan.operations.filter(
      (operation) => EDIT_ACTIONS.get(operation.action)?.destructive,
    );
    if (destructive.length > 0 && plan.allowDestructive !== true) {
      throw new AvidMcpError(
        "DESTRUCTIVE_OPT_IN_REQUIRED",
        "Destructive operations require allowDestructive: true in the confirmed plan",
        { operationId, actions: destructive.map((operation) => operation.action) },
      );
    }
    const bridge = await getBridgeStatus(config.bridgeDir);
    if (!bridge.connected || !bridge.capabilities) {
      throw new AvidMcpError(
        "BRIDGE_NOT_CONNECTED",
        bridge.reason ?? "Media Composer Extension bridge is not connected",
        { operationId, bridge },
      );
    }
    const bridgeCapabilities = bridge.capabilities;
    const unsupported = plan.operations
      .map((operation) => operation.action)
      .filter((action) => !bridgeCapabilities.supportedEditOperations.includes(action));
    if (unsupported.length > 0) {
      throw new AvidMcpError(
        "EDIT_OPERATION_UNSUPPORTED",
        "Connected bridge does not support every operation in the plan",
        { operationId, unsupported },
      );
    }

    emitAudit(auditSink, {
      operationId,
      action: "edit.applyPlan",
      outcome: "started",
      details: {
        operationCount: plan.operations.length,
        destructiveCount: destructive.length,
      },
    });
    const response = await sendBridgeCommand(
      config.bridgeDir,
      "edit.applyPlan",
      { plan, confirmationToken: expectedToken },
      config.commandTimeoutMs,
      operationId,
    );
    emitAudit(auditSink, { operationId, action: "edit.applyPlan", outcome: "succeeded" });
    return { operationId, applied: true, result: response.data };
  } catch (error) {
    emitAudit(auditSink, {
      operationId,
      action: "edit.applyPlan",
      outcome:
        error instanceof AvidMcpError && error.code === "CAPABILITY_DENIED" ? "denied" : "failed",
    });
    throw error;
  }
}
