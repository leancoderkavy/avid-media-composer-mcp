import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import type { ServerConfig } from "../src/config.js";
import { createServer } from "../src/server.js";

const fixture = path.resolve("tests/fixtures/sample-project");

function testConfig(): ServerConfig {
  return {
    allowedRoots: [fixture],
    capabilities: new Set(["inspect"]),
    pythonExecutable: path.resolve(
      ".venv",
      process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
    ),
    ffprobeExecutable: "ffprobe",
    maxFiles: 1_000,
    maxBins: 20,
    maxMediaFiles: 20,
    commandTimeoutMs: 10_000,
  };
}

describe("MCP server surface", () => {
  it("advertises modern tools, annotations, resources, prompts, and structured results", async () => {
    const server = createServer(testConfig());
    const client = new Client({ name: "avid-mcp-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const tools = await client.listTools();
      expect(tools.tools).toHaveLength(143);
      expect(tools.tools.find(tool=>tool.name==="avid_watch_lock_status")?.annotations?.readOnlyHint).toBe(true);
      expect(tools.tools.find(tool=>tool.name==="avid_recover_watch_lock")?.annotations?.readOnlyHint).toBe(false);
      expect(tools.tools.find(tool=>tool.name==="avid_source_clock_status")?.annotations?.readOnlyHint).toBe(true);
      const unconfigured=await client.callTool({name:"avid_jumper_read",arguments:{operation:"health"}});
      expect(unconfigured.isError).toBe(true);
      expect(JSON.stringify(unconfigured)).toContain("Optional Jumper provider is not configured");
      expect(tools.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining([
          "avid_prepare_source_clock_media",
          "avid_people_runs", "avid_people_run", "avid_resume_people",
          "avid_people_indices",
          "avid_find_similar_faces",
          "avid_summarize_captions", "avid_visual_summary_node", "avid_list_visual_summaries", "avid_delete_visual_summary", "avid_caption_batch", "avid_caption_runs", "avid_caption_run", "avid_resume_captions", "avid_caption_frame", "avid_read_caption", "avid_list_captions", "avid_correct_caption", "avid_delete_caption",
          "avid_detect_speech_language",
          "avid_speech_runs", "avid_speech_run", "avid_resume_speech",
          "avid_summary_runs", "avid_summary_run", "avid_resume_summary",
          "avid_visual_index_runs", "avid_visual_index_run", "avid_resume_visual_index",
          "avid_get_compatibility_matrix",
          "avid_check_compatibility",
          "avid_detect_installations",
          "avid_preview_otio_handoff",
          "avid_validate_marker_package",
          "avid_compare_transcripts",
          "avid_analyze_dnx_turnover",
          "avid_get_extension_capability_manifest",
          "avid_diagnose_integrations",
          "avid_ctms_read",
          "avid_diarize_audio",
          "avid_speaker_checkpoint",
          "avid_resume_speakers",
          "avid_align_speakers",
          "avid_correct_speaker_analysis",
          "avid_assign_transcript_speakers",
          "avid_transcript_speaker_assignments",
          "avid_speaker_analysis",
          "avid_speaker_analyses",
          "avid_delete_speaker_analysis",
        ]),
      );
      expect(tools.tools.map((tool) => tool.name)).toContain("avid_analyze_project");
      expect(tools.tools.map((tool) => tool.name)).toContain("avid_analyze_otio");
      expect(tools.tools.find((tool) => tool.name === "avid_analyze_clip")?.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
      });
      expect(tools.tools.find((tool) => tool.name === "avid_apply_edit_plan")?.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
      });

      const resources = await client.listResources();
      expect(resources.resources.map((resource) => resource.uri)).toContain(
        "avid://catalog/edit-actions",
      );
      const prompts = await client.listPrompts();
      expect(prompts.prompts.map((prompt) => prompt.name)).toEqual(
        expect.arrayContaining(["avid-project-audit", "avid-safe-edit"]),
      );

      const result = await client.callTool({
        name: "avid_analyze_ale",
        arguments: { ale_path: path.join(fixture, "Clips.ale") },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        ok: true,
        tool: "avid_analyze_ale",
      });

      const markerResult = await client.callTool({
        name: "avid_validate_marker_package",
        arguments: {
          frame_rate: 24,
          markers: [{ timecode: "00:00:01:00", text: "Review" }],
        },
      });
      expect(markerResult.structuredContent).toMatchObject({
        ok: true,
        tool: "avid_validate_marker_package",
      });

      const manifestResult = await client.callTool({
        name: "avid_get_extension_capability_manifest",
        arguments: {},
      });
      expect(manifestResult.structuredContent).toMatchObject({
        ok: true,
        tool: "avid_get_extension_capability_manifest",
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
