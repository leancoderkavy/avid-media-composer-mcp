---
name: avid-export
description: Export local source clips, verified copies, thumbnails and transcript deliverables with Avid Media Composer MCP.
---

Start with `avid_get_capabilities` and the current tool schemas. Export capability and a configured output directory are required. Index source media with `avid_index_media` if no current content ID is available.

Use `avid_media_artifact` for a thumbnail, trimmed MP4 or checksum-verified source copy. Clip ranges use source seconds; choose explicit start/end bounds within the indexed duration. Outputs use unique folders and do not overwrite source media. This exports from a source file, not the active Avid sequence.

For subtitles or text, discover `avid_transcript_revisions`, read the chosen revision with `avid_transcript_range`, and call `avid_export_transcript` with that exact revision and requested TXT/JSON/CSV/SRT/VTT format. Keep revision provenance with the deliverable. If corrections are requested, `avid_correct_transcript` creates a new immutable revision; export that returned revision.

Inspect returned paths and completion status. For video deliverables, inspect the exported file's metadata and representative frames, and review requested audio/timing expectations. A successful encoder process alone does not establish editorial correctness. Use `avid_media_qc` on an indexed output for bounded technical checks when appropriate.

For long work, `avid_start_analysis_job` returns a job ID; query `avid_analysis_job_status` until completion or failure. Use `avid_analysis_job_history` after reconnecting to recover persisted results within the same roots/capabilities. Unfinished records from another session are unresolved: inspect possible partial outputs before deciding what to repeat. Cancellation retains partial artifacts and does not undo completed output. Computation currently does not resume after server restart.

After requesting cancellation, poll while status is `cancelling`; only `cancelled` confirms the worker has closed. This does not prove that every operating-system descendant has terminated or remove partial files.

For an actual Avid sequence export, discover `export_settings` through `avid_native_read`, read the target MOB, then preview/apply `export_mp4` with its complete duration and explicit video/audio output contract. Current qualification is Windows 2024.12 H.264 1080p30. Review the preset in Avid: its content and unsaved timeline graph cannot be fingerprinted by the adapter. An uncertain export retains the native write lock; inspect the output and host before recovery, and never replay the consumed token. Report `outputVerified` separately from source fidelity, which this action does not establish.

For a retained export lock, call `avid_native_lock_status`. After Avid has stopped, `avid_recover_native_export_lock` accepts the inspected checksum and releases only an eligible unchanged lock. It preserves output and does not retry the export. Do not attempt recovery while Avid is running or clear unrelated generic locks.

Return local deliverable paths, source ID/revision, exact range and performed validation. Distinguish a source MP4 export from an actual Avid sequence render.
