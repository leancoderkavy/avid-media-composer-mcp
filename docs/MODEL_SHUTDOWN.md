# Local model shutdown and recovery

Direct visual indexing/search, speech, frame captions, caption batches and summary services stop accepting new model work when graceful disposal begins. Accepted operations drain before model disposal. A closed RPC connection can therefore coexist with a completed output written afterward; inspect persisted results instead of interpreting connection closure as computation cancellation.

Analysis jobs use a different path: cancellation requests stop their worker, preserve partial artifacts and journal the outcome. Use the matching `caption_batch`, `speech`, `visual` or summary job when cancellable execution is required. Job status and persisted workflow checkpoints are separate evidence.

HTTP session DELETE invalidates the session ID, closes its services and retains its capacity slot until cleanup succeeds. Accepted direct caption batches can finish during that drain. A fresh session can inspect the completed checkpoint even when the old RPC returned `Connection closed`. Failed cleanup retains the session slot; see [HTTP sessions](HTTP_SESSIONS.md).

Stdio clients may impose their own shutdown deadline. On the qualified Windows host, the SDK client force-stopped its server approximately 2.1 seconds after closing input during a 12-frame direct Florence batch. The original child handle confirmed SIGTERM exit. A fresh session found two verified captions, and explicit resume reused those checkpoints in a new run and completed all 12. Original checkpoint bytes and source media were unchanged. This is one measured client/runtime case, not a guarantee for every client or subprocess tree.

For an interrupted caption batch:

1. Establish that the original computation stopped. A partial checkpoint or closed RPC alone does not prove this; the qualification observed the original child process's closure.
2. Discover attempts with `avid_caption_runs` and inspect the chosen `runId` with `avid_caption_run`.
3. Explicitly call `avid_resume_captions`, or start a `caption_resume` analysis job if cancellation is needed. Resume creates a new run and reuses verified captions; it does not silently replay the original run.
4. Verify the new completed run and review its captions/images for factual accuracy. Successful lifecycle recovery does not validate generated descriptions.

Reproduce the owned-process qualification with `node scripts/research/qualify-stdio-caption-deadline.mjs`. It expects the local Sonoma MP4 and cached Florence model. It does not download models or modify source media. Evidence is written under `.avid-mcp-analysis/`. Arbitrary descendant containment, power loss, allocator reclamation and other clients' deadline behavior remain unqualified.
