# Saved marker inspection

`avid_saved_markers` reads paginated marker occurrences from `avid_snapshot_saved_bins` revisions. Supply the revision and exact MOB ID from snapshot discovery; supply the absolute bin path when a MOB appears in multiple bins. Preserve those values while following `nextAfter`. No Avid process or loaded model is required to read a captured revision.

New captures preserve reachable TMBC records: original ID, normalized UUID when valid, name, comment, user, color label, RGB16 declaration, raw component offset, component path and location. Unknown text fields are omitted. Missing values are null. Repeated references are occurrences rather than deduplicated identities. Orphan records outside a MOB's reachable graph are excluded.

Location status is explicit:

- `direct_sequence`: derived from a same-rate component sequence and its track/subclip bounds.
- `declared_effect_input`: a recognized equal-length color-adapter or stereo channel-combiner input was crossed. The coordinate is not proof of rendered output correspondence.
- `unresolved`: the coordinate is null, with a reason such as mixed rate, transition overlap, opaque effect, invalid offset or unsupported path.

Top-level `status: not_recorded` and `total: null` identify older snapshots without marker data. A newly inspected empty collection reports `recorded` and zero. Coverage counts include unresolved and declared-effect-input occurrences across the entire selected MOB, not just the page. Timeline completeness elsewhere in the snapshot does not establish complete marker mapping.

Saved snapshot diffs include recorded marker fields. Adding marker coverage to an older snapshot can therefore produce a difference even when no editor operation occurred; missing versus recorded-empty is a coverage difference, not proof of a marker edit.

Capture uses global traversal/count limits, bounded text/path fields and the existing snapshot output-size and source-hash checks. Reads enforce existing authorized-path rules and validate marker owner, mapped bounds, track, rate and uncertainty status. No locator media is opened by marker traversal.

## Evidence

The retained Sonoma before/persisted/cleaned AVBs passed actual stdio MCP capture and reconnect. Two persisted markers matched native post-save UUIDs, text, colors, frames 15/75 and picture track 1; before/cleaned snapshots returned zero. The effect-input status remained explicit, and omitting the bin when IDs repeated was refused. Inputs and server entry hashes were unchanged. Evidence: `.avid-mcp-analysis/saved-markers-6f0283d1-bf27-488c-a74c-f347215dc610/evidence.json`.

Reproduce with `node scripts/research/qualify-saved-markers.mjs ABSOLUTE_MARKER_EVIDENCE_DIRECTORY [ABSOLUTE_SERVER_ENTRY]`. It uses retained snapshots and native evidence, without editing Avid. Synthetic tests cover AVB marker serialization, direct/subclip positions, uncertainty/refusal paths, limits, legacy snapshots, pagination and reconnect. Broader audio/effect/rate structures, Unicode native writes, live/unsaved graphs and restart/undo remain unqualified.

Fresh managed-package qualification also passed: `.avid-mcp-analysis/installed-saved-markers-91e42d28-b85f-4203-aa78-c0853c5a5b4f/evidence.json`, with native-evidence comparison in `saved-markers-1292de87-b976-4e78-980a-3d61d8408d17`. Use `qualify-installed-saved-markers.mjs` with the same evidence directory to create a checksum-selected installation and repeat capture/reconnect from a foreign working directory. It uses the existing Windows/Python environment, not a clean machine or named AI-client GUI.

## Stereo batch qualification

A fresh 100-marker native batch on V1/stereo A1 passed save/reopen and retained before/persisted AVB snapshots (`native-batch-markers-91656937-1c10-4d04-b644-0c455d3363b5`, owned bin `MCP_Batch_fe73fd13.avb`). Audio markers were attached to the second source channel inside `EFF2_AUDIO_CHANNEL_COMBINER`. Initial MCP capture correctly left those positions unresolved; its failing comparison is retained in `saved-markers-15f18725-e93d-4964-83e0-0aebaee74241`.

The marker resolver now shares the existing saved-audio decoder's strict stereo-input recognizer: exactly two equal-length sound SourceClips at the same rate, channel indices 1/2, no reversal/scalars/mode changes, parameters or keyframes. Unknown variants remain unresolved. The path preserves the input channel, while the returned track index identifies the outer A1 track. Both channel paths have unit coverage; actual evidence qualifies the observed second-channel placement.

All 100 saved occurrences now match native GUID/text/color/track/frame readback across six 17-item MCP pages and reconnect: 50 picture and 50 sound occurrences, all explicitly declared effect inputs. Evidence: `saved-markers-4de52d08-241a-4f09-87d2-f1fd976806ca`. Independent saved-record comparison also matched every coordinate and all other decoded timeline fields against the pre-marker snapshot (`saved-marker-position-verification.json` in the native evidence directory). Original source hashes and retained snapshot hashes stayed unchanged. The fixture retains its markers; no cleanup, full graph equivalence, cross-rate or general audio-effect qualification is claimed.

Both qualification harnesses now accept completed two-marker cleanup evidence or retained 100-marker scale evidence. The latter verifies its empty baseline but reports cleanup as unverified. Existing two-marker compatibility was rechecked in `saved-markers-c9cddbf4-a271-4e73-9773-5ff1e1a57426`.

The corrected 100-marker comparison also passed from a fresh managed package: `installed-saved-markers-22434ebc-a44d-49c7-b6f1-1a2c1da8fa8e` / `saved-markers-797309a4-59ee-46c5-b815-2626e3b1d077`. All 50 picture and 50 sound declarations matched after reconnect, with protected files unchanged.
