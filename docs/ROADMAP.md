# Roadmap

## Updated delivery direction — 2026-09-05

The [competitor review and staged plan additions](COMPETITOR_RESEARCH.md) supplement the original phases below. Deliver Windows local setup and a separately qualified native adapter first, then richer media/interchange workflows, optional analysis providers and named UI automation. Mac code follows on a Mac. The user cannot obtain Avid SDK access; it is not a prerequisite for the native research route. A sanctioned Extension remains a separate optional path with its own SDK requirements.

- [x] Package the 16 demonstrated native operations behind individual capability and host-version checks; research smoke tests alone are not production support.
- [x] Add bounded timeline/source queries, local reports, verified outputs and reusable workflow skills as described in the competitor review. Shipped as `avid_saved_timeline_range`, `avid_saved_source_usage`, `avid_saved_source_resolution`, `avid_trace_saved_sources`, `avid_media_facets`, `avid_media_report`, `avid_qc_reports`, `avid_contact_sheet`, `avid_thumbnail_strip`, receipt-bearing `avid_media_artifact` copies/trims and the five bundled skills. Real-host acceptance rows remain tracked in the completion ledger.
- [ ] Qualify the seven Sonoma MP4 exports in a disposable Windows project; original Premiere media and Mac qualification remain later work.
- [x] Evaluate optional Jumper search integration using its public API without making it a core dependency. A bounded loopback client ships as `avid_jumper_read` (see [Jumper provider](JUMPER_PROVIDER.md)); licensed-runtime qualification remains open.

The native packaging item is implemented in [NativeClient](../src/native/client.ts) and [NativeAdapter](../src/native/adapter.ts). All 16 methods from the historical [native smoke test](NATIVE_API_SMOKE_TEST.md) are in the current allowlist and have adapter call paths. The allowlist now contains 16 reads and 17 writes, including guarded duplication, media-volume declarations, batch markers, clip-bin lookup, bin-column discovery, subclips, viewer/selection and export/import operations. Reads require inspection authority; writes go through action-specific capabilities and guarded preview/apply. The client binds schema loading to the qualified executable hash and verifies the loopback listener owner. This closes the packaging item only: operation-specific real-host evidence, version limits and remaining acceptance work are tracked in [implementation status](IMPLEMENTATION_STATUS.md) and the [completion ledger](COMPLETION_LEDGER.md).

## Phase 1 — research and offline foundation

- [x] Research Avid APIs and comparable editing MCPs with Tavily.
- [x] TypeScript stdio MCP with structured output and annotations.
- [x] Allowed-root and source-media safety boundaries.
- [x] Project inventory and lock analysis.
- [x] AVP/AVS text and opaque-binary evidence analysis.
- [x] AVB and AAF Python inspectors.
- [x] ALE and EDL parsers.
- [x] Optional ffprobe clip analysis.
- [x] 167-action editing taxonomy.
- [x] Preview/token/apply and local bridge protocol.
- [x] TypeScript, Python, simulated bridge, and MCP protocol tests.
- [x] Independent authenticated, unauthorized, and public HTTP quotas.
- [x] Runtime-validated bridge capability, live-state, and edit-result evidence.
- [x] Clean-install package smoke test and npm provenance workflow.
- [x] Landing dependency audit, CI coverage, and browser security headers.

## Phase 2 — sanctioned Media Composer Extension

Media Composer 2025.12 renamed the former Panel SDK/panels surface to **Media Composer
Extensions** and introduced an Extensions menu. This is the correct integration target, but it
does not grant this project SDK access, packaging rights, signing authority, or a verified host
bridge. Avid's current public product page encourages extension development while an older
onboarding page says new partner onboarding is paused; the team must resolve that conflict in
writing with Avid before committing to a live-control date.

- [ ] Obtain Avid Extensions SDK access and confirm license/redistribution terms.
- [ ] Scaffold an Avid-supported Extension package without committing proprietary SDK material or guessing a `.avpi` layout.
- [ ] Implement heartbeat and capability negotiation.
- [ ] Implement full live-state inspection.
- [ ] Map every catalog action to a supported SDK method or mark it unsupported.
- [ ] Add stable target IDs and expected-state validation.
- [x] Define and validate undo grouping and partial-apply reporting in protocol v2.
- [ ] Implement undo grouping and partial-apply reporting in a sanctioned Extension.
- [ ] Validate on disposable projects in supported 2024.12.x, 2025.6, and 2025.12.x hosts as access permits.
- [ ] Record separate evidence for Extension installed, MCP connected, read state matched, host mutation visible, post-state matched, save/reopen persisted, and undo/recovery succeeded.

## Phase 3 — deeper analysis

- [x] VFR, field-order, color-space and channel-layout declarations in `avid_media_qc`; offline-media checks in `avid_saved_locator_availability`.
- [ ] Timecode continuity QC.
- [x] Loudness, silence and black/freeze detection in `avid_media_qc`; audio-content offset analysis through `audio_sync` jobs.
- [ ] Slate/clap detection and perceptual sync analysis.
- [x] Privacy-safe local transcript revision/timing/speaker QC.
- [x] Project snapshot/diff reports (`avid_snapshot_saved_bins`, `avid_diff_saved_snapshots`, `avid_verify_snapshot_bin`).
- [ ] Cross-bin mob/source usage graph. Per-source cross-bin usage exists in `avid_saved_source_usage`; a whole-snapshot graph does not.
- [x] Sequence complexity (`avid_saved_sequence_complexity`) and metadata-only DNx turnover reports.
- [ ] Effect inventory, render and relink reports.
- [x] Add conservative OTIO inspection and handoff preview with local-media manifest, checksums, and fidelity blockers. Real-host import/relink validation remains required.
- [x] Add source-marker and strict static SVG-overlay validation.
- [x] Add metadata-only DNx 4.0 turnover QC.

## Phase 4 — enterprise adapters

- [x] MediaCentral CTMS read adapter with HTTPS origin allowlisting and session-scoped HAL discovery.
- [ ] Optional Production Management operations with scoped credentials.
- [ ] Licensed Avid Media Toolkit adapter when authorized.
- [x] AMA/AMT/AVX/AAX/NEXIS/Distributed Processing prerequisite diagnostics without administration.
- [ ] NEXIS/shared-storage health and path mapping without bypassing locks.

## Release evidence required

For each live operation:

1. catalog entry;
2. implementation in the explicitly selected native, Extension, interchange or UI adapter;
3. disposable fixture;
4. pre-state capture;
5. action response;
6. post-state capture;
7. undo/rollback evidence where applicable;
8. supported Media Composer version record.

## Current release boundary

The offline analyzer and interchange work can ship independently. The 167-action catalog,
file-bridge protocol, or a simulated test result must never be presented as an edit performed by
Media Composer. Every live-control release requires the real-host evidence above for each
advertised action and adapter. An Extension release additionally requires confirmed SDK terms
and an Avid-supported installed Extension. Native research does not establish Extension support.
