import {mkdir, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport, getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import {loadConfig} from '../../dist/config.js';

const root = path.resolve('.avid-mcp-analysis', `audio-sync-channels-${randomUUID()}`); await mkdir(root);
assert.ok(process.argv.length <= 4, 'Optional arguments: absolute MCP entrypoint, comparison sample rate');
const entrypoint = process.argv[2] ?? path.resolve('dist/index.js'); assert.ok(path.isAbsolute(entrypoint));
const sampleRate = Number(process.argv[3] ?? 44100);
assert.ok([11025, 22050, 44100].includes(sampleRate), 'Qualified fixture rates: 11025, 22050, 44100');
const delaySamples = sampleRate * 1.24, framesPerChannel = sampleRate * 31.24;
assert.ok(Number.isInteger(delaySamples) && Number.isInteger(framesPerChannel));
const entrypointSha256 = await sha256File(entrypoint);
const source = 'D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const id = '3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca';
assert.equal(await sha256File(source), id);
const derived = path.join(root, `distinct-channels-${sampleRate}.wav`);
const filter = `[0:a:0]pan=mono|c0=c0,aresample=${sampleRate},atrim=end_sample=${sampleRate * 30},asetpts=N/SR/TB,volume=-0.25,adelay=${delaySamples}S[target];anoisesrc=r=${sampleRate}:a=0.1:d=31.24:seed=123[noise];[noise][target]join=inputs=2:channel_layout=stereo:map=0.0-FL|1.0-FR[out]`;
const preparation = spawnSync(loadConfig().ffmpegExecutable ?? 'ffmpeg', ['-hide_banner', '-nostdin', '-v', 'error', '-i', source,
  '-filter_complex', filter, '-map', '[out]', '-c:a', 'pcm_f32le', '-n', derived], {windowsHide: true, timeout: 60000, encoding: 'utf8', maxBuffer: 1024 * 1024});
assert.ifError(preparation.error); assert.equal(preparation.status, 0, preparation.stderr);
const derivedId = await sha256File(derived);
await writeFile(path.join(root, 'preparation.json'), JSON.stringify({sourceSha256: id, derivedSha256: derivedId, filter,
  expected: {sampleRate, channels: 2, framesPerChannel, channel0: 'deterministic noise, seed 123', channel1: `source first channel, gain -0.25, ${delaySamples} leading samples (1.24 seconds)`}}, null, 2), {flag: 'wx'});
const clients = [], events = [];
const connect = async () => {
  const transport = new StdioClientTransport({command: process.execPath, args: [entrypoint], stderr: 'pipe',
    env: {...getDefaultEnvironment(), AVID_MCP_ALLOWED_ROOTS: [path.dirname(source), root].join(path.delimiter), AVID_MCP_OUTPUT_ROOT: root, AVID_MCP_CAPABILITIES: 'inspect,export'}});
  const client = new Client({name: 'audio-sync-channels', version: '1'}); clients.push(client); await client.connect(transport); return client;
};
const call = async (client, name, args) => {
  const response = await client.callTool({name, arguments: args}); events.push({name, response});
  await writeFile(path.join(root, 'events.json'), JSON.stringify(events, null, 2));
  assert.ok(!response.isError, JSON.stringify(response)); return response.structuredContent.data;
};
const run = async (client, reference, comparison) => {
  const job = await call(client, 'avid_start_analysis_job', {job: {kind: 'audio_sync', options: {reference, comparison}}});
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const record = await call(client, 'avid_analysis_job_status', {jobId: job.id});
    if (['completed', 'failed', 'cancelled'].includes(record.status)) return record;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Owned job observation expired; inspect the recorded job ID before taking another action');
};
try {
  const client = await connect(), indexed = await call(client, 'avid_index_media', {files: [source, derived]});
  await writeFile(path.join(root, 'indexed.json'), JSON.stringify(indexed, null, 2), {flag: 'wx'});
  const reference = {id, stream: 1, channel: 0, startSeconds: 0, durationSeconds: 30};
  const comparison = {id: derivedId, stream: 0, channel: 1, startSeconds: 0, durationSeconds: 31.24};
  const forward = await run(client, reference, comparison), wrongChannel = await run(client, reference, {...comparison, channel: 0});
  const reverse = await run(client, comparison, reference), invalidStream = await run(client, reference, {...comparison, stream: 1});
  await writeFile(path.join(root, 'observations.json'), JSON.stringify({forward, wrongChannel, reverse, invalidStream}, null, 2), {flag: 'wx'});
  for (const result of [forward, reverse, wrongChannel]) assert.equal(result.status, 'completed', JSON.stringify(result));
  assert.equal(forward.result.estimate.status, 'candidate'); assert.equal(forward.result.estimate.best.offsetSeconds, 1.24);
  assert.equal(reverse.result.estimate.status, 'candidate'); assert.equal(reverse.result.estimate.best.offsetSeconds, -1.24);
  assert.equal(forward.result.reference.sampleRate, 48000); assert.equal(forward.result.comparison.sampleRate, sampleRate);
  assert.equal(forward.result.comparison.decodedSamples, framesPerChannel); assert.equal(forward.result.comparison.channel, 1);
  assert.equal(forward.result.comparison.discardedTailSamples, 0);
  assert.equal(wrongChannel.result.estimate.status, 'weak_match');
  assert.equal(invalidStream.status, 'failed'); assert.match(invalidStream.error, /absolute audio stream index/);
  await client.close(); const next = await connect();
  const restored = await call(next, 'avid_analysis_job_status', {jobId: forward.id}); assert.deepEqual(restored.result, forward.result);
  assert.equal(await sha256File(source), id); assert.equal(await sha256File(derived), derivedId);
  await writeFile(path.join(root, 'evidence.json'), JSON.stringify({passed: true, sourceUnchanged: true, derivedUnchanged: true,
    sourceSha256: id, derivedSha256: derivedId, runtimeEntrypoint: entrypoint, runtimeEntrypointSha256: entrypointSha256, forward, reverse, wrongChannel, invalidStream, reconnectedResultUnchanged: true,
    scope: `Real stdio MCP with distinct media IDs, 48000/${sampleRate} Hz rates, explicit stream/channel selection, controlled delayed/inverted target channel versus unrelated deterministic noise channel, invalid stream refusal and saved-result reconnect. Derived fixture, not independent microphones or native sync editing.`}, null, 2), {flag: 'wx'});
  console.log(JSON.stringify({root, passed: true, forward: forward.result.estimate.best, reverse: reverse.result.estimate.best, wrongChannel: wrongChannel.result.estimate.status}));
} finally { for (const client of clients) await client.close().catch(() => {}); }
