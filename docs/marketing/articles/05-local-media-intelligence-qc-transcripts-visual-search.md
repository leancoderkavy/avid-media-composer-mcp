# Local media intelligence for Avid pipelines: QC, transcripts, and visual search

- **Primary keyword:** Avid media QC with AI
- **Secondary keywords:** local transcript Whisper Avid MCP, visual search CLIP editorial, speaker diarization post production, Avid contact sheet automation
- **Audience:** AE teams and post houses evaluating the development branch
- **Capability note:** Tools in this article ship in repository `1.2.0-rc.1`. They are **not** installed by `npx avid-media-composer-mcp@latest` (`1.1.0`) until the RC is published. Always discover tools with `tools/list` on the build you run.
- **Status:** draft for HOLD-MERGE review — not published

## Answer-first summary

The Avid Media Composer MCP development branch can index local media by content hash and run bounded, cancellable analysis jobs for technical facets, black/freeze/silence/loudness QC, Whisper transcription, speaker diarization, CLIP visual search, frame captions, contact sheets, and verified trims/copies — without uploading media to a third-party cloud and without modifying source files. Findings require human review; QC output is not delivery certification.

## Why keep intelligence local

Post houses already guard camera originals and picture-lock media. A local MCP library that keys media by SHA-256 and writes artifacts under configured output roots fits that constraint better than “paste a drive into a chatbot upload.”

Founder Kavy Rattana’s design keeps export and project-write authority explicit: many tools require those capabilities and refuse to overwrite sources.

## Core library loop

| Step | Tools |
| --- | --- |
| Index files | `avid_index_media` |
| Read technical metadata | `avid_library_metadata`, `avid_media_facets` |
| Timecode continuity (metadata only) | `avid_timecode_continuity` |
| Search metadata / selected transcript text | `avid_search_media` |
| Artifacts | `avid_media_artifact`, `avid_contact_sheet`, `avid_thumbnail_strip`, `avid_media_report` |

`avid_search_media` is substring search over indexed metadata and selected transcript revisions — not visual or semantic search.

## QC recipe (ingest)

Tool: `avid_media_qc`  
Follow-ups: `avid_qc_reports`, `avid_read_qc_report`

What it measures (bounded decode windows; see tool schema for stream selection and duration limits):

- Black
- Freeze
- Silence
- Input loudness
- Timestamp-variation findings

Outputs JSON/HTML reports under export authority. Prompt the assistant to treat findings as review queues, not pass/fail certificates.

For longer work, queue with `avid_start_analysis_job`, poll `avid_analysis_job_status`, and cancel with `avid_cancel_analysis_job` when needed. Partial outputs can remain after cancel; cancellation is not rollback.

## Transcript recipe

| Action | Tool |
| --- | --- |
| Transcribe a bounded window | `avid_transcribe_media` (local Whisper weights you explicitly download) |
| Language hint from ≤30s | `avid_detect_speech_language` |
| Import / correct / export revisions | `avid_import_transcript`, `avid_correct_transcript`, `avid_export_transcript`, `avid_transcript_range`, `avid_transcript_outline` |
| Summaries (review required) | `avid_generate_summary`, `avid_summary_node`, … |
| Speaker spans | `avid_diarize_audio`, `avid_align_speakers`, `avid_assign_transcript_speakers`, correction/cleanup tools |

Hard limits matter in training: transcription windows are bounded (tool schema: up to ten minutes per call for `avid_transcribe_media`). Models must be cached/downloaded deliberately. Labels from diarization are anonymous clusters — not identity claims.

## Visual search recipe

| Action | Tool |
| --- | --- |
| Uniform frame index | `avid_index_visual` |
| Shot-aware index | `avid_detect_shots`, `avid_index_visual_shots` |
| Text by text or reference image | `avid_search_visual`, `avid_search_visual_frame` |
| Inspect samples | `avid_visual_samples` |
| Frame captions | `avid_caption_frame`, `avid_read_caption`, batch/resume variants |
| Caption hierarchies | `avid_summarize_captions`, … |

CLIP similarity is not identity or probability. Exclusion refinements softly lower scores; they do not guarantee concept absence. Sample caps exist (see schemas — e.g. per-file and total sample limits on visual index tools).

## Selects-oriented handoff (still RC)

Workflow skills in `skills/avid-selects` guide assistants through visual search → collections → AAF selects building/inspection. Pair with:

- `avid_build_aaf_selects` / `avid_inspect_aaf_selects`
- Optional native import only on the qualified Windows path documented in project status docs

Always separate “AAF bytes verified” from “editor accepted the select reel.”

## Guardrails to repeat in every demo

1. Source media is not modified; artifacts land in unique output folders.
2. Review machine text (captions, summaries, transcripts) against picture/sound.
3. Job history survives reconnect; unfinished work is not automatically replayed across sessions.
4. People/face tooling, where present, has its own provenance and license constraints — read tool schemas and model notices before facility rollout.

## FAQ draft

**Is media uploaded to the cloud?**  
Indexing and analysis run locally against configured roots and models. The MCP server’s library tools describe local SHA-256 indexing with no media upload in their contracts.

**Can I use this from the published npm package today?**  
Not via `@latest` (`1.1.0`). Build and run this repository’s `1.2.0-rc.1` until the RC publishes.

**Is QC output delivery-ready certification?**  
No. It is bounded technical finding generation for human review.
