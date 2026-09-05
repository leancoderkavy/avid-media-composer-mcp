import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeMediaFile, probeFfmpeg, probeFfprobe } from "../src/analysis/media.js";
import type { ProcessResult } from "../src/process.js";

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

function result(overrides: Partial<ProcessResult> = {}): ProcessResult {
  return { exitCode: 0, stdout: "", stderr: "", ...overrides };
}

describe("ffprobe media analysis", () => {
  it("distinguishes encoder and inspector executables even when both exit successfully", async () => {
    expect(await probeFfmpeg("ffmpeg",100,async()=>result({stdout:"ffmpeg version 8.0\n"}))).toMatchObject({available:true,version:"8.0"});
    expect(await probeFfmpeg("wrong",100,async()=>result({stdout:"ffprobe version 8.0\n"}))).toMatchObject({available:false});
    expect(await probeFfprobe("wrong",100,async()=>result({stdout:"ffmpeg version 8.0\n"}))).toMatchObject({available:false});
    expect(await probeFfmpeg("empty",100,async()=>result())).toMatchObject({available:false});
  });
  it("reports dependency versions and nonzero exits", async () => {
    expect(
      await probeFfprobe("ffprobe", 100, async () =>
        result({ stdout: "ffprobe version 7.1-full\nbuilt with test" }),
      ),
    ).toEqual({ available: true, executable: "ffprobe", version: "7.1-full" });

    expect(
      await probeFfprobe("broken", 100, async () =>
        result({ exitCode: 2, stderr: "not working" }),
      ),
    ).toEqual({ available: false, executable: "broken", error: "not working" });
  });

  it("normalizes process-launch failures as unavailable dependencies", async () => {
    const status = await probeFfprobe("missing", 100, async () => {
      throw new Error("executable missing");
    });
    expect(status).toEqual({
      available: false,
      executable: "missing",
      error: "executable missing",
    });
  });

  it("summarizes video, audio, timecode, rates, counts, and optional hashes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "avid-media-analysis-"));
    temporary.push(root);
    const file = path.join(root, "clip.mov");
    await writeFile(file, "media fixture", "utf8");
    let observedArgs: readonly string[] = [];
    const analysis = await analyzeMediaFile(
      file,
      { executable: "ffprobe", timeoutMs: 100, deep: true, includeHash: true },
      async (_executable, args) => {
        observedArgs = args;
        return result({
          stdout: JSON.stringify({
            streams: [
              {
                index: 0,
                codec_type: "video",
                codec_name: "dnxhd",
                codec_long_name: "VC-3",
                profile: "DNXHR HQX",
                width: 3840,
                height: 2160,
                pix_fmt: "yuv422p10le",
                color_space: "bt2020nc",
                color_transfer: "smpte2084",
                color_primaries: "bt2020",
                field_order: "progressive",
                r_frame_rate: "24000/1001",
                avg_frame_rate: "0/0",
                duration: "12.5",
                nb_read_frames: "300",
                nb_read_packets: "301",
                tags: { TIMECODE: "01:00:00:00" },
              },
              {
                index: 1,
                codec_type: "audio",
                codec_name: "pcm_s24le",
                sample_rate: "48000",
                channels: 2,
                channel_layout: "stereo",
                duration: "12.5",
                bit_rate: "2304000",
              },
              { index: 2, codec_type: "data" },
            ],
            format: {
              format_name: "mov",
              format_long_name: "QuickTime / MOV",
              duration: "12.5",
              start_time: "0",
              size: "123456",
              bit_rate: "987654",
              tags: { timecode: "01:00:00:00" },
            },
            programs: [],
            chapters: [],
          }),
        });
      },
    );
    expect(observedArgs).toEqual(expect.arrayContaining(["-count_frames", "-count_packets", file]));
    expect(analysis).toMatchObject({
      fileName: "clip.mov",
      deep: true,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      summary: {
        container: "mov",
        durationSeconds: 12.5,
        streamCount: 3,
        timecode: "01:00:00:00",
        video: [
          {
            codec: "dnxhd",
            nominalFrameRate: 23.976024,
            averageFrameRate: undefined,
            frameCount: 300,
            packetCount: 301,
          },
        ],
        audio: [
          {
            codec: "pcm_s24le",
            sampleRate: 48000,
            channels: 2,
            bitRate: 2304000,
          },
        ],
      },
    });
  });

  it("reports ffprobe failures and invalid JSON with stable error codes", async () => {
    await expect(
      analyzeMediaFile(
        "clip.mov",
        { executable: "ffprobe", timeoutMs: 100, deep: false, includeHash: false },
        async () => result({ exitCode: 1, stderr: "bad input" }),
      ),
    ).rejects.toMatchObject({ code: "FFPROBE_FAILED" });

    await expect(
      analyzeMediaFile(
        "clip.mov",
        { executable: "ffprobe", timeoutMs: 100, deep: false, includeHash: false },
        async () => result({ stdout: "not-json" }),
      ),
    ).rejects.toMatchObject({ code: "FFPROBE_INVALID_JSON" });
  });
});
