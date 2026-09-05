import path from "node:path";
import { AvidMcpError } from "../errors.js";
import type { DependencyStatus } from "../types.js";
import { runProcess } from "../process.js";
import { sha256File } from "./file-inventory.js";

interface FfprobeStream {
  index?: number;
  codec_name?: string;
  codec_long_name?: string;
  codec_type?: string;
  profile?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  color_space?: string;
  color_transfer?: string;
  color_primaries?: string;
  field_order?: string;
  sample_rate?: string;
  channels?: number;
  channel_layout?: string;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  time_base?: string;
  start_time?: string;
  duration?: string;
  bit_rate?: string;
  nb_frames?: string;
  nb_read_frames?: string;
  nb_read_packets?: string;
  tags?: Record<string, string>;
  [key: string]: unknown;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: Record<string, unknown> & {
    format_name?: string;
    format_long_name?: string;
    start_time?: string;
    duration?: string;
    size?: string;
    bit_rate?: string;
    tags?: Record<string, string>;
  };
  programs?: unknown[];
  chapters?: unknown[];
  [key: string]: unknown;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function frameRate(value: string | undefined): number | undefined {
  if (!value || value === "0/0") return undefined;
  const [numerator, denominator] = value.split("/").map(Number);
  if (
    numerator === undefined ||
    denominator === undefined ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    !denominator
  ) {
    return undefined;
  }
  return Number((numerator / denominator).toFixed(6));
}

export async function probeFfprobe(
  executable: string,
  timeoutMs: number,
  processRunner: typeof runProcess = runProcess,
): Promise<DependencyStatus> {
  return probeMediaExecutable("ffprobe", executable, timeoutMs, processRunner);
}

export async function probeFfmpeg(
  executable: string,
  timeoutMs: number,
  processRunner: typeof runProcess = runProcess,
): Promise<DependencyStatus> {
  return probeMediaExecutable("ffmpeg", executable, timeoutMs, processRunner);
}

async function probeMediaExecutable(
  tool: "ffmpeg" | "ffprobe",
  executable: string,
  timeoutMs: number,
  processRunner: typeof runProcess,
): Promise<DependencyStatus> {
  try {
    const result = await processRunner(executable, ["-version"], {
      timeoutMs,
      maxOutputBytes: 256_000,
    });
    if (result.exitCode !== 0) {
      return { available: false, executable, error: result.stderr.trim() || `exit ${result.exitCode}` };
    }
    const firstLine = result.stdout.split(/\r?\n/, 1)[0] ?? "";
    const prefix = new RegExp(`^${tool} version\\s+(.+)`, "i");
    const version = prefix.exec(firstLine)?.[1];
    if (!version) return {available:false,executable,error:`Executable did not identify itself as ${tool}`};
    return { available: true, executable, version };
  } catch (error) {
    return {
      available: false,
      executable,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface MediaAnalysisOptions {
  executable: string;
  timeoutMs: number;
  deep: boolean;
  includeHash: boolean;
}

export async function analyzeMediaFile(
  filePath: string,
  options: MediaAnalysisOptions,
  processRunner: typeof runProcess = runProcess,
): Promise<Record<string, unknown>> {
  const args = [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    "-show_programs",
    "-show_chapters",
  ];
  if (options.deep) args.push("-count_frames", "-count_packets");
  args.push(filePath);

  const result = await processRunner(options.executable, args, {
    timeoutMs: options.timeoutMs,
    maxOutputBytes: 32 * 1024 * 1024,
  });
  if (result.exitCode !== 0) {
    throw new AvidMcpError("FFPROBE_FAILED", `ffprobe could not analyze ${filePath}`, {
      exitCode: result.exitCode,
      stderr: result.stderr.trim().slice(0, 8_000),
    });
  }

  let raw: FfprobeOutput;
  try {
    raw = JSON.parse(result.stdout) as FfprobeOutput;
  } catch (error) {
    throw new AvidMcpError("FFPROBE_INVALID_JSON", "ffprobe returned invalid JSON", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const streams = raw.streams ?? [];
  const video = streams
    .filter((stream) => stream.codec_type === "video")
    .map((stream) => ({
      index: stream.index,
      codec: stream.codec_name,
      codecLongName: stream.codec_long_name,
      profile: stream.profile,
      width: stream.width,
      height: stream.height,
      pixelFormat: stream.pix_fmt,
      colorSpace: stream.color_space,
      colorTransfer: stream.color_transfer,
      colorPrimaries: stream.color_primaries,
      fieldOrder: stream.field_order,
      nominalFrameRate: frameRate(stream.r_frame_rate),
      averageFrameRate: frameRate(stream.avg_frame_rate),
      durationSeconds: numberValue(stream.duration),
      frameCount: numberValue(stream.nb_frames ?? stream.nb_read_frames),
      packetCount: numberValue(stream.nb_read_packets),
      timecode: stream.tags?.timecode ?? stream.tags?.TIMECODE,
    }));
  const audio = streams
    .filter((stream) => stream.codec_type === "audio")
    .map((stream) => ({
      index: stream.index,
      codec: stream.codec_name,
      codecLongName: stream.codec_long_name,
      profile: stream.profile,
      sampleRate: numberValue(stream.sample_rate),
      channels: stream.channels,
      channelLayout: stream.channel_layout,
      durationSeconds: numberValue(stream.duration),
      bitRate: numberValue(stream.bit_rate),
    }));

  return {
    path: filePath,
    fileName: path.basename(filePath),
    deep: options.deep,
    summary: {
      container: raw.format?.format_name,
      containerLongName: raw.format?.format_long_name,
      durationSeconds: numberValue(raw.format?.duration),
      startTimeSeconds: numberValue(raw.format?.start_time),
      sizeBytes: numberValue(raw.format?.size),
      bitRate: numberValue(raw.format?.bit_rate),
      streamCount: streams.length,
      video,
      audio,
      timecode: raw.format?.tags?.timecode ?? raw.format?.tags?.TIMECODE,
    },
    ...(options.includeHash ? { sha256: await sha256File(filePath) } : {}),
    raw,
  };
}
