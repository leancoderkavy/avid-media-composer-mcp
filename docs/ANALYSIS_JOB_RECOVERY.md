# Analysis job recovery

Use `avid_analysis_job_status` and `avid_analysis_job_history` to inspect persisted job records after reconnect. Unfinished records from another server session report `status: unresolved`, their original `recordedStatus`, and `automaticReplay: false`. This means completion is unknown; it does not prove an old worker has stopped. No failed or unresolved computation is automatically replayed.

When a worker closes while its server remains alive, the job records `workerExit: {code, signal}`. A nonzero exit or signal is a failure, even if stdout contained parseable partial JSON. Signal failures include a readable signal reason when no stderr is available. A zero exit still requires a parseable result; it is not sufficient by itself. Cancellation retains its cancellation state. Old records and failures before a process starts can lack `workerExit`; absence is not an exit code of zero.

The server waits for closure before releasing its one-worker queue slot. Terminal checkpoints include exit details and are awaited by status reads. A failed checkpoint remains visible through `journalError`; a later reconnect can only report the last successfully stored record. Exit details describe the direct worker, not all descendants or model/output validity.

## Windows qualification

The parent-only crash harness was rerun on the Sonoma preview MP4. The running and queued records remained unresolved across reconnect, with no replay, journal/source changes or QC output artifacts. The previously observed direct worker was absent at the later inspection. Evidence: `.avid-mcp-analysis/job-crash-4ffb2960-bd88-4fe7-9019-269bc352fc10/evidence.json`. This does not prove prompt termination or universal descendant containment.

The separate worker-only harness identified the child of its own MCP server, checked its creation identity and parent, then terminated that worker tree. The server stayed alive. Its interrupted 180-second QC job failed with exit code 1 and no result; the queued one-second QC completed with exit code 0. A new MCP connection retained both terminal states, exit details and no-replay declarations. The original source SHA-256 was unchanged. Evidence: `.avid-mcp-analysis/job-worker-exit-7c47cf99-40a7-4579-936b-9782539ccba5/evidence.json` and `termination.json`.

Unit tests separately cover numeric and signal exits, rejection of partial output as a successful result, persisted diagnostics and subsequent queue progress. These results do not establish power-loss durability, detached-descendant containment, all model runtimes, computation resume or arbitrary concurrent writers. Preserve failed outputs for inspection and request a fresh authorized job only after reviewing any partial artifacts.
