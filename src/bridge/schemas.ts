import { z } from "zod";
import { EDIT_ACTIONS } from "../edit/catalog.js";
import { AVID_BRIDGE_PROTOCOL_VERSION, type BridgeResponse } from "./types.js";

const boundedIdentifier = z.string().min(1).max(256);
const boundedText = z.string().max(16_384);
const timestamp = z.string().refine((value) => Number.isFinite(Date.parse(value)), {
  message: "Expected an ISO-compatible timestamp",
});
const nonce = z.string().uuid();
const jsonObject = z.record(z.string().max(256), z.json());

const projectIdentity = z
  .object({
    id: boundedIdentifier.optional(),
    name: boundedText.optional(),
    path: boundedText.optional(),
  })
  .strict();

const authenticationSchema = z
  .object({
    algorithm: z.literal("hmac-sha256"),
    keyId: boundedIdentifier,
    nonce,
    signedAt: timestamp,
    signature: z.string().min(20).max(512),
  })
  .strict();

export const bridgeCapabilitiesSchema = z
  .object({
    protocolVersion: z.literal(AVID_BRIDGE_PROTOCOL_VERSION),
    supportedProtocolVersions: z
      .array(z.number().int().positive())
      .min(1)
      .max(8)
      .refine((versions) => new Set(versions).size === versions.length, {
        message: "Supported protocol versions must be unique",
      })
      .refine((versions) => versions.includes(AVID_BRIDGE_PROTOCOL_VERSION), {
        message: "Bridge does not negotiate protocol v3",
      }),
    extensionId: boundedIdentifier,
    installationId: boundedIdentifier,
    extensionVersion: boundedIdentifier,
    mediaComposerVersion: boundedIdentifier,
    platform: z.enum(["windows", "macos"]),
    operatingSystemVersion: boundedIdentifier,
    architecture: z.enum(["x64", "arm64"]),
    sessionId: boundedIdentifier,
    heartbeatAt: boundedText,
    stateRevision: boundedIdentifier.optional(),
    supportedActions: z
      .array(z.enum(["inspect.getState", "edit.applyPlan"]))
      .max(2)
      .refine((actions) => new Set(actions).size === actions.length, {
        message: "Bridge actions must be unique",
      }),
    supportedEditOperations: z
      .array(boundedIdentifier)
      .max(EDIT_ACTIONS.size)
      .refine((actions) => new Set(actions).size === actions.length, {
        message: "Bridge edit operations must be unique",
      })
      .refine((actions) => actions.every((action) => EDIT_ACTIONS.has(action)), {
        message: "Bridge advertised an unknown edit operation",
      }),
    project: projectIdentity.optional(),
    authentication: authenticationSchema,
  })
  .strict();

const bridgeErrorSchema = z
  .object({
    code: boundedIdentifier,
    message: boundedText,
    details: jsonObject.optional(),
  })
  .strict();

const responseBase = {
  protocolVersion: z.literal(AVID_BRIDGE_PROTOCOL_VERSION),
  operationId: boundedIdentifier,
  clientSessionId: nonce,
  requestSequence: z.number().int().positive(),
  requestNonce: nonce,
  completedAt: timestamp,
  authentication: authenticationSchema,
};

const failureResponseSchema = z
  .object({
    ...responseBase,
    ok: z.literal(false),
    error: bridgeErrorSchema,
  })
  .strict();

const inspectStateDataSchema = z
  .object({
    stateRevision: boundedIdentifier,
    project: projectIdentity.optional(),
    state: jsonObject,
  })
  .strict();

const editOperationResultSchema = z
  .object({
    index: z.number().int().nonnegative(),
    action: boundedIdentifier.refine((action) => EDIT_ACTIONS.has(action), {
      message: "Unknown edit operation",
    }),
    status: z.enum(["applied", "verified", "failed", "skipped"]),
    targetId: boundedIdentifier.optional(),
    verified: z.boolean(),
    error: bridgeErrorSchema.optional(),
  })
  .strict();

const editPlanDataSchema = z
  .object({
    applied: z.number().int().nonnegative(),
    partialApply: z.boolean(),
    preStateRevision: boundedIdentifier,
    postStateRevision: boundedIdentifier.optional(),
    undoGroupId: boundedIdentifier.optional(),
    results: z.array(editOperationResultSchema).min(1).max(100),
    outputs: jsonObject.optional(),
  })
  .strict()
  .superRefine((data, context) => {
    const applied = data.results.filter(
      (result) => result.status === "applied" || result.status === "verified",
    ).length;
    if (data.applied !== applied) {
      context.addIssue({
        code: "custom",
        message: "Applied count must match per-operation evidence",
        path: ["applied"],
      });
    }
    const failed = data.results.some((result) => result.status === "failed");
    if (failed !== data.partialApply) {
      context.addIssue({
        code: "custom",
        message: "partialApply must match per-operation failure evidence",
        path: ["partialApply"],
      });
    }
    if (failed && data.applied === 0) {
      context.addIssue({
        code: "custom",
        message: "A total edit failure must use an error response",
        path: ["partialApply"],
      });
    }
    if (data.applied > 0 && !data.postStateRevision) {
      context.addIssue({
        code: "custom",
        message: "Applied edits require a post-state revision",
        path: ["postStateRevision"],
      });
    }
    for (const [index, result] of data.results.entries()) {
      if ((result.status === "verified") !== result.verified) {
        context.addIssue({
          code: "custom",
          message: "Verified flag must agree with operation status",
          path: ["results", index, "verified"],
        });
      }
      if (result.status === "failed" && !result.error) {
        context.addIssue({
          code: "custom",
          message: "Failed operations require structured error evidence",
          path: ["results", index, "error"],
        });
      }
    }
  });

const inspectSuccessResponseSchema = z
  .object({
    ...responseBase,
    ok: z.literal(true),
    data: inspectStateDataSchema,
  })
  .strict();

const editSuccessResponseSchema = z
  .object({
    ...responseBase,
    ok: z.literal(true),
    data: editPlanDataSchema,
  })
  .strict();

export function parseBridgeResponse(
  value: unknown,
  operationId: string,
  action: string,
): BridgeResponse | undefined {
  const schema =
    action === "inspect.getState"
      ? z.union([inspectSuccessResponseSchema, failureResponseSchema])
      : action === "edit.applyPlan"
        ? z.union([editSuccessResponseSchema, failureResponseSchema])
        : failureResponseSchema;
  const parsed = schema.safeParse(value);
  if (!parsed.success || parsed.data.operationId !== operationId) return undefined;
  return parsed.data as BridgeResponse;
}
