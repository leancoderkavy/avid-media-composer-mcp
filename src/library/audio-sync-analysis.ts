import {createHash} from "node:crypto";
import * as z from "zod/v4";
import type {ServerConfig} from "../config.js";
import {MediaLibrary} from "./media-library.js";
import {requireCapability} from "../security/capabilities.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {sha256File} from "../analysis/file-inventory.js";
import {runBinaryProcess} from "../process.js";
import {parseAudioTiming} from "./audio-timing.js";
import {audioEnvelope, estimateAudioOffset} from "./audio-sync.js";

export const audioSyncSource = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  stream: z.number().int().nonnegative(), channel: z.number().int().min(0).max(63),
  startSeconds: z.number().min(0).max(600).default(0),
  durationSeconds: z.number().min(2).max(60),
}).strict();
export const audioSyncOptions = z.object({reference: audioSyncSource, comparison: audioSyncSource,
  maxOffsetSeconds: z.number().min(0.01).max(5).default(5)}).strict();

export class AudioSyncAnalysis {
  constructor(private readonly config: ServerConfig) {}
  private async source(input: z.infer<typeof audioSyncSource>) {
    const entry = await new MediaLibrary(this.config).validatedMetadata(input.id);
    const file = await resolveReadablePath(entry.file, this.config.allowedRoots, "file");
    if (await sha256File(file) !== input.id) throw new Error("Audio sync source changed; reindex");
    const streams = (entry.metadata.streams ?? []).filter((stream: any) => stream.index === input.stream);
    const stream = streams[0];
    if (streams.length !== 1 || stream?.codec_type !== "audio") throw new Error("Select an available absolute audio stream index");
    const sampleRate = Number(stream.sample_rate), channels = Number(stream.channels);
    if (!Number.isInteger(sampleRate) || sampleRate < 100 || sampleRate > 192000)
      throw new Error("Audio sync sample rate is unsupported");
    if (!Number.isInteger(channels) || input.channel >= channels) throw new Error("Audio sync channel is unavailable");
    const startSample = Math.floor(input.startSeconds * sampleRate), samples = Math.floor(input.durationSeconds * sampleRate);
    return {file, input, sampleRate, startSample, samples};
  }
  async analyze(value: z.input<typeof audioSyncOptions>) {
    requireCapability(this.config.capabilities, "inspect"); requireCapability(this.config.capabilities, "export");
    const options = audioSyncOptions.parse(value);
    // Validate both sources before decoding either one.
    const reference = await this.source(options.reference), comparison = await this.source(options.comparison);
      const decode = async (source: typeof reference) => {
        const filter = `atrim=start_sample=${source.startSample}:end_sample=${source.startSample + source.samples},pan=mono|c0=c${source.input.channel},asettb=1/${source.sampleRate},ashowinfo`;
        const args = ["-hide_banner", "-nostdin", "-nostats", "-xerror", "-v", "info", "-protocol_whitelist", "file,pipe",
          "-i", source.file, "-map", `0:${source.input.stream}`, "-vn", "-af", filter, "-c:a", "pcm_f32le", "-f", "f32le", "pipe:1"];
        const decoded = await runBinaryProcess(this.config.ffmpegExecutable ?? "ffmpeg", args,
          {timeoutMs: Math.min(Math.max(this.config.commandTimeoutMs, 30000), 120000), maxOutputBytes: source.samples * 4 + 4 * 1024 * 1024});
        if (decoded.exitCode !== 0) throw new Error(`Audio sync decode failed: ${decoded.stderr.slice(-1000)}`);
        const timing = parseAudioTiming(decoded.stderr, source.sampleRate);
        if (timing.samples !== source.samples) throw new Error("Audio sync decoded sample count does not cover the requested window");
        const bytes = decoded.stdout;
        if (bytes.length !== source.samples * 4) throw new Error("Audio sync PCM and timing sample counts disagree");
        const pcm = Float32Array.from({length: source.samples}, (_, i) => bytes.readFloatLE(i * 4));
        const envelope = audioEnvelope(pcm, source.sampleRate);
        return {envelope, provenance: {
          ...source.input, sampleRate: source.sampleRate, startSample: source.startSample, decodedSamples: source.samples,
          envelopeSamples: envelope.length,
          envelopeBoundaryRounding: "ceil-absolute-sample" as const,
          discardedTailSamples: source.samples - Math.ceil(envelope.length * source.sampleRate / 100), pcmSha256: createHash("sha256").update(bytes).digest("hex"),
          timing, filter, timestampContinuityObserved: timing.discontinuities === 0,
        }};
      };
      const a = await decode(reference), b = await decode(comparison);
      if (await sha256File(reference.file) !== reference.input.id || await sha256File(comparison.file) !== comparison.input.id)
        throw new Error("Audio sync source changed during analysis; result discarded");
      const estimate = estimateAudioOffset(a.envelope, b.envelope, options.maxOffsetSeconds);
      return {schema: 1, kind: "audio_sync", reference: a.provenance, comparison: b.provenance, estimate,
        sourceUnchanged: true, reviewRequired: true, sourceClockOffset: null, mediaModified: false, pcmStorage: "bounded-memory",
        meaning: "Content offsets use decoded sample windows. startSeconds selects samples from decoded stream beginning, not container PTS. Timestamp gaps/overlaps are reported separately and never converted into a source-clock sync or edit offset. Results persist in the analysis job journal; this decoder writes no PCM scratch files."};
  }
}
