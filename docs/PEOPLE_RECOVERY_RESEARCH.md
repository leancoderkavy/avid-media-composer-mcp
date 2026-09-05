# People computation recovery

The Python face-analysis backend now supports opt-in per-frame checkpoints. This is a tested foundation; the MCP people-indexing workflow does not yet expose resume or enable these checkpoints by default.

Requests using `checkpoint: true` publish `faces-N.json` only after a frame's complete face results and crops are written. Publication uses an exclusive hard link from a temporary file. Empty detections are also committed. A request with `resume: true` may reuse an existing contiguous prefix after checking frame identity/time/hash, model file hashes, OpenCV version, sequential face IDs, normalized finite features, boxes/confidence and crop membership/hashes. A checkpoint after a gap is rejected. Existing checkpoints without explicit resume are rejected. Reads and hashing have size bounds.

An incomplete frame can leave uncommitted crops. Recovery must copy only a verified committed prefix into a new directory; leftover crops are not treated as completed work. Source-level authorization and hashes, extraction plans, final index validation and run lifecycle belong to the MCP layer and remain required before exposing production resume. This backend interface alone does not establish those properties.

## Actual process qualification

`node scripts/research/qualify-face-checkpoints.mjs <people-range-evidence.json>` copies the existing 120 sampled Sonoma JPEGs into an isolated job, starts the real optional OpenCV backend and terminates that owned process after observing committed checkpoints. It waits for process closure, copies the committed prefix and its crops to a new directory, then resumes. It compares every resulting face field against the existing uninterrupted 38-face index and verifies that original checkpoints/source remain unchanged. Failed probes terminate their owned live workers.

Observed result: four saved frames reused, 120 frames completed, 38 face records exactly equal. Evidence: `.avid-mcp-analysis/face-checkpoints-a0cf6e39-e033-45f0-a7b6-16fdd9b07356/evidence.json`. This is actual backend interruption/reuse, not an exception-only simulation. Extraction was already complete and reused frames included zero-face results; it is not evidence of recovery at every interruption boundary.

Unit checks reject changed inputs/models, changed crops and invalid normalized embeddings, and verify exclusive publication. The existing crowded-frame test still passes. Power-loss durability, all failure boundaries, full MCP discovery/status/resume, frame extraction recovery, runtime-version policy and broad concurrency qualification remain open.
