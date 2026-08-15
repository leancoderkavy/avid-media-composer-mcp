import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { AvidMcpError, errorDetails } from "../src/errors.js";
import {
  requireCapability,
  resolveCapabilities,
} from "../src/security/capabilities.js";

describe("server configuration", () => {
  it("loads explicit roots, dependencies, bridge, capabilities, and limits", () => {
    const roots = [path.resolve("one"), path.resolve("two")];
    const config = loadConfig({
      AVID_MCP_ALLOWED_ROOTS: roots.join(path.delimiter),
      AVID_MCP_CAPABILITIES: "inspect, edit,inspect",
      AVID_MCP_BRIDGE_DIR: path.resolve("bridge"),
      AVID_MCP_PYTHON: "python-custom",
      AVID_MCP_FFPROBE: "ffprobe-custom",
      AVID_MCP_MAX_FILES: "25",
      AVID_MCP_MAX_BINS: "5",
      AVID_MCP_MAX_MEDIA_FILES: "7",
      AVID_MCP_COMMAND_TIMEOUT_MS: "1234",
      AVID_MCP_CTMS_REGISTRY_URL: "https://ctms.example.test/registry",
      AVID_MCP_CTMS_ALLOWED_ORIGINS: "https://ctms.example.test, https://assets.example.test",
      AVID_MCP_CTMS_ACCESS_TOKEN: "test-only-token",
      AVID_MCP_CTMS_MAX_RESPONSE_BYTES: "4096",
    });
    expect(config).toMatchObject({
      allowedRoots: roots,
      bridgeDir: path.resolve("bridge"),
      pythonExecutable: "python-custom",
      ffprobeExecutable: "ffprobe-custom",
      maxFiles: 25,
      maxBins: 5,
      maxMediaFiles: 7,
      commandTimeoutMs: 1234,
      ctmsRegistryUrl: "https://ctms.example.test/registry",
      ctmsAllowedOrigins: ["https://ctms.example.test", "https://assets.example.test"],
      ctmsAccessToken: "test-only-token",
      ctmsMaxResponseBytes: 4096,
    });
    expect([...config.capabilities].sort()).toEqual(["edit", "inspect"]);
  });

  it.each(["0", "-1", "1.5", "NaN"])("rejects invalid positive limit %s", (value) => {
    expect(() => loadConfig({ AVID_MCP_MAX_FILES: value })).toThrow(
      "AVID_MCP_MAX_FILES must be a positive integer",
    );
  });

  it("does not configure CTMS credentials by default", () => {
    const config = loadConfig({});
    expect(config.ctmsRegistryUrl).toBeUndefined();
    expect(config.ctmsAccessToken).toBeUndefined();
    expect(config.ctmsAllowedOrigins).toEqual([]);
  });
});

describe("capability enforcement", () => {
  it("defaults to inspect and normalizes explicit values", () => {
    expect([...resolveCapabilities(undefined).capabilities]).toEqual(["inspect"]);
    expect([...resolveCapabilities(" EDIT, inspect ").capabilities].sort()).toEqual([
      "edit",
      "inspect",
    ]);
  });

  it("rejects unknown authority and reports stable denial details", () => {
    expect(() => resolveCapabilities("inspect,root")).toThrowError(
      expect.objectContaining({ code: "UNKNOWN_CAPABILITY" }),
    );
    expect(() => requireCapability(new Set(["inspect"]), "edit", "operation-1")).toThrowError(
      expect.objectContaining({
        code: "CAPABILITY_DENIED",
        details: {
          required: "edit",
          enabled: ["inspect"],
          operationId: "operation-1",
        },
      }),
    );
    expect(requireCapability(new Set(["inspect"]), "inspect", "operation-2")).toBe("operation-2");
  });
});

describe("error envelopes", () => {
  it("preserves typed errors and normalizes ordinary or non-error failures", () => {
    expect(errorDetails(new AvidMcpError("TEST", "typed", { item: 1 }))).toEqual({
      code: "TEST",
      message: "typed",
      details: { item: 1 },
    });
    expect(errorDetails(new Error("ordinary"))).toEqual({
      code: "INTERNAL_ERROR",
      message: "ordinary",
    });
    expect(errorDetails("string failure")).toEqual({
      code: "INTERNAL_ERROR",
      message: "string failure",
    });
  });
});
