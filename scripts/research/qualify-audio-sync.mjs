import {mkdir, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {audioEnvelope, estimateAudioOffset} from '../../dist/library/audio-sync.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import {loadConfig} from '../../dist/config.js';

const source = 'D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const sourceSha256 = '3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca';
assert.equal(await sha256File(source), sourceSha256);
const root = path.resolve('.avid-mcp-analysis', `audio-sync-${randomUUID()}`);
await mkdir(root);
const args = ['-nostdin', '-v', 'error', '-i', source, '-map', '0:a:0', '-vn', '-af', 'pan=mono|c0=c0,aresample=8000,atrim=end_sample=240000,asetpts=N/SR/TB', '-c:a', 'pcm_f32le', '-f', 'f32le', 'pipe:1'];
const decoded = spawnSync(loadConfig().ffmpegExecutable ?? 'ffmpeg', args, {windowsHide: true, timeout: 60000, maxBuffer: 2 * 1024 * 1024});
assert.ifError(decoded.error); assert.equal(decoded.status, 0, decoded.stderr?.toString());
assert.equal(decoded.stdout.length % 4, 0);
const pcm = Float32Array.from({length: decoded.stdout.length / 4}, (_, i) => decoded.stdout.readFloatLE(i * 4));
await writeFile(path.join(root, 'decode.json'), JSON.stringify({args, decodedSamples: pcm.length, expectedSamples: 240000}, null, 2), {flag: 'wx'});
assert.equal(pcm.length, 30 * 8000);
const reference = audioEnvelope(pcm, 8000);
const delaySamples = 9840, delayed = new Float32Array(pcm.length + delaySamples);
// Controlled derived waveform only: 1.23 s delay, polarity inversion and gain reduction.
for (let i = 0; i < pcm.length; i++) delayed[i + delaySamples] = -0.25 * pcm[i];
const comparison = audioEnvelope(delayed, 8000);
const forward = estimateAudioOffset(reference, comparison), reverse = estimateAudioOffset(comparison, reference);
const silence = estimateAudioOffset(reference, new Float64Array(reference.length));
const repeating = Float64Array.from({length: 3000}, (_, i) => (i % 40) / 40);
const ambiguous = estimateAudioOffset(repeating, repeating);
await writeFile(path.join(root, 'observations.json'), JSON.stringify({forward, reverse, silence, ambiguous}, null, 2), {flag: 'wx'});
assert.equal(forward.status, 'candidate'); assert.equal(forward.best.offsetSeconds, 1.23);
assert.equal(reverse.status, 'candidate'); assert.equal(reverse.best.offsetSeconds, -1.23);
assert.equal(silence.status, 'insufficient_signal'); assert.equal(ambiguous.status, 'ambiguous');
assert.equal(await sha256File(source), sourceSha256);
await writeFile(path.join(root, 'evidence.json'), JSON.stringify({sourceSha256, sourceUnchanged: true, passed: true,
  decodedSamples: pcm.length, sampleRate: 8000, channel: 'first channel of first audio stream', args,
  controlledDelaySeconds: 1.23, polarity: -1, gain: 0.25, forward, reverse,
  scope: 'Real Sonoma decoded audio with a controlled derived delay, inversion and gain change. Negative controls cover silence and a synthetic repeated envelope. No independent microphone recording, clock drift, discontinuous PTS, source timecode, native Avid sync, sample-accurate alignment or MCP tool qualification.'}, null, 2), {flag: 'wx'});
console.log(JSON.stringify({root, passed: true, forward: forward.best, reverse: reverse.best}));
