import {mkdir, writeFile, readdir, stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createHttpServer} from '../../dist/http-app.js';
import {loadConfig} from '../../dist/config.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';

assert.equal(process.platform, 'win32');
const root = path.resolve('.avid-mcp-analysis', `audio-sync-cancel-${randomUUID()}`); await mkdir(root);
const source = 'D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const id = '3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca';
assert.equal(await sha256File(source), id);
const token = randomUUID() + randomUUID();
const server = createHttpServer({authToken: token, config: loadConfig({AVID_MCP_ALLOWED_ROOTS: path.dirname(source), AVID_MCP_OUTPUT_ROOT: root, AVID_MCP_CAPABILITIES: 'inspect,export'})});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = new URL(`http://127.0.0.1:${server.address().port}/mcp`), connections = [], events = [];
const connect = async () => {
  const transport = new StreamableHTTPClientTransport(url, {requestInit: {headers: {Authorization: `Bearer ${token}`}}});
  const client = new Client({name: 'audio-sync-cancel', version: '1'}); connections.push({client, transport}); await client.connect(transport); return client;
};
const call = async (client, name, args) => {
  const response = await client.callTool({name, arguments: args}); events.push({name, response});
  await writeFile(path.join(root, 'events.json'), JSON.stringify(events, null, 2));
  assert.ok(!response.isError, JSON.stringify(response)); return response.structuredContent.data;
};
const inventory = () => {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CreationDate,Name | ConvertTo-Json -Compress'], {encoding: 'utf8', windowsHide: true, timeout: 15000});
  assert.equal(result.status, 0, result.stderr); const rows = JSON.parse(result.stdout); return Array.isArray(rows) ? rows : [rows];
};
const terminal = async (client, jobId) => {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const record = await call(client, 'avid_analysis_job_status', {jobId});
    if (['cancelled', 'completed', 'failed'].includes(record.status)) return record;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Owned job observation expired; inspect its saved identity before deciding what to do next');
};
const scratch = async () => {
  const library = path.join(root, 'avid-mcp-library'), records = [];
  for (const entry of await readdir(library, {withFileTypes: true})) {
    if (!entry.isDirectory() || !entry.name.startsWith('audio-sync-')) continue;
    const directory = path.join(library, entry.name), files = [];
    for (const file of await readdir(directory, {withFileTypes: true})) {
      assert.ok(file.isFile(), 'Unexpected scratch entry'); const target = path.join(directory, file.name);
      files.push({name: file.name, bytes: (await stat(target)).size, sha256: await sha256File(target)});
    }
    records.push({directory: entry.name, files});
  }
  return records;
};
try {
  const client = await connect(); await call(client, 'avid_index_media', {files: [source]});
  const selection = {id, stream: 1, channel: 0, startSeconds: 0, durationSeconds: 60};
  const running = await call(client, 'avid_start_analysis_job', {job: {kind: 'audio_sync', options: {reference: selection, comparison: selection}}});
  const short = {...selection, durationSeconds: 2};
  const queued = await call(client, 'avid_start_analysis_job', {job: {kind: 'audio_sync', options: {reference: short, comparison: short}}});
  assert.equal(queued.status, 'queued');
  let observedTree = [];
  for (let attempt = 0; attempt < 10; attempt++) {
    const rows = inventory(), workers = rows.filter(row => row.ParentProcessId === process.pid && row.Name.toLowerCase() === 'node.exe');
    assert.equal(workers.length, 1, 'Expected one owned analysis worker');
    observedTree = [workers[0]]; const seen = new Set([workers[0].ProcessId]);
    for (let i = 0; i < observedTree.length; i++) for (const row of rows) if (row.ParentProcessId === observedTree[i].ProcessId && !seen.has(row.ProcessId)) {seen.add(row.ProcessId); observedTree.push(row);}
    if (observedTree.some(row => /^ffmpeg\.exe$/i.test(row.Name))) break;
    const record = await call(client, 'avid_analysis_job_status', {jobId: running.id});
    assert.equal(record.status, 'running', 'Decoder finished before observation; not an active-decoder cancellation proof');
  }
  await writeFile(path.join(root, 'observed-tree.json'), JSON.stringify(observedTree, null, 2), {flag: 'wx'});
  assert.ok(observedTree.some(row => /^ffmpeg\.exe$/i.test(row.Name)), 'Active FFmpeg not observed');
  await call(client, 'avid_cancel_analysis_job', {jobId: running.id});
  const cancelled = await terminal(client, running.id), completed = await terminal(client, queued.id);
  assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.cancellationReason, 'user'); assert.equal(cancelled.result, undefined);
  assert.equal(cancelled.treeTermination?.succeeded, true); assert.ok(cancelled.workerExit);
  assert.equal(completed.status, 'completed');
  const after = inventory(), processChecks = observedTree.map(before => ({before, current: after.find(row => row.ProcessId === before.ProcessId) ?? null}));
  assert.ok(processChecks.every(row => !row.current || row.current.CreationDate !== row.before.CreationDate));
  const retained = await scratch();
  const next = await connect(), recovered = await call(next, 'avid_analysis_job_status', {jobId: running.id});
  assert.equal(recovered.status, 'cancelled'); assert.equal(recovered.automaticReplay, false);
  assert.deepEqual(await scratch(), retained); assert.equal(await sha256File(source), id);
  await writeFile(path.join(root, 'evidence.json'), JSON.stringify({passed: true, sourceUnchanged: true, cancelled, queued: completed,
    processChecks, retainedScratch: retained, scratchStableAcrossReconnect: true, scope: 'Actual Windows audio-sync worker with an observed FFmpeg descendant, explicit MCP cancellation, queued follow-on completion and reconnected terminal journal. Scratch is inspected and retained, not automatically recovered/deleted. Not abrupt server death, atomic descendant containment or Mac qualification.'}, null, 2), {flag: 'wx'});
  console.log(JSON.stringify({root, passed: true, retainedScratch: retained}));
} finally {
  for (const {client, transport} of connections) {await transport.terminateSession().catch(() => {}); await client.close().catch(() => {});}
  await new Promise(resolve => {server.close(resolve); server.closeAllConnections();});
}
