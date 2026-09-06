---
name: avid-export
description: Export local source clips, verified copies, thumbnails and transcript deliverables with Avid Media Composer MCP.
---

Start with `avid_get_capabilities` and the current tool schemas. Export capability and a configured output directory are required. Index source media with `avid_index_media` if no current content ID is available.

Use `avid_media_artifact` for a thumbnail, trimmed MP4 or checksum-verified source copy. Clip ranges use source seconds; choose explicit start/end bounds within the indexed duration. Outputs use unique folders and do not overwrite source media. This exports from a source file, not the active Avid sequence.

For subtitles or text, discover `avid_transcript_revisions`, read the chosen revision with `avid_transcript_range`, and call `avid_export_transcript` with that exact revision and requested TXT/JSON/CSV/SRT/VTT format. Keep revision provenance with the deliverable. If corrections are requested, `avid_correct_transcript` creates a new immutable revision; export that returned revision.

Inspect returned paths and completion status. For video deliverables, inspect the exported file's metadata and representative frames, and review requested audio/timing expectations. A successful encoder process alone does not establish editorial correctness. Use `avid_media_qc` on an indexed output for bounded technical checks when appropriate.

For long work, `avid_start_analysis_job` returns a job ID; query `avid_analysis_job_status` until completion or failure. Use `avid_analysis_job_history` after reconnecting to recover persisted results within the same roots/capabilities. Unfinished records from another session are unresolved: inspect possible partial outputs before deciding what to repeat. Cancellation retains partial artifacts and does not undo completed output. Some analysis types offer explicit checkpoint/resume tools; discover those schemas and verify stopped workers and checkpoint integrity. No job should be assumed to resume automatically after restart.

History pages scan files, so an empty `records` array does not mean history is exhausted. Pass `nextAfter` as the next request's `after` until it is null. Report nonzero `unreadable` counts as missing evidence; do not treat them as completed or absent jobs. Direct status reads reject damaged records.

After requesting cancellation, poll while status is `cancelling`; only `cancelled` confirms the worker has closed. This does not prove that every operating-system descendant has terminated or remove partial files.

For an actual Avid sequence export, discover `export_settings` through `avid_native_read`, read the target MOB, then preview/apply `export_mp4` with its complete duration and explicit video/audio output contract. Current qualification is Windows 2024.12 H.264 1080p30. Review the preset in Avid: its content and unsaved timeline graph cannot be fingerprinted by the adapter. An uncertain export retains the native write lock; inspect the output and host before recovery, and never replay the consumed token. Report `outputVerified` separately from source fidelity, which this action does not establish.

For a retained export lock, call `avid_native_lock_status`. After Avid has stopped, `avid_recover_native_export_lock` accepts the inspected checksum and releases only an eligible unchanged lock. It preserves output and does not retry the export. Do not attempt recovery while Avid is running or clear unrelated generic locks.

For a requested source-master AAF, read the native linked master and export settings, then preview/apply `export_aaf_master` with its explicit local source file/checksum and existing AAF preset. Current qualification is a linked 30 fps master with one local media reference. The returned inspection verifies master/slot/source structure and can feed `avid_build_aaf_selects`; it is not an Avid sequence AAF export or a decoding/fidelity guarantee. Output must remain inside the configured root; preserve the export receipt and any uncertainty lock.

Return local deliverable paths, source ID/revision, exact range and performed validation. Distinguish a source MP4 export from an actual Avid sequence render.
