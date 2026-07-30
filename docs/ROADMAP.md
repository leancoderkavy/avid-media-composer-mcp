# Roadmap

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

- [ ] Obtain Avid Extensions SDK access and confirm license/redistribution terms.
- [ ] Scaffold the `.avpi` extension without committing proprietary SDK material.
- [ ] Implement heartbeat and capability negotiation.
- [ ] Implement full live-state inspection.
- [ ] Map every catalog action to a supported SDK method or mark it unsupported.
- [ ] Add stable target IDs and expected-state validation.
- [x] Define and validate undo grouping and partial-apply reporting in protocol v2.
- [ ] Implement undo grouping and partial-apply reporting in a sanctioned Extension.
- [ ] Validate on disposable projects in supported 2024.12.x, 2025.6, and 2025.12.x hosts as access permits.

## Phase 3 — deeper analysis

- [ ] Timecode continuity, VFR, field-order, color-space, channel-layout, and offline-media QC.
- [ ] Optional loudness, silence, black/freeze frame, slate/clap, and sync analysis.
- [ ] Transcript and shot-analysis sidecars with explicit opt-in.
- [ ] Project snapshot/diff reports.
- [ ] Cross-bin mob/source usage graph.
- [ ] Sequence complexity, effect, render, relink, and turnover reports.

## Phase 4 — enterprise adapters

- [ ] MediaCentral CTMS read adapter.
- [ ] Optional Production Management operations with scoped credentials.
- [ ] Licensed Avid Media Toolkit adapter when authorized.
- [ ] NEXIS/shared-storage health and path mapping without bypassing locks.

## Release evidence required

For each live operation:

1. catalog entry;
2. SDK implementation;
3. disposable fixture;
4. pre-state capture;
5. action response;
6. post-state capture;
7. undo/rollback evidence where applicable;
8. supported Media Composer version record.
