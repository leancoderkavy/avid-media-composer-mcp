---
name: avid-export
description: Export local source clips, verified copies, thumbnails and transcript deliverables with Avid Media Composer MCP.
---

Start with `avid_get_capabilities` and the current tool schemas. Export capability and a configured output directory are required. Index source media with `avid_index_media` if no current content ID is available.

Use `avid_media_artifact` for a thumbnail, trimmed MP4 or checksum-verified source copy. Clip ranges use source seconds; choose explicit start/end bounds within the indexed duration. Outputs use unique folders and do not overwrite source media. This exports from a source file, not the active Avid sequence.

For subtitles or text, discover `avid_transcript_revisions`, read the chosen revision with `avid_transcript_range`, and call `avid_export_transcript` with that exact revision and requested TXT/JSON/CSV/SRT/VTT format. Keep revision provenance with the deliverable. If corrections are requested, `avid_correct_transcript` creates a new immutable revision; export that returned revision.

Inspect returned paths and completion status. For video deliverables, inspect the exported file's metadata and representative frames, and review requested audio/timing expectations. A successful encoder process alone does not establish editorial correctness. Use `avid_media_qc` on an indexed output for bounded technical checks when appropriate.

For long work, `avid_start_analysis_job` returns a job ID; query `avid_analysis_job_status` until completion or failure. Use `avid_analysis_job_history` after reconnecting to recover persisted results within the same roots/capabilities. Unfinished records from another session are unresolved: inspect possible partial outputs before deciding what to repeat. Cancellation retains partial artifacts and does not undo completed output. Computation currently does not resume after server restart.

Return local deliverable paths, source ID/revision, exact range and performed validation. Native Avid sequence rendering requires a separately qualified host workflow; do not claim it from a source MP4 export.
