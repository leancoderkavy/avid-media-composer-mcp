# Saved source tracing

`avid_trace_saved_sources` follows direct picture and sound source references in an existing project snapshot. It reads captured data and does not contact or edit Media Composer.

Use snapshot discovery to select a revision and MOB ID, then pass `revision`, `mobId`, `start` and `end`. Frame ranges are half-open: `start` is included and `end` is excluded. Supply the captured absolute `bin` path when the same MOB exists in several bins. The bin can have been removed since capture, provided its path remains authorized.

For example, a range of 10–20 in a source clip whose source starts at 20 maps to source frames 30–40. The tool continues through matching picture or sound tracks at the same edit rate. A unique identity in the current bin takes precedence over matches in other captured bins. Without a local match, exactly one cross-bin match is required.

Each returned step identifies its captured bin, MOB, track, range and depth. Direct references include their mapped source range. The tool reports unresolved or ambiguous identities, cycles, depth limits, unsupported components, nonzero source bounds, mixed rates, missing or duplicate target tracks, out-of-range sources, gaps and overlaps. `maxDepth` defaults to 8 and accepts 1–16. More than 500 steps rejects the request; narrow the range to retry.

`incomplete` means traversal encountered a stopping condition. No terminal-reference classification is implemented, and the result does not establish media availability, relink correctness, decoded playback, effects fidelity or live unsaved state. Parser completeness and source-chain completeness are separate properties.

## Sonoma qualification

The read-only MCP harness traced the saved 120-frame `MCP_Sonoma_AAF_Selects` fixture over V1, A1 and A2. It returned 24 steps with `reference` and `unresolved` statuses and `incomplete:true`. The first-level source ranges were 2850–2910 and 3300–3360; deeper sources retained their decoded offsets. Every branch stopped at the shared unresolved source identity. This is diagnostic range propagation evidence, not terminal media or playback proof.

Harness: `scripts/research/qualify-source-resolution-mcp.mjs`. Local evidence: `.avid-mcp-analysis/source-resolution-mcp-5fe637dd-27b2-4c75-b8c1-2893c91b2e30/trace.json`. The harness also verified three pages of source resolution and disambiguated the original and copied master by captured bin path.
