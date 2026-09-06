import {mkdir, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {audioEnvelope, estimateAudioOffset} from '../../dist/library/audio-sync.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import {loadConfig} from '../../dist/config.js';

const source = 'D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const id = '3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca';
assert.equal(await sha256File(source), id);
const root = path.resolve('.avid-mcp-analysis', `audio-sync-variants-${randomUUID()}`); await mkdir(root);
const executable = loadConfig().ffmpegExecutable ?? 'ffmpeg', rate = 8000;
const execute = (args, input) => {
  const result = spawnSync(executable, ['-nostdin', '-v', 'error', ...args], {input, windowsHide: true, timeout: 60000, maxBuffer: 4 * 1024 * 1024});
  assert.ifError(result.error); assert.equal(result.status, 0, result.stderr?.toString()); return result.stdout;
};
const samples = bytes => { assert.equal(bytes.length % 4, 0); return Float32Array.from({length: bytes.length / 4}, (_, i) => bytes.readFloatLE(i * 4)); };
const bytes = pcm => { const result = Buffer.alloc(pcm.length * 4); pcm.forEach((value, i) => result.writeFloatLE(value, i * 4)); return result; };
const pcm = samples(execute(['-i', source, '-map', '0:a:0', '-vn', '-af', 'pan=mono|c0=c0,aresample=8000,atrim=end_sample=240000,asetpts=N/SR/TB', '-c:a', 'pcm_f32le', '-f', 'f32le', 'pipe:1']));
assert.equal(pcm.length, rate * 30); const reference = audioEnvelope(pcm, rate);
const make = (delay, noise = 0, speed = 1) => {
  const lead = Math.round(delay * rate), result = new Float32Array(lead + Math.floor(pcm.length / speed)); let state = 20260906;
  for (let i = 0; i < result.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const position = (i - lead) * speed, index = Math.floor(position), fraction = position - index;
    const value = index >= 0 && index + 1 < pcm.length ? pcm[index] * (1 - fraction) + pcm[index + 1] * fraction : 0;
    result[i] = -0.25 * value + noise * (state / 2 ** 32 * 2 - 1);
  }
  return result;
};
const observations = [];
const observe = async (name, comparison, expectedOffset, toleranceSeconds, fixture) => {
  const estimate = estimateAudioOffset(reference, audioEnvelope(comparison, rate));
  const errorSeconds = estimate.best ? estimate.best.offsetSeconds - expectedOffset : null;
  observations.push({name, expectedOffset, toleranceSeconds, fixture, errorSeconds, estimate});
  await writeFile(path.join(root, 'observations.json'), JSON.stringify(observations, null, 2));
  console.log(JSON.stringify({name, status: estimate.status, offset: estimate.best?.offsetSeconds, correlation: estimate.best?.correlation, errorSeconds}));
};
for (const delay of [1.231, 1.235, 1.239]) await observe(`fractional-${delay}`, make(delay), delay, 0.01, {gain: 0.25, polarity: -1});
for (const noise of [0.005, 0.02, 0.1]) await observe(`noise-${noise}`, make(1.235, noise), 1.235, 0.02, {gain: 0.25, polarity: -1, noiseAmplitude: noise, seed: 20260906});
const encoded = path.join(root, 'derived.mp3');
execute(['-f', 'f32le', '-ar', String(rate), '-ac', '1', '-i', 'pipe:0', '-c:a', 'libmp3lame', '-b:a', '32k', '-n', encoded], bytes(make(1.235)));
await observe('mp3-32k', samples(execute(['-i', encoded, '-map', '0:a:0', '-c:a', 'pcm_f32le', '-f', 'f32le', 'pipe:1'])), 1.235, 0.02, {codec: 'libmp3lame', bitrate: '32k', derivedSha256: await sha256File(encoded)});
// Drift has no single correct constant offset; retain this diagnostic without a pass threshold.
await observe('speed-1.005', make(1.235, 0, 1.005), 1.235, null, {speed: 1.005, meaning: 'Expected offset is initial lead only; offset varies through the clip'});
assert.equal(await sha256File(source), id);
for (const item of observations.filter(item => item.toleranceSeconds !== null)) {
  assert.ok(item.estimate.status !== 'candidate' || Math.abs(item.errorSeconds) <= item.toleranceSeconds, `False candidate outside tolerance: ${item.name}`);
}
assert.ok(observations.slice(0, 3).every(item => item.estimate.status === 'candidate'), 'Clean fractional delays should produce candidates');
assert.equal(observations.find(item => item.name === 'speed-1.005').estimate.status, 'inconsistent_offset');
await writeFile(path.join(root, 'evidence.json'), JSON.stringify({passed: true, sourceUnchanged: true, sourceSha256: id, observations,
  scope: 'Controlled derivatives of one Sonoma audio channel with known delays, deterministic noise, MP3 round trip and one speed-change diagnostic. Candidate error bounds are fixture assertions, not calibrated confidence. No independent microphone recordings or native sync edits.'}, null, 2), {flag: 'wx'});
console.log(JSON.stringify({root, passed: true}));
