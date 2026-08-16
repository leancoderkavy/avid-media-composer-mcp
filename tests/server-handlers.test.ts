import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import packageJson from "../package.json" with { type: "json" };
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerConfig } from "../src/config.js";
import { createServer } from "../src/server.js";

const fixture = path.resolve("tests/fixtures/sample-project");
const cleanup: Array<() => Promise<void>> = [];

function config(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    allowedRoots: [fixture],
    capabilities: new Set(["inspect"]),
    pythonExecutable: "definitely-missing-python",
    ffprobeExecutable: "definitely-missing-ffprobe",
    maxFiles: 1_000,
    maxBins: 20,
    maxMediaFiles: 20,
    commandTimeoutMs: 2_000,
    ...overrides,
  };
}

async function clientServer(overrides: Partial<ServerConfig> = {}): Promise<Client> {
  const server = createServer(config(overrides));
  const client = new Client({ name: "avid-handler-tests", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  cleanup.push(async () => {
    await client.close();
    await server.close();
  });
  return client;
}

function data(result: Awaited<ReturnType<Client["callTool"]>>): Record<string, unknown> {
  const content = result.structuredContent as
    | { ok?: boolean; data?: Record<string, unknown> }
    | undefined;
  expect(content?.ok).toBe(true);
  return content?.data ?? {};
}

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
  vi.unstubAllGlobals();
});

describe("MCP tool handlers", () => {
  it("serves health, dependency, compatibility, and catalog reports", async () => {
    const client = await clientServer();
    expect(
      data(await client.callTool({ name: "avid_ping", arguments: {} })),
    ).toMatchObject({ version: packageJson.version, sourceMediaPolicy: "read-only" });

    const capabilities = data(
      await client.callTool({ name: "avid_get_capabilities", arguments: {} }),
    );
    expect(capabilities).toMatchObject({
      authority: { default: ["inspect"] },
      dependencies: {
        pythonInspector: { available: false },
        ffprobe: { available: false },
      },
    });

    const matrix = data(
      await client.callTool({ name: "avid_get_compatibility_matrix", arguments: {} }),
    );
    expect(matrix.releaseTracks).toHaveLength(3);

    expect(
      data(
        await client.callTool({
          name: "avid_check_compatibility",
          arguments: {
            media_composer_version: "2025.12.1",
            platform: "windows",
            operating_system_version: "Windows 11 24H2",
            architecture: "x64",
          },
        }),
      ),
    ).toMatchObject({ status: "qualified" });

    const catalog = data(
      await client.callTool({
        name: "avid_get_edit_operation_catalog",
        arguments: { risk: "destructive" },
      }),
    );
    expect(Number(catalog.count)).toBeGreaterThan(0);
  });

  it("runs native discovery and source-safe project analyzers", async () => {
    const client = await clientServer();
    const discovered = data(
      await client.callTool({
        name: "avid_discover_projects",
        arguments: { search_root: fixture, max_depth: 1, max_directories: 10 },
      }),
    );
    expect(discovered.projects).toHaveLength(1);

    const inventory = data(
      await client.callTool({
        name: "avid_inventory_project_files",
        arguments: { project_path: fixture, include_hashes: true },
      }),
    );
    expect(Array.isArray(inventory.files)).toBe(true);
    expect((inventory.files as unknown[]).length).toBeGreaterThan(0);

    const configuration = data(
      await client.callTool({
        name: "avid_analyze_configuration",
        arguments: { config_path: path.join(fixture, "SampleProject.avp") },
      }),
    );
    expect(configuration.sha256).toMatch(/^[a-f0-9]{64}$/);

    const edl = data(
      await client.callTool({
        name: "avid_analyze_edl",
        arguments: { edl_path: path.join(fixture, "Sequence.edl") },
      }),
    );
    expect(Array.isArray(edl.events)).toBe(true);
    expect((edl.events as unknown[]).length).toBeGreaterThan(0);

    const project = data(
      await client.callTool({
        name: "avid_analyze_project",
        arguments: {
          project_path: fixture,
          include_hashes: false,
          include_configurations: true,
          include_bins: false,
          include_aaf: false,
          include_media_metadata: false,
          deep_media_analysis: false,
          python_max_depth: 2,
          python_max_items: 10,
        },
      }),
    );
    expect(project.safety).toMatchObject({ sourceMediaModified: false });
  });

  it("fails closed for absent bridges, denied edits, and paths outside allowed roots", async () => {
    const client = await clientServer();
    expect(
      data(await client.callTool({ name: "avid_get_bridge_status", arguments: {} })),
    ).toMatchObject({ configured: false, connected: false });

    const live = await client.callTool({
      name: "avid_get_live_state",
      arguments: { scope: "summary", options: {} },
    });
    expect(live.isError).toBe(true);
    expect(live.structuredContent).toMatchObject({
      ok: false,
      error: { code: "BRIDGE_NOT_CONNECTED" },
    });

    const apply = await client.callTool({
      name: "avid_apply_edit_plan",
      arguments: {
        plan: { operations: [{ action: "bin.create", arguments: { name: "Selects" } }] },
        confirmation_token: "0".repeat(64),
      },
    });
    expect(apply.isError).toBe(true);
    expect(apply.structuredContent).toMatchObject({
      ok: false,
      error: { code: "CAPABILITY_DENIED" },
    });

    const outside = await client.callTool({
      name: "avid_analyze_configuration",
      arguments: { config_path: path.resolve("package.json") },
    });
    expect(outside.isError).toBe(true);
    expect(outside.structuredContent).toMatchObject({
      ok: false,
      error: { code: "PATH_OUTSIDE_ALLOWED_ROOTS" },
    });
  });

  it("renders the catalog resource and both workflow prompts", async () => {
    const client = await clientServer();
    const resource = await client.readResource({ uri: "avid://catalog/edit-actions" });
    expect(resource.contents[0]?.text).toContain('"count": 167');

    const audit = await client.getPrompt({
      name: "avid-project-audit",
      arguments: { project_path: fixture, include_media: "true" },
    });
    expect(audit.messages[0]?.content).toMatchObject({
      type: "text",
      text: expect.stringContaining("include_media_metadata=true"),
    });

    const edit = await client.getPrompt({
      name: "avid-safe-edit",
      arguments: { goal: "Create a selects bin" },
    });
    expect(edit.messages[0]?.content).toMatchObject({
      type: "text",
      text: expect.stringContaining("Create a selects bin"),
    });
  });

  it("dispatches every remaining read-only analysis handler", async () => {
    const client = await clientServer();
    const calls: Array<{ name: string; arguments: Record<string, unknown> }> = [
      { name: "avid_detect_installations", arguments: { platform: "windows" } },
      {
        name: "avid_analyze_bin",
        arguments: { bin_path: path.join(fixture, "Editorial.avb"), max_depth: 2, max_items: 10 },
      },
      {
        name: "avid_analyze_aaf",
        arguments: { aaf_path: path.join(fixture, "Editorial.avb"), max_depth: 2, max_items: 10 },
      },
      {
        name: "avid_analyze_otio",
        arguments: { otio_path: path.join(fixture, "Timeline.otio"), max_bytes: 1_000_000, max_depth: 16, max_items: 100 },
      },
      {
        name: "avid_preview_otio_handoff",
        arguments: {
          otio_path: path.join(fixture, "Timeline.otio"),
          media_roots: [fixture],
          include_checksums: false,
          max_media_references: 100,
          max_checksum_bytes: 1_000_000,
        },
      },
      {
        name: "avid_validate_marker_package",
        arguments: {
          markers: [{ id: "m1", timecode: "01:00:00:00", text: "Review", color: "red", svg_overlay: "<svg><rect/></svg>" }],
          source_start_timecode: "01:00:00:00",
          source_end_timecode: "01:00:10:00",
          frame_rate: 24,
        },
      },
      {
        name: "avid_compare_transcripts",
        arguments: {
          baseline: [{ text: "one", start_seconds: 0, end_seconds: 0.5, speaker: "A", confidence: 0.9 }],
          candidate: [{ text: "one", start_seconds: 0.1, end_seconds: 0.6, speaker: "B", confidence: 0.8 }],
          gap_threshold_seconds: 0.25,
          max_comparison_cells: 100,
        },
      },
      {
        name: "avid_analyze_dnx_turnover",
        arguments: {
          codec: "dnxhd", profile: "DNxHR HQX", dnx_generation: "4.0", width: 3840, height: 2160,
          frame_rate: 24, bit_depth: 12, chroma_subsampling: "4:2:2", pixel_format: "yuv422p12le",
          color_space: "bt2020", color_transfer: "smpte2084", target_media_composer_version: "2025.6",
        },
      },
      { name: "avid_get_extension_capability_manifest", arguments: { category: "bin" } },
      { name: "avid_diagnose_integrations", arguments: {} },
      {
        name: "avid_analyze_clip",
        arguments: { clip_path: path.join(fixture, "Sequence.edl"), deep: true, include_hash: true },
      },
    ];

    for (const call of calls) {
      const result = await client.callTool(call);
      expect(result.structuredContent, call.name).toMatchObject({ tool: call.name });
    }
  });

  it("reports CTMS configuration failures through the structured error boundary", async () => {
    const client = await clientServer();
    const result = await client.callTool({ name: "avid_ctms_read", arguments: { clear_session: true } });
    expect(result).toMatchObject({
      isError: true,
      structuredContent: { ok: false, tool: "avid_ctms_read" },
    });
  });

  it("performs bounded CTMS JSON reads without redirects", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ _links: {} }), {
      status: 200,
      headers: { "content-length": "13", "content-type": "application/hal+json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const client = await clientServer({
      ctmsRegistryUrl: "https://ctms.example.test/registry",
      ctmsAllowedOrigins: ["https://ctms.example.test"],
      ctmsAccessToken: "secret",
      ctmsMaxResponseBytes: 1024,
    });
    const result = await client.callTool({ name: "avid_ctms_read", arguments: {} });
    expect(result.structuredContent).toMatchObject({ ok: true, tool: "avid_ctms_read" });
    expect(fetchMock).toHaveBeenCalledWith("https://ctms.example.test/registry", expect.objectContaining({ method: "GET", redirect: "error" }));
  });

  it("rejects oversized and malformed CTMS responses", async () => {
    const settings = {
      ctmsRegistryUrl: "https://ctms.example.test/registry",
      ctmsAllowedOrigins: ["https://ctms.example.test"],
      ctmsAccessToken: "secret",
      ctmsMaxResponseBytes: 8,
    } satisfies Partial<ServerConfig>;

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200, headers: { "content-length": "9" } })));
    const oversized = await clientServer(settings);
    expect(await oversized.callTool({ name: "avid_ctms_read", arguments: {} })).toMatchObject({ isError: true });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })));
    const malformed = await clientServer({ ...settings, ctmsMaxResponseBytes: 1024 });
    expect(await malformed.callTool({ name: "avid_ctms_read", arguments: {} })).toMatchObject({ isError: true });
  });
});
