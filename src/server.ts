import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { ServerConfig } from "./config.js";
import { loadConfig } from "./config.js";
import { errorDetails } from "./errors.js";
import { requireCapability } from "./security/capabilities.js";
import { resolveReadablePath } from "./security/path-policy.js";
import { getBridgeStatus, sendBridgeCommand } from "./bridge/file-bridge.js";
import { analyzeAle } from "./analysis/ale.js";
import { analyzeConfigurationFile } from "./analysis/configuration.js";
import { analyzeEdl } from "./analysis/edl.js";
import { inventoryFiles } from "./analysis/file-inventory.js";
import { analyzeMediaFile, probeFfprobe } from "./analysis/media.js";
import { analyzeOtio } from "./analysis/otio.js";
import { analyzeDnxTurnover } from "./analysis/dnx.js";
import { validateSourceMarkerPackage } from "./analysis/markers.js";
import { compareTranscriptRevisions } from "./analysis/transcript.js";
import {
  analyzeAafWithPython,
  analyzeAvbWithPython,
  probePythonInspector,
} from "./analysis/python-sidecar.js";
import { analyzeProject, discoverProjects } from "./analysis/project.js";
import { EDIT_ACTION_CATALOG } from "./edit/catalog.js";
import {
  EXTENSION_CAPABILITY_MANIFEST,
  validateExtensionCapabilityManifest,
} from "./compatibility/extension-capabilities.js";
import { previewOtioHandoff, otioHandoffDigest } from "./interchange/otio-handoff.js";
import { diagnoseAvidIntegrations } from "./integrations/avid-diagnostics.js";
import { CtmsReadClient, type CtmsFetch } from "./integrations/ctms.js";
import { applyEditPlan, previewEditPlan } from "./edit/plans.js";
import {
  AVID_RELEASE_TRACKS,
  detectHostPlatform,
  evaluateCompatibility,
} from "./compatibility/releases.js";
import { detectInstallations } from "./compatibility/installations.js";
import { telemetry } from "./telemetry.js";
import { SERVER_VERSION } from "./version.js";
import { NativeAdapter, nativeActionSchema } from "./native/adapter.js";
import { registerLibraryTools } from "./library/tools.js";

const INSTRUCTIONS = `Avid Media Composer MCP separates verified capability from aspiration.

1. Start with avid_get_capabilities and avid_get_bridge_status.
2. Use avid_analyze_project for offline project/bin/configuration analysis.
3. Source media is read-only. Export tools generate separate artifacts only when export authority is enabled.
4. Preview every live change with avid_preview_edit_plan. Apply the exact returned token only after reviewing risks and blockers.
5. Extension tools require their bridge. Separately configured native tools use a qualified Windows adapter with their own preview tokens. Never substitute one adapter after a failed write.
6. AVB is an unpublished Avid format. pyavb results are useful independent analysis, not an Avid-supported guarantee.
7. Treat .lck files as authoritative collaboration signals and never mutate an open or locked bin offline.`;

const TOOL_OUTPUT_SCHEMA = {
  ok: z.boolean(),
  tool: z.string(),
  data: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      details: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
};

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const EDIT_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const NETWORK_READ_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

function createCtmsFetcher(maxResponseBytes: number): CtmsFetch {
  return async (url, init) => {
    const response = await fetch(url, {
      method: init.method,
      headers: init.headers,
      redirect: "error",
    });
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
      throw new Error("CTMS response exceeds the configured byte limit");
    }
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxResponseBytes) {
      throw new Error("CTMS response exceeds the configured byte limit");
    }
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new Error("CTMS response was not valid JSON");
    }
    return { status: response.status, body };
  };
}

function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function success(tool: string, data: unknown) {
  const structuredContent = { ok: true, tool, data };
  return {
    content: [{ type: "text" as const, text: jsonText(structuredContent) }],
    structuredContent,
  };
}

function failure(tool: string, error: unknown) {
  const structuredContent = { ok: false, tool, error: errorDetails(error) };
  return {
    content: [{ type: "text" as const, text: jsonText(structuredContent) }],
    structuredContent,
    isError: true,
  };
}

async function execute(tool: string, handler: () => Promise<unknown>) {
  const startedAt = performance.now();
  try {
    const result = success(tool, await handler());
    telemetry.capture("avid_mcp_tool_call", {
      tool,
      outcome: "succeeded",
      duration_ms: Math.round(performance.now() - startedAt),
    });
    return result;
  } catch (error) {
    telemetry.capture("avid_mcp_tool_call", {
      tool,
      outcome: "failed",
      error_code: errorDetails(error).code,
      duration_ms: Math.round(performance.now() - startedAt),
    });
    return failure(tool, error);
  }
}

function requireInspect(config: ServerConfig): void {
  requireCapability(config.capabilities, "inspect");
}

export function createServer(config: ServerConfig = loadConfig()): McpServer {
  let ctmsClient: CtmsReadClient | undefined;
  const getCtmsClient = (): CtmsReadClient => {
    if (!config.ctmsRegistryUrl || !config.ctmsAccessToken || !config.ctmsAllowedOrigins?.length) {
      throw new Error(
        "CTMS is not configured; set AVID_MCP_CTMS_REGISTRY_URL, AVID_MCP_CTMS_ALLOWED_ORIGINS, and AVID_MCP_CTMS_ACCESS_TOKEN",
      );
    }
    ctmsClient ??= new CtmsReadClient({
      registryUrl: config.ctmsRegistryUrl,
      allowedOrigins: config.ctmsAllowedOrigins,
      accessToken: config.ctmsAccessToken,
      maxResponseBytes: config.ctmsMaxResponseBytes ?? 2 * 1024 * 1024,
      fetcher: createCtmsFetcher(config.ctmsMaxResponseBytes ?? 2 * 1024 * 1024),
    });
    return ctmsClient;
  };
  const server = new McpServer(
    { name: "avid-media-composer-mcp", version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );

  const native = new NativeAdapter(config);
  registerLibraryTools(server, config);
  server.registerTool("avid_native_read", {
    description: "Opt-in Windows native app/project/bin/clip/marker inspection. Requires AVID_MCP_NATIVE_BINARY and allowed project roots.",
    inputSchema: { query: z.enum(["app", "project", "bins", "bin", "clips", "clip", "markers", "link_settings"]), bin: z.string().optional(), mobId: z.string().optional() },
    outputSchema: TOOL_OUTPUT_SCHEMA, annotations: READ_ONLY_ANNOTATIONS,
  }, async ({ query, bin, mobId }) => execute("avid_native_read", () => native.read(query, bin, mobId)));
  server.registerTool("avid_native_preview", {
    description: "Preview one native operation with current project and target evidence; returns an expiring single-use token.",
    inputSchema: { operation: nativeActionSchema }, outputSchema: TOOL_OUTPUT_SCHEMA, annotations: READ_ONLY_ANNOTATIONS,
  }, async ({ operation }) => execute("avid_native_preview", () => native.preview(operation)));
  server.registerTool("avid_native_apply", {
    description: "Apply the exact reviewed native preview token once. Requires edit or project-write authority. No automatic undo or persistence guarantee.",
    inputSchema: { token: z.string().uuid() }, outputSchema: TOOL_OUTPUT_SCHEMA, annotations: EDIT_ANNOTATIONS,
  }, async ({ token }) => execute("avid_native_apply", () => native.apply(token)));

  server.registerTool(
    "avid_ping",
    {
      title: "Avid MCP health",
      description: "Return the server version and local operating mode without touching Avid or project files.",
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async () =>
      execute("avid_ping", async () => ({
        server: "avid-media-composer-mcp",
        version: SERVER_VERSION,
        mode: "local-stdio",
        sourceMediaPolicy: "read-only",
      })),
  );

  server.registerTool(
    "avid_get_capabilities",
    {
      title: "Avid MCP capabilities",
      description:
        "Report enabled authority, analysis dependencies, allowed roots, bridge state, and honest implementation tiers.",
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async () =>
      execute("avid_get_capabilities", async () => {
        const pythonOptions = {
          pythonExecutable: config.pythonExecutable,
          timeoutMs: config.commandTimeoutMs,
        };
        const [pythonInspector, ffprobe, bridge] = await Promise.all([
          probePythonInspector(pythonOptions),
          probeFfprobe(config.ffprobeExecutable, config.commandTimeoutMs),
          getBridgeStatus(config.bridgeDir),
        ]);
        return {
          authority: {
            enabled: [...config.capabilities].sort(),
            default: ["inspect"],
            availableProfiles: [
              "inspect",
              "edit",
              "project-write",
              "export",
              "unsafe-automation",
            ],
          },
          allowedRoots: config.allowedRoots,
          dependencies: { pythonInspector, ffprobe },
          native: { configured: Boolean(config.nativeBinary), qualification: "Windows 2024.12.58720 only; see native tools and validation evidence" },
          mediaLibrary: { configured: Boolean(config.outputRoot), matching: "metadata/transcript substring search and optional local CLIP similarity over sparse frame samples", modelsConfigured: Boolean(config.modelDirectory), speech: "optional local English Whisper; review accuracy" },
          bridge,
          compatibility: {
            supportedReleaseTracks: AVID_RELEASE_TRACKS,
            host: detectHostPlatform(),
          },
          implementation: {
            availableNow: [
              "project tree inventory and hashing",
              "AVP/AVS/config binary fingerprint and string analysis",
              "AVB bin analysis through pyavb when installed",
              "AAF analysis through pyaaf2 when installed",
              "ALE and CMX-style EDL parsing",
              "bounded OTIO structural analysis and interchange-fidelity warnings",
              "OTIO handoff manifests and local-media checksum previews",
              "source-marker and static SVG-overlay validation",
              "privacy-safe transcript revision QC",
              "metadata-only DNx 4.0 turnover QC",
              "SDK capability and Avid integration diagnostics",
              "clip/container/stream analysis through ffprobe",
              "guarded edit-plan preview",
            ],
            bridgeDependent: [
              "live project/bin/sequence/timeline inspection",
              "editing, effects, audio, color, captions, multicam, and output control",
            ],
            providerGate:
              "Avid Media Composer Extensions SDK access/onboarding and a locally installed bridge extension",
            optionalEnterprise:
              config.ctmsRegistryUrl && config.ctmsAccessToken
                ? "MediaCentral CTMS read adapter configured"
                : "MediaCentral CTMS requires an allowlisted HTTPS registry and scoped token",
          },
        };
      }),
  );

  server.registerTool(
    "avid_get_compatibility_matrix",
    {
      title: "Avid version and platform compatibility",
      description:
        "Return the qualified Windows and macOS rules for Media Composer 2025.12.x, 2025.6, and 2024.12.x.",
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async () =>
      execute("avid_get_compatibility_matrix", async () => ({
        verifiedAt: "2026-07-25",
        releaseTracks: AVID_RELEASE_TRACKS,
        host: detectHostPlatform(),
        caveat:
          "Avid qualification also depends on the workstation, GPU, I/O hardware, drivers, and shared-storage stack.",
      })),
  );

  server.registerTool(
    "avid_check_compatibility",
    {
      title: "Check an Avid host configuration",
      description:
        "Evaluate a Media Composer release, operating system, and architecture against the supported three-release matrix.",
      inputSchema: {
        media_composer_version: z.string().min(1),
        platform: z.enum(["windows", "macos"]),
        operating_system_version: z.string().optional(),
        architecture: z.enum(["x64", "arm64"]).optional(),
      },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({
      media_composer_version,
      platform,
      operating_system_version,
      architecture,
    }) =>
      execute("avid_check_compatibility", async () =>
        evaluateCompatibility({
          mediaComposerVersion: media_composer_version,
          platform,
          ...(operating_system_version
            ? { operatingSystemVersion: operating_system_version }
            : {}),
          ...(architecture ? { architecture } : {}),
        }),
      ),
  );

  server.registerTool(
    "avid_detect_installations",
    {
      title: "Detect Media Composer installations",
      description:
        "Check standard Windows or macOS application locations plus AVID_MCP_APPLICATION_PATH without launching Media Composer.",
      inputSchema: {
        platform: z.enum(["windows", "macos"]).optional(),
      },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ platform }) =>
      execute("avid_detect_installations", async () => {
        const host = detectHostPlatform();
        const selected = platform ?? host.platform;
        if (!selected) {
          return {
            supportedHost: false,
            host,
            message: "Specify windows or macos when running discovery from another platform.",
          };
        }
        return {
          supportedHost: true,
          host,
          ...(await detectInstallations(selected)),
        };
      }),
  );

  server.registerTool(
    "avid_get_bridge_status",
    {
      title: "Media Composer Extension bridge status",
      description:
        "Check whether a current, protocol-compatible Media Composer Extension heartbeat and capability declaration exists.",
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async () =>
      execute("avid_get_bridge_status", async () => {
        requireInspect(config);
        return getBridgeStatus(config.bridgeDir);
      }),
  );

  server.registerTool(
    "avid_get_edit_operation_catalog",
    {
      title: "Avid edit operation catalog",
      description:
        "List the full planned project, bin, media, timeline, effects, audio, color, multicam, and output action taxonomy.",
      inputSchema: {
        category: z.string().optional().describe("Optional exact category filter"),
        risk: z.enum(["low", "moderate", "destructive", "external"]).optional(),
      },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ category, risk }) =>
      execute("avid_get_edit_operation_catalog", async () => {
        requireInspect(config);
        const actions = EDIT_ACTION_CATALOG.filter(
          (definition) =>
            (category === undefined || definition.category === category) &&
            (risk === undefined || definition.risk === risk),
        );
        return {
          count: actions.length,
          totalCatalogCount: EDIT_ACTION_CATALOG.length,
          categories: [...new Set(EDIT_ACTION_CATALOG.map((item) => item.category))],
          actions,
          note: "Catalog presence is not proof of live support. Compare each action with bridge.capabilities.supportedEditOperations.",
        };
      }),
  );

  server.registerTool(
    "avid_discover_projects",
    {
      title: "Discover Avid projects",
      description:
        "Find directories containing .avp project files under an allowed root without opening or changing them.",
      inputSchema: {
        search_root: z.string().min(1),
        max_depth: z.number().int().min(0).max(20).default(6),
        max_directories: z.number().int().min(1).max(100_000).default(10_000),
      },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ search_root, max_depth, max_directories }) =>
      execute("avid_discover_projects", async () => {
        requireInspect(config);
        const root = await resolveReadablePath(search_root, config.allowedRoots, "directory");
        return discoverProjects(root, max_depth, max_directories);
      }),
  );

  server.registerTool(
    "avid_inventory_project_files",
    {
      title: "Inventory Avid project files",
      description:
        "Recursively classify project, bin, setting, lock, AAF, ALE, EDL, sidecar, document, and media files.",
      inputSchema: {
        project_path: z.string().min(1),
        include_hashes: z.boolean().default(false),
      },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ project_path, include_hashes }) =>
      execute("avid_inventory_project_files", async () => {
        requireInspect(config);
        const root = await resolveReadablePath(project_path, config.allowedRoots, "directory");
        return inventoryFiles(root, {
          maxFiles: config.maxFiles,
          includeHashes: include_hashes,
        });
      }),
  );

  server.registerTool(
    "avid_analyze_project",
    {
      title: "Analyze an Avid project",
      description:
        "Build a bounded, source-safe report covering files, locks, configurations, bins, AAF/ALE/EDL, and optional media metadata.",
      inputSchema: {
        project_path: z.string().min(1),
        include_hashes: z.boolean().default(false),
        include_configurations: z.boolean().default(true),
        include_bins: z.boolean().default(true),
        include_aaf: z.boolean().default(true),
        include_media_metadata: z.boolean().default(false),
        deep_media_analysis: z.boolean().default(false),
        python_max_depth: z.number().int().min(1).max(20).default(8),
        python_max_items: z.number().int().min(1).max(10_000).default(500),
      },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args) =>
      execute("avid_analyze_project", async () => {
        requireInspect(config);
        const root = await resolveReadablePath(args.project_path, config.allowedRoots, "directory");
        return analyzeProject(root, config, {
          includeHashes: args.include_hashes,
          includeConfigurations: args.include_configurations,
          includeBins: args.include_bins,
          includeAaf: args.include_aaf,
          includeMediaMetadata: args.include_media_metadata,
          deepMediaAnalysis: args.deep_media_analysis,
          pythonMaxDepth: args.python_max_depth,
          pythonMaxItems: args.python_max_items,
        });
      }),
  );

  server.registerTool(
    "avid_analyze_bin",
    {
      title: "Analyze an Avid bin",
      description:
        "Read a .avb bin through pyavb and return bounded object, mob, track, clip, sequence, view, and metadata detail.",
      inputSchema: {
        bin_path: z.string().min(1),
        max_depth: z.number().int().min(1).max(20).default(8),
        max_items: z.number().int().min(1).max(10_000).default(500),
      },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ bin_path, max_depth, max_items }) =>
      execute("avid_analyze_bin", async () => {
        requireInspect(config);
        const filePath = await resolveReadablePath(bin_path, config.allowedRoots, "file");
        return analyzeAvbWithPython(filePath, {
          pythonExecutable: config.pythonExecutable,
          timeoutMs: config.commandTimeoutMs,
          maxDepth: max_depth,
          maxItems: max_items,
        });
      }),
  );

  server.registerTool(
    "avid_analyze_aaf",
    {
      title: "Analyze AAF",
      description:
        "Read an AAF file through pyaaf2 and return bounded mob, slot, component, essence, descriptor, dictionary, and metadata detail.",
      inputSchema: {
        aaf_path: z.string().min(1),
        max_depth: z.number().int().min(1).max(20).default(8),
        max_items: z.number().int().min(1).max(10_000).default(500),
      },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ aaf_path, max_depth, max_items }) =>
      execute("avid_analyze_aaf", async () => {
        requireInspect(config);
        const filePath = await resolveReadablePath(aaf_path, config.allowedRoots, "file");
        return analyzeAafWithPython(filePath, {
          pythonExecutable: config.pythonExecutable,
          timeoutMs: config.commandTimeoutMs,
          maxDepth: max_depth,
          maxItems: max_items,
        });
      }),
  );

  server.registerTool(
    "avid_analyze_ale",
    {
      title: "Analyze ALE",
      description: "Parse all headings, columns, and data rows in an Avid Log Exchange file.",
      inputSchema: { ale_path: z.string().min(1) },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ ale_path }) =>
      execute("avid_analyze_ale", async () => {
        requireInspect(config);
        const filePath = await resolveReadablePath(ale_path, config.allowedRoots, "file");
        return analyzeAle(filePath);
      }),
  );

  server.registerTool(
    "avid_analyze_edl",
    {
      title: "Analyze EDL",
      description:
        "Parse CMX-style event, source/record timecode, transition, motion-effect, and clip-comment data.",
      inputSchema: { edl_path: z.string().min(1) },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ edl_path }) =>
      execute("avid_analyze_edl", async () => {
        requireInspect(config);
        const filePath = await resolveReadablePath(edl_path, config.allowedRoots, "file");
        return analyzeEdl(filePath);
      }),
  );

  server.registerTool(
    "avid_analyze_otio",
    {
      title: "Analyze OTIO",
      description:
        "Perform bounded, read-only structural validation of an OpenTimelineIO JSON file and report Media Composer interchange-fidelity risks without importing or modifying it.",
      inputSchema: {
        otio_path: z.string().min(1),
        max_bytes: z.number().int().min(1_024).max(64 * 1024 * 1024).default(16 * 1024 * 1024),
        max_depth: z.number().int().min(1).max(64).default(32),
        max_items: z.number().int().min(1).max(10_000).default(500),
      },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ otio_path, max_bytes, max_depth, max_items }) =>
      execute("avid_analyze_otio", async () => {
        requireInspect(config);
        const filePath = await resolveReadablePath(otio_path, config.allowedRoots, "file");
        return analyzeOtio(filePath, {
          maxBytes: max_bytes,
          maxDepth: max_depth,
          maxItems: max_items,
        });
      }),
  );

  server.registerTool(
    "avid_preview_otio_handoff",
    {
      title: "Preview an OTIO handoff",
      description:
        "Build a non-mutating OTIO import/relink manifest with bounded local-media checks and optional checksums.",
      inputSchema: {
        otio_path: z.string().min(1),
        media_roots: z.array(z.string().min(1)).max(32).default([]),
        include_checksums: z.boolean().default(false),
        max_media_references: z.number().int().min(1).max(10_000).default(500),
        max_checksum_bytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(4 * 1024 * 1024 * 1024),
      },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ otio_path, media_roots, include_checksums, max_media_references, max_checksum_bytes }) =>
      execute("avid_preview_otio_handoff", async () => {
        requireInspect(config);
        const filePath = await resolveReadablePath(otio_path, config.allowedRoots, "file");
        const roots = await Promise.all(
          (media_roots.length ? media_roots : config.allowedRoots).map((root) =>
            resolveReadablePath(root, config.allowedRoots, "directory"),
          ),
        );
        const preview = await previewOtioHandoff(filePath, {
          allowedMediaRoots: roots,
          includeChecksums: include_checksums,
          maxMediaReferences: max_media_references,
          maxChecksumBytes: max_checksum_bytes,
        });
        return { ...preview, digest: otioHandoffDigest(preview) };
      }),
  );

  server.registerTool(
    "avid_validate_marker_package",
    {
      title: "Validate source markers and SVG overlays",
      description:
        "Validate a bounded source-marker package and reject unsafe SVG without importing anything into Media Composer.",
      inputSchema: {
        markers: z
          .array(
            z.object({
              id: z.string().max(256).optional(),
              timecode: z.string().min(1).max(64),
              text: z.string().max(16_384).optional(),
              color: z.string().max(128).optional(),
              svg_overlay: z.string().max(64 * 1024).optional(),
            }),
          )
          .max(10_000),
        source_start_timecode: z.string().max(64).optional(),
        source_end_timecode: z.string().max(64).optional(),
        frame_rate: z.number().positive().max(120).optional(),
      },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ markers, source_start_timecode, source_end_timecode, frame_rate }) =>
      execute("avid_validate_marker_package", async () => {
        requireInspect(config);
        return validateSourceMarkerPackage({
          markers: markers.map((marker) => ({
            timecode: marker.timecode,
            ...(marker.id === undefined ? {} : { id: marker.id }),
            ...(marker.text === undefined ? {} : { text: marker.text }),
            ...(marker.color === undefined ? {} : { color: marker.color }),
            ...(marker.svg_overlay === undefined ? {} : { svgOverlay: marker.svg_overlay }),
          })),
          ...(source_start_timecode === undefined ? {} : { sourceStartTimecode: source_start_timecode }),
          ...(source_end_timecode === undefined ? {} : { sourceEndTimecode: source_end_timecode }),
          ...(frame_rate === undefined ? {} : { frameRate: frame_rate }),
        });
      }),
  );

  const transcriptTokenSchema = z.object({
    text: z.string().min(1).max(16_384),
    start_seconds: z.number().nonnegative().finite(),
    end_seconds: z.number().finite(),
    speaker: z.string().max(1_024).optional(),
    confidence: z.number().min(0).max(1).optional(),
  });
  server.registerTool(
    "avid_compare_transcripts",
    {
      title: "Compare transcript revisions",
      description:
        "Run bounded, local timing/speaker/revision QC and return aggregate findings without transcript text.",
      inputSchema: {
        baseline: z.array(transcriptTokenSchema).max(10_000),
        candidate: z.array(transcriptTokenSchema).max(10_000),
        gap_threshold_seconds: z.number().nonnegative().finite().default(0.5),
        max_comparison_cells: z.number().int().min(1).max(4_000_000).default(1_000_000),
      },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ baseline, candidate, gap_threshold_seconds, max_comparison_cells }) =>
      execute("avid_compare_transcripts", async () => {
        requireInspect(config);
        const mapTokens = (tokens: typeof baseline) =>
          tokens.map((token) => ({
            text: token.text,
            startSeconds: token.start_seconds,
            endSeconds: token.end_seconds,
            ...(token.speaker === undefined ? {} : { speaker: token.speaker }),
            ...(token.confidence === undefined ? {} : { confidence: token.confidence }),
          }));
        return compareTranscriptRevisions(
          { tokens: mapTokens(baseline) },
          { tokens: mapTokens(candidate) },
          { gapThresholdSeconds: gap_threshold_seconds, maxComparisonCells: max_comparison_cells },
        );
      }),
  );

  server.registerTool(
    "avid_analyze_dnx_turnover",
    {
      title: "Analyze DNx turnover metadata",
      description:
        "Assess supplied DNx/DNx 4.0 metadata and target-version risks without decoding or transcoding essence.",
      inputSchema: {
        codec: z.string().max(256).optional(),
        profile: z.string().max(256).optional(),
        dnx_generation: z.enum(["legacy", "4.0", "unknown"]).optional(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
        frame_rate: z.number().positive().max(120).optional(),
        bit_depth: z.number().int().positive().max(64).optional(),
        chroma_subsampling: z.string().max(128).optional(),
        pixel_format: z.string().max(128).optional(),
        color_space: z.string().max(128).optional(),
        color_transfer: z.string().max(128).optional(),
        target_media_composer_version: z.string().max(128).optional(),
      },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args) =>
      execute("avid_analyze_dnx_turnover", async () => {
        requireInspect(config);
        return analyzeDnxTurnover({
          ...(args.codec === undefined ? {} : { codec: args.codec }),
          ...(args.profile === undefined ? {} : { profile: args.profile }),
          ...(args.dnx_generation === undefined ? {} : { dnxGeneration: args.dnx_generation }),
          ...(args.width === undefined ? {} : { width: args.width }),
          ...(args.height === undefined ? {} : { height: args.height }),
          ...(args.frame_rate === undefined ? {} : { frameRate: args.frame_rate }),
          ...(args.bit_depth === undefined ? {} : { bitDepth: args.bit_depth }),
          ...(args.chroma_subsampling === undefined ? {} : { chromaSubsampling: args.chroma_subsampling }),
          ...(args.pixel_format === undefined ? {} : { pixelFormat: args.pixel_format }),
          ...(args.color_space === undefined ? {} : { colorSpace: args.color_space }),
          ...(args.color_transfer === undefined ? {} : { colorTransfer: args.color_transfer }),
          ...(args.target_media_composer_version === undefined
            ? {}
            : { targetMediaComposerVersion: args.target_media_composer_version }),
        });
      }),
  );

  server.registerTool(
    "avid_get_extension_capability_manifest",
    {
      title: "Get Extension SDK capability manifest",
      description:
        "Return the product-scoped SDK/onboarding/implementation/evidence status for cataloged edit operations.",
      inputSchema: { category: z.string().max(256).optional() },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ category }) =>
      execute("avid_get_extension_capability_manifest", async () => {
        requireInspect(config);
        const issues = validateExtensionCapabilityManifest();
        return {
          ...EXTENSION_CAPABILITY_MANIFEST,
          capabilities: EXTENSION_CAPABILITY_MANIFEST.capabilities.filter(
            (entry) => category === undefined || entry.category === category,
          ),
          validationIssues: issues,
          liveSupportClaimed: false,
        };
      }),
  );

  server.registerTool(
    "avid_diagnose_integrations",
    {
      title: "Diagnose Avid integration surfaces",
      description:
        "Distinguish AMA, AMT, AVX, AAX, NEXIS, and Distributed Processing prerequisites without treating them as timeline APIs.",
      inputSchema: {
        installed_paths: z
          .record(
            z.enum(["ama", "amt", "avx", "aax", "nexis", "distributed-processing"]),
            z.string().min(1),
          )
          .optional(),
      },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ installed_paths }) =>
      execute("avid_diagnose_integrations", async () => {
        requireInspect(config);
        const safePaths: Record<string, string> = {};
        for (const [surface, candidate] of Object.entries(installed_paths ?? {})) {
          safePaths[surface] = await resolveReadablePath(candidate, config.allowedRoots);
        }
        return diagnoseAvidIntegrations(safePaths);
      }),
  );

  server.registerTool(
    "avid_ctms_read",
    {
      title: "Read MediaCentral CTMS",
      description:
        "Discover the configured CTMS HAL registry or follow one advertised relation using scoped read-only credentials.",
      inputSchema: {
        relation: z.string().min(1).max(512).optional(),
        clear_session: z.boolean().default(false),
      },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: NETWORK_READ_ANNOTATIONS,
    },
    async ({ relation, clear_session }) =>
      execute("avid_ctms_read", async () => {
        requireInspect(config);
        const client = getCtmsClient();
        if (clear_session) client.clearSession();
        return relation ? client.readRelation(relation) : client.discover();
      }),
  );

  server.registerTool(
    "avid_analyze_configuration",
    {
      title: "Analyze Avid configuration",
      description:
        "Decode text/JSON/XML/key-value configuration or fingerprint and extract bounded strings from an opaque AVP/AVS/binary file.",
      inputSchema: {
        config_path: z.string().min(1),
        max_bytes: z.number().int().min(1_024).max(64 * 1024 * 1024).default(4 * 1024 * 1024),
      },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ config_path, max_bytes }) =>
      execute("avid_analyze_configuration", async () => {
        requireInspect(config);
        const filePath = await resolveReadablePath(config_path, config.allowedRoots, "file");
        return analyzeConfigurationFile(filePath, max_bytes);
      }),
  );

  server.registerTool(
    "avid_analyze_clip",
    {
      title: "Analyze a media clip",
      description:
        "Use ffprobe to return full container/stream metadata and a normalized editorial summary without modifying source media.",
      inputSchema: {
        clip_path: z.string().min(1),
        deep: z
          .boolean()
          .default(false)
          .describe("Count frames and packets; may read the full file and take substantially longer"),
        include_hash: z.boolean().default(false),
      },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ clip_path, deep, include_hash }) =>
      execute("avid_analyze_clip", async () => {
        requireInspect(config);
        const filePath = await resolveReadablePath(clip_path, config.allowedRoots, "file");
        return analyzeMediaFile(filePath, {
          executable: config.ffprobeExecutable,
          timeoutMs: deep ? Math.max(config.commandTimeoutMs, 5 * 60_000) : config.commandTimeoutMs,
          deep,
          includeHash: include_hash,
        });
      }),
  );

  server.registerTool(
    "avid_get_live_state",
    {
      title: "Inspect live Media Composer state",
      description:
        "Ask a connected Media Composer Extension to return current project, bins, clips, sequences, tracks, settings, selection, and playback state.",
      inputSchema: {
        scope: z
          .enum(["summary", "project", "bins", "clips", "sequences", "timeline", "settings", "full"])
          .default("summary"),
        options: z.record(z.string(), z.unknown()).default({}),
      },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ scope, options }) =>
      execute("avid_get_live_state", async () => {
        requireInspect(config);
        const response = await sendBridgeCommand(
          config.bridgeDir,
          "inspect.getState",
          { scope, options },
          config.commandTimeoutMs,
        );
        return { operationId: response.operationId, state: response.data };
      }),
  );

  server.registerTool(
    "avid_preview_edit_plan",
    {
      title: "Preview Avid edit plan",
      description:
        "Validate a compound edit plan, classify risk, compare it with the connected bridge, and return an exact confirmation token without changing Avid.",
      inputSchema: { plan: z.record(z.string(), z.unknown()) },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ plan }) => execute("avid_preview_edit_plan", () => previewEditPlan(plan, config)),
  );

  server.registerTool(
    "avid_apply_edit_plan",
    {
      title: "Apply confirmed Avid edit plan",
      description:
        "Apply the exact previously previewed plan through a connected Media Composer Extension after capability, action, destructive-opt-in, and token checks.",
      inputSchema: {
        plan: z.record(z.string(), z.unknown()),
        confirmation_token: z.string().length(64),
      },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: EDIT_ANNOTATIONS,
    },
    async ({ plan, confirmation_token }) =>
      execute("avid_apply_edit_plan", () => applyEditPlan(plan, confirmation_token, config)),
  );

  server.registerResource(
    "avid-edit-action-catalog",
    "avid://catalog/edit-actions",
    {
      title: "Avid Media Composer edit action catalog",
      description:
        "Machine-readable planned action taxonomy; connected bridge capability data remains authoritative.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              version: 1,
              count: EDIT_ACTION_CATALOG.length,
              actions: EDIT_ACTION_CATALOG,
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.registerPrompt(
    "avid-project-audit",
    {
      title: "Audit an Avid project",
      description: "Source-safe workflow for a complete offline Avid project audit.",
      argsSchema: {
        project_path: z.string(),
        include_media: z.string().optional(),
      },
    },
    ({ project_path, include_media }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Audit the Avid project at ${project_path}. Start with avid_get_capabilities, then use avid_analyze_project with hashes enabled and include_media_metadata=${include_media === "true"}. Separate parsed facts, opaque/unpublished format limits, dependency gaps, lock/collaboration risks, and recommendations. Do not modify source media or project files.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "avid-safe-edit",
    {
      title: "Plan and verify an Avid edit",
      description: "Inspection-first workflow for a guarded live edit.",
      argsSchema: { goal: z.string() },
    },
    ({ goal }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Goal: ${goal}\n\nCall avid_get_bridge_status and avid_get_live_state first. Build a bounded edit plan with expectedState guards, call avid_preview_edit_plan, explain destructive and external operations, then apply only the exact reviewed plan token. Re-inspect the affected state afterward. Never claim success from preview or request submission alone.`,
          },
        },
      ],
    }),
  );

  return server;
}
