import {it, expect, vi, beforeEach} from "vitest";
import {mkdtemp, mkdir, writeFile, readdir} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {AudioSyncAnalysis, audioSyncOptions} from "../src/library/audio-sync-analysis.js";
import {jobSchema} from "../src/library/jobs.js";
import {loadConfig} from "../src/config.js";
import {sha256File} from "../src/analysis/file-inventory.js";
const run = vi.hoisted(() => vi.fn());
vi.mock("../src/process.js", () => ({runProcess: (...args: unknown[]) => run(...args)}));
beforeEach(() => { run.mockReset(); });
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "avid-sync-test-")), file = path.join(root, "source.wav");
  await writeFile(file, "fixture source"); const id = await sha256File(file);
  const library = path.join(root, "avid-mcp-library"); await mkdir(library);
  await writeFile(path.join(library, id + ".json"), JSON.stringify({id, file, transcript: [], metadata: {streams: [
    {index: 0, codec_type: "video"}, {index: 3, codec_type: "audio", channels: 2, sample_rate: "1000"},
  ]}}));
  const config = loadConfig({AVID_MCP_ALLOWED_ROOTS: root, AVID_MCP_OUTPUT_ROOT: root, AVID_MCP_CAPABILITIES: "inspect,export"});
  const source = {id, stream: 3, channel: 1, startSeconds: 0, durationSeconds: 2};
  return {root, file, library, config, options: {reference: source, comparison: {...source}}};
}
function decoder(mode = "pass", mutate?: () => Promise<void>) {
  run.mockImplementation(async (_executable, args) => {
    const bytes = Buffer.alloc(2000 * 4);
    for (let i = 0; i < 2000; i++) bytes.writeFloatLE(0.1 + ((Math.floor(i / 10) * 97) % 199) / 300, i * 4);
    await writeFile(args.at(-1), mode === "short_pcm" ? bytes.subarray(0, 4000) : bytes);
    await mutate?.();
    const line = (n: number, pts: number, samples: number) => `[Parsed_ashowinfo_3 @ x] n:${n} pts:${pts} pts_time:0 fmt:flt channels:1 rate:1000 nb_samples:${samples}`;
    return {exitCode: mode === "failed" ? 1 : 0, stdout: "", stderr: mode === "missing_timing" ? "" :
      mode === "short_timing" ? line(0, 0, 1000) : [line(0, 0, 1000), line(1, mode === "gap" ? 1100 : 1000, 1000)].join("\n")};
  });
}
it("routes a bounded audio sync job and records explicit stream/channel/sample provenance", async () => {
  const f = await fixture(); decoder();
  expect(jobSchema.parse({kind: "audio_sync", options: f.options}).kind).toBe("audio_sync");
  const result = await new AudioSyncAnalysis(f.config).analyze(f.options);
  expect(result.reference).toMatchObject({stream: 3, channel: 1, sampleRate: 1000, decodedSamples: 2000, timestampContinuityObserved: true});
  expect(result.estimate.best?.offsetSeconds).toBe(0); expect(result.sourceClockOffset).toBeNull();
  expect(run.mock.calls[0]![1]).toContain("0:3");
  expect(result.reference.filter).toContain("pan=mono|c0=c1");
  expect((await readdir(f.library)).filter(name => name.startsWith("audio-sync-"))).toEqual([]);
});
it("reports discontinuities without converting content offsets to source-clock sync", async () => {
  const f = await fixture(); decoder("gap");
  const result = await new AudioSyncAnalysis(f.config).analyze(f.options);
  expect(result.reference.timing.gapSamples).toBe(100); expect(result.reference.timestampContinuityObserved).toBe(false);
  expect(result.sourceClockOffset).toBeNull(); expect(result.estimate.verifiedSync).toBe(false);
});
it("rejects unavailable selections and export denial before decoding", async () => {
  const f = await fixture();
  for (const selection of [{stream: 0}, {stream: 9}, {channel: 2}]) {
    await expect(new AudioSyncAnalysis(f.config).analyze({...f.options, comparison: {...f.options.comparison, ...selection}})).rejects.toThrow();
  }
  f.config.capabilities.delete("export");
  await expect(new AudioSyncAnalysis(f.config).analyze(f.options)).rejects.toThrow(); expect(run).not.toHaveBeenCalled();
});
it("rejects changed sources after decoding and cleans temporary PCM", async () => {
  const f = await fixture(); decoder("pass", () => writeFile(f.file, "changed"));
  await expect(new AudioSyncAnalysis(f.config).analyze(f.options)).rejects.toThrow("changed during analysis");
  expect((await readdir(f.library)).filter(name => name.startsWith("audio-sync-"))).toEqual([]);
});
it.each(["failed", "missing_timing", "short_timing", "short_pcm"])("rejects incomplete decode: %s", async mode => {
  const f = await fixture(); decoder(mode);
  await expect(new AudioSyncAnalysis(f.config).analyze(f.options)).rejects.toThrow();
  expect((await readdir(f.library)).filter(name => name.startsWith("audio-sync-"))).toEqual([]);
});
it("requires explicit selections and bounded windows", async () => {
  const f = await fixture();
  for (const change of [{durationSeconds: 61}, {startSeconds: 601}, {channel: -1}, {stream: undefined}])
    expect(() => audioSyncOptions.parse({...f.options, comparison: {...f.options.comparison, ...change}})).toThrow();
});
