# External process-tree qualification

Windows runtime research on 2026-09-05 distinguishes direct-child closure from descendant closure. This extends the direct-process tests; it does not qualify automatic artifact cleanup.

Run `node scripts/research/qualify-process-descendants.mjs` after building. Each fixture starts a Node wrapper and a descendant that writes a tick file. It exercises timeout and output overflow with ordinary and detached descendants. Immediately after the runner returns, the probe checks descendant PID existence and continued writes. A unique stop file then asks that original fixture to exit, and the probe confirms PID absence. It does not kill arbitrary PIDs or leave the fixtures running.

| Descendant | Trigger | Alive when runner returned | Continued writes |
| --- | --- | --- | --- |
| Ordinary | Timeout | No | No |
| Ordinary | Output limit | No | No |
| Detached | Timeout | Yes | Yes |
| Detached | Output limit | Yes | Yes |

Evidence: `.avid-mcp-analysis/process-descendants-dad1b668-d9d1-41f7-a1d5-a5fea62dc3ac/evidence.json`. All four descendant exits were verified after cooperative fixture cleanup. The earlier two-condition ordinary-only run is preliminary evidence and cannot support a detached-process claim.

The observations establish a gap for detached wrappers on this Windows host. They do not establish why ordinary descendants stopped, behavior on other Node/OS versions, or termination of arbitrary process trees. The runner currently waits for direct-child closure; its timeout/output-limit error must not be treated as proof that all descendant writers have stopped.

Before incomplete-analysis deletion is enabled, qualify tree termination while the owned parent is still identifiable, observe termination completion, retain files when process state cannot be established, and test cancellation, detached descendants, parent-exit races and failed termination. Windows taskkill tree handling is a candidate requiring explicit integration and runtime proof, not an implemented guarantee. Mac host qualification remains deferred.

## Windows termination implementation

The runner now requests `taskkill.exe /PID <owned-child> /T /F` while its child handle still reports a live parent, before falling back to direct termination. It waits for both taskkill and parent closure. A missing/failed/timed-out taskkill request is returned in `details.treeTermination` with `succeeded: false`; a direct-child fallback does not upgrade that result. Taskkill is itself forced to stop after a five-second timeout, with closure still required before settling. A parent already observed exited is not targeted by PID. Other platforms keep the direct-child behavior.

The new `--require-stopped` regression asserts that all four ordinary/detached timeout/overflow descendants are absent at return, make no further writes, and report successful Windows tree termination. Evidence: `.avid-mcp-analysis/process-descendants-faaa2251-dcbf-4a25-89e4-67a2385ca1cd/evidence.json`. All four passed. This supersedes the earlier failure for these fixtures on this host; the historical table above records the baseline behavior.

This is not a guarantee for independently reparented/escaped workers, parent exit before tree enumeration, normal successful wrapper exit, arbitrary filesystem writers, or other operating systems. `succeeded` reports the taskkill outcome plus observed parent closure; the separate fixture test verifies known descendant PIDs. Incomplete cleanup still requires a scoped ownership/inventory/process-state protocol.
