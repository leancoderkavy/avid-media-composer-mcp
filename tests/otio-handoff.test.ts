import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { previewOtioHandoff } from "../src/interchange/otio-handoff.js";

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((entry) => rm(entry, { recursive: true, force: true }))); });

function otio(mediaUrl: string): string {
  return JSON.stringify({
    OTIO_SCHEMA: "Timeline.1", tracks: { OTIO_SCHEMA: "Stack.1", children: [{ OTIO_SCHEMA: "Track.1", kind: "Video", children: [{ OTIO_SCHEMA: "Clip.2", media_reference: { OTIO_SCHEMA: "ExternalReference.1", target_url: mediaUrl } }] }] },
  });
}

describe("OTIO handoff preview", () => {
  it("produces a bounded manifest and hash for local, allowlisted media", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "avid-otio-handoff-"));
    temporary.push(root);
    const media = path.join(root, "clip.mov");
    const timeline = path.join(root, "timeline.otio");
    await writeFile(media, "picture", "utf8");
    await writeFile(timeline, otio(new URL(`file:///${media.replace(/\\/g, "/")}`).toString()), "utf8");
    const result = await previewOtioHandoff(timeline, { allowedMediaRoots: [root], includeChecksums: true });
    expect(result.readyForManualImport).toBe(true);
    expect(result.source.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.mediaManifest).toEqual([expect.objectContaining({ status: "linked-file", sizeBytes: 7, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) })]);
  });

  it("blocks missing and out-of-root media without reading it", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "avid-otio-handoff-"));
    const outside = await mkdtemp(path.join(os.tmpdir(), "avid-otio-outside-"));
    temporary.push(root, outside);
    const timeline = path.join(root, "timeline.otio");
    const hidden = path.join(outside, "clip.mov");
    await writeFile(hidden, "secret", "utf8");
    await writeFile(timeline, otio(new URL(`file:///${hidden.replace(/\\/g, "/")}`).toString()), "utf8");
    const result = await previewOtioHandoff(timeline, { allowedMediaRoots: [root] });
    expect(result.readyForManualImport).toBe(false);
    expect(result.mediaManifest[0]).toMatchObject({ status: "outside-allowed-roots" });
    expect(result.blockers.join(" ")).toContain("outside the allowed media roots");
  });
});
