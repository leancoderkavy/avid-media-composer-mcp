# People computation recovery

The Python face-analysis backend supports per-frame checkpoints. The MCP people-indexing workflow now enables them, checkpoints extracted images, and exposes explicit resume into a new index. The earlier backend experiment below remains a separate evidence layer.

Requests using `checkpoint: true` publish `faces-N.json` only after a frame's complete face results and crops are written. Publication uses an exclusive hard link from a temporary file. Empty detections are also committed. A request with `resume: true` may reuse an existing contiguous prefix after checking frame identity/time/hash, model file hashes, OpenCV version, sequential face IDs, normalized finite features, boxes/confidence and crop membership/hashes. A checkpoint after a gap is rejected. Existing checkpoints without explicit resume are rejected. Reads and hashing have size bounds.

An incomplete frame can leave uncommitted crops. Recovery must copy only a verified committed prefix into a new directory; leftover crops are not treated as completed work. Source-level authorization and hashes, extraction plans, final index validation and run lifecycle belong to the MCP layer and remain required before exposing production resume. This backend interface alone does not establish those properties.

## Actual process qualification

`node scripts/research/qualify-face-checkpoints.mjs <people-range-evidence.json>` copies the existing 120 sampled Sonoma JPEGs into an isolated job, starts the real optional OpenCV backend and terminates that owned process after observing committed checkpoints. It waits for process closure, copies the committed prefix and its crops to a new directory, then resumes. It compares every resulting face field against the existing uninterrupted 38-face index and verifies that original checkpoints/source remain unchanged. Failed probes terminate their owned live workers.

Observed result: four saved frames reused, 120 frames completed, 38 face records exactly equal. Evidence: `.avid-mcp-analysis/face-checkpoints-a0cf6e39-e033-45f0-a7b6-16fdd9b07356/evidence.json`. This is actual backend interruption/reuse, not an exception-only simulation. Extraction was already complete and reused frames included zero-face results; it is not evidence of recovery at every interruption boundary.

Unit checks reject changed inputs/models, changed crops and invalid normalized embeddings, and verify exclusive publication. The existing crowded-frame test still passes.

## MCP integration and qualification

New runs publish their source coverage, threshold, range and model/recipe revision before extraction. Each image hash is committed after extraction. `avid_people_runs` discovers runs by media ID; `avid_people_run` verifies source/frame/crop/checkpoint integrity and reports extraction/analysis counts. `avid_resume_people`, or a `people_resume` job, creates a new index after validating the source plan. It copies only committed images and face checkpoints with post-copy hash checks; missing extractions and analyses are computed. A run marked partial may still have a worker, so cancellation and terminal status remain separate.

Completion verifies face output against every checkpoint and records the original index and checkpoint hashes. Completed runs cannot resume. Editing the final index invalidates its original completion checksum while ordinary index reads remain available. Removing a face also removes this index's analysis checkpoints so they do not retain the deleted embedding; separate indices and sampled frames remain. Whole-index deletion includes the new generated run files.

The pinned checkpoint recipe requires the qualified model hashes and OpenCV 4.12.0. This is not a broad runtime-version matrix. Legacy indices without a run manifest cannot resume. Automatic replay, automatic cleanup, power-loss durability and broader concurrent/failure-boundary qualification remain open.

Real Windows MCP qualification (`scripts/research/qualify-people-resume.mjs`) cancelled once during extraction, reconnected, resumed, then cancelled during face analysis and reconnected again. It checked that no Python backend remained for each cancelled manifest. The final run reused all 120 extractions and 34 analyzed frames and reproduced all 38 uninterrupted face records exactly. Both parent directories and the source hash remained unchanged. Completed resume was rejected. Evidence: `.avid-mcp-analysis/people-resume-0396577d-c87b-4ea6-9be1-543e3eeeca86/evidence.json`.

Actual MCP deletion qualification subsequently removed one face from that disposable resumed index: all 120 analysis checkpoints and the selected crop were absent, 37 face records remained, every sampled image and source hash matched, and original completion status was rejected. Evidence is in the same local directory as `deletion-evidence.json`; reproduce with `scripts/research/qualify-people-deletion.mjs` against a fresh recovery result. Original recovery evidence records the state before this deliberate edit.
