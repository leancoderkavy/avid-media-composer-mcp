# Inspect AAF selects before native import

`avid_inspect_aaf_selects` accepts `{ "file": "<absolute AAF path>" }`. It requires the file and every referenced media file inside configured allowed roots, plus export capability for its local request manifest. It reads the AAF and media without modifying them or contacting Media Composer.

The response includes the AAF checksum, local media checksums, master metadata, and one composition's name, edit rate, frame count and per-track source ranges. Each cut records its composition position, source master/slot, source start and length. Ranges use frames at the reported edit rate.

The supported composition has 1–16 same-rate picture/sound tracks, zero slot origins and 1–500 direct master source clips per track. Tracks must have equal total durations, and every source range must fit a matching master slot of the same kind and rate. Embedded essence, multiple/missing compositions, fillers, nested components, transitions, mixed rates and unsupported source references are rejected. The reader also enforces the existing 64 MiB AAF and local-locator limits.

This is structural inspection of direct composition references. It does not qualify downstream source-mob effects, descriptor semantics, online media identity inside Avid, relinking, import settings, host remapping, playback or rendering. `hostImportVerified` remains false. Native import is still a separate research workflow; this tool is the reusable inspection stage needed by its future preview/apply adapter.

## Evidence

Actual stdio MCP inspection of the previously imported Sonoma PCM selects AAF recovered V1/A1/A2, two cuts per track at source starts 2850 and 3300, lengths 60, composition positions 0 and 60, and total 120 frames at 30 fps. The source-clock PCM MOV checksum matched the earlier native qualification, and the AAF/media remained unchanged. The master-only reference AAF was rejected because it has no composition.

Run `node scripts/research/qualify-aaf-selects-inspection.mjs` after building on this fixture host. Evidence: `.avid-mcp-analysis/aaf-selects-inspection-16213c99-8fd7-4c1d-89b2-1ca5122e54e7/evidence.json`.

Python tests additionally mutate independent generated AAFs to exercise rate/origin differences, fillers, out-of-range cuts, incorrect sequence length, multiple compositions and missing source slots; each refusal preserves the inspected file. TypeScript tests exercise missing composition evidence and permitted versus network media locators.
