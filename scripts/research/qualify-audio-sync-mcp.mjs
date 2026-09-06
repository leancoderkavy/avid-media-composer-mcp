import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';

const root = path.resolve('.avid-mcp-analysis', `audio-sync-mcp-${randomUUID()}`); await mkdir(root);
const source = 'D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const id = '3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca';
assert.equal(await sha256File(source), id);
const clients = [], events = [];
const connect = async () => {
  const transport = new StdioClientTransport({command: process.execPath, args: [path.resolve('dist/index.js')],
    env: {...process.env, AVID_MCP_ALLOWED_ROOTS: path.dirname(source), AVID_MCP_OUTPUT_ROOT: root, AVID_MCP_CAPABILITIES: 'inspect,export'}, stderr: 'pipe'});
  const client = new Client({name: 'audio-sync-qualification', version: '1'}); clients.push(client); await client.connect(transport); return client;
};
const call = async (client, name, args) => {
  const response = await client.callTool({name, arguments: args}); events.push({name, response});
  await writeFile(path.join(root, 'events.json'), JSON.stringify(events, null, 2));
  assert.ok(!response.isError, JSON.stringify(response)); return response.structuredContent.data;
};
const terminal = async (client, jobId) => {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const record = await call(client, 'avid_analysis_job_status', {jobId});
    if (['completed', 'failed', 'cancelled'].includes(record.status)) return record;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Observation deadline reached; inspect this owned job rather than automatically restarting it');
};
try {
  const client = await connect(); await call(client, 'avid_index_media', {files: [source]});
  const reference = {id, stream: 1, channel: 0, startSeconds: 0, durationSeconds: 30};
  const started = await call(client, 'avid_start_analysis_job', {job: {kind: 'audio_sync', options: {
    reference, comparison: {...reference, startSeconds: 1.23}, maxOffsetSeconds: 5,
  }}});
  const record = await terminal(client, started.id);
  assert.equal(record.status, 'completed', JSON.stringify(record));
  assert.equal(record.result.estimate.status, 'candidate');
  assert.equal(record.result.estimate.best.offsetSeconds, -1.23);
  assert.equal(record.result.sourceClockOffset, null);
  assert.equal(record.result.reference.decodedSamples, 1440000);
  assert.equal(record.result.comparison.startSample, 59040);
  const rejected = await call(client, 'avid_start_analysis_job', {job: {kind: 'audio_sync', options: {
    reference, comparison: {...reference, channel: 2},
  }}});
  const invalid = await terminal(client, rejected.id);
  assert.equal(invalid.status, 'failed'); assert.match(invalid.error, /channel is unavailable/);
  await client.close();
  const next = await connect(), restored = await call(next, 'avid_analysis_job_status', {jobId: started.id});
  assert.equal(restored.status, 'completed'); assert.deepEqual(restored.result, record.result);
  assert.equal(restored.automaticReplay, false); assert.equal(await sha256File(source), id);
  await writeFile(path.join(root, 'evidence.json'), JSON.stringify({passed: true, sourceUnchanged: true, jobId: started.id,
    result: record.result, invalidChannel: {status: invalid.status, error: invalid.error}, reconnectedResultUnchanged: true,
    scope: 'Real stdio MCP worker analysis of two sample-selected windows from Sonoma first audio channel, explicit stream/channel selection, failed invalid-channel job, and saved-result read after fresh connection. Not independent recording accuracy, process-kill cancellation or source-clock/native sync editing.'}, null, 2), {flag: 'wx'});
  console.log(JSON.stringify({root, passed: true, offset: record.result.estimate.best.offsetSeconds,
    referenceTiming: record.result.reference.timing, comparisonTiming: record.result.comparison.timing}));
} finally { for (const client of clients) await client.close().catch(() => {}); }
