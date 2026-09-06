import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport, getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';

// Explicit original exports; no recursive discovery or mutation of source media.
const names = ['ANIME_CUT_v3', 'ANIME_OP_FINAL_4K', 'ANIME_OP_v4', 'RoughCut_v1_MUSIC',
  'RoughCut_v1_preview', 'RoughCut_v2_MUSIC', 'SLIDESHOW_4K'];
const sourceRoot = 'D:/Sonoma Escape Edit';
const root = path.resolve('.avid-mcp-analysis', `audio-sync-matrix-${randomUUID()}`);
await mkdir(root); console.log(JSON.stringify({root}));
const entrypoint = path.resolve('dist/index.js'), clients = [], records = [], events = [];
const connect = async () => {
  const client = new Client({name: 'audio-sync-matrix', version: '1'}); clients.push(client);
  await client.connect(new StdioClientTransport({command: process.execPath, args: [entrypoint], stderr: 'pipe',
    env: {...getDefaultEnvironment(), AVID_MCP_ALLOWED_ROOTS: sourceRoot, AVID_MCP_OUTPUT_ROOT: root,
      AVID_MCP_CAPABILITIES: 'inspect,export'}}));
  return client;
};
const call = async (client, name, args) => {
  const response = await client.callTool({name, arguments: args}, undefined, {timeout: 180000});
  events.push({name, args, response}); await writeFile(path.join(root, 'events.json'), JSON.stringify(events, null, 2));
  assert.ok(!response.isError, JSON.stringify(response)); return response.structuredContent.data;
};
const terminal = async (client, jobId) => {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const record = await call(client, 'avid_analysis_job_status', {jobId});
    if (['completed', 'failed', 'cancelled'].includes(record.status)) return record;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Observation expired for ${jobId}; inspect its recorded state before restarting work`);
};
try {
  let client = await connect();
  for (const name of names) {
    const file = path.join(sourceRoot, `Sonoma_Escape_${name}.mp4`), id = await sha256File(file);
    await call(client, 'avid_index_media', {files: [file]});
    const results = [];
    // Both channels are deliberately selected, never mixed automatically.
    for (const channel of [0, 1]) {
      const reference = {id, stream: 1, channel, startSeconds: 0, durationSeconds: 30};
      const job = await call(client, 'avid_start_analysis_job', {job: {kind: 'audio_sync', options: {
        reference, comparison: {...reference, startSeconds: 1.23}, maxOffsetSeconds: 5}}});
      const record = await terminal(client, job.id); results.push(record);
      console.log(JSON.stringify({name, channel, status: record.status, estimate: record.result?.estimate.status,
        offset: record.result?.estimate.best?.offsetSeconds, error: record.error}));
    }
    await client.close(); client = await connect();
    for (const record of results) {
      const restored = await call(client, 'avid_analysis_job_status', {jobId: record.id});
      assert.equal(restored.status, record.status); assert.deepEqual(restored.result, record.result);
      assert.equal(restored.automaticReplay, false);
    }
    assert.equal(await sha256File(file), id);
    records.push({file, id, sourceUnchanged: true, reconnectUnchanged: true, results});
    await writeFile(path.join(root, 'observations.json'), JSON.stringify(records, null, 2));
  }
  // Preserve every observation before evaluating the declared acceptance criteria.
  for (const item of records) for (const record of item.results) {
    assert.equal(record.status, 'completed', JSON.stringify(record));
    assert.equal(record.result.estimate.status, 'candidate', item.file);
    assert.equal(record.result.estimate.best.offsetSeconds, -1.23, item.file);
    assert.equal(record.result.sourceClockOffset, null);
    assert.equal(record.result.estimate.verifiedSync, false);
  }
  await writeFile(path.join(root, 'evidence.json'), JSON.stringify({passed: true, records,
    scope: 'Seven actual Sonoma exports, both explicit audio channels, known decoded-window offset and fresh MCP reconnect per file. Same-source content offsets only; not independent microphone accuracy, video/lip sync, native edits or general search ranking.'}, null, 2), {flag: 'wx'});
  console.log(JSON.stringify({root, passed: true, jobs: records.length * 2}));
} finally { for (const client of clients) await client.close().catch(() => {}); }
