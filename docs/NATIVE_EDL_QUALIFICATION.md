# Native EDL research and preset discovery

`avid_native_read` with `query: "edl_settings"` lists EDL preset names from the qualified Windows host. It requires inspection authority and an authorized current project, checks that project again after discovery, bounds response bodies and aggregate names to 512, and returns distinct names without other native fields. Names do not verify preset contents or an export destination.

Actual inspect-only MCP qualification returned `Default EDL` on Media Composer 2024.12.58720. Evidence: `.avid-mcp-analysis/native-edl-presets-3ac0eebc-d74e-4e89-8e20-a42528a04e46/evidence.json`. Repeatable harness: `scripts/research/qualify-native-edl-presets.mjs`. No export or preset modification was performed.

Local descriptor inspection found `ExportEDL` takes a MOB ID, an EDL settings name and a track list. Its response exposes a path and dialog contents; the request does not expose a destination path. `ExportEDL` remains outside the supported native method allowlist. Qualification must establish destination selection, dialogs, overwrite behavior, exact requested track coverage, source/record timecodes, output-path authorization and artifact verification before exposing a guarded action. This is an interchange candidate, not a verified live sequence graph API. No complete sequence-graph method was identified in the inspected service descriptor; this does not establish absence from every Avid interface.

## Cut artifact verifier

`src/native/edl-verifier.ts` provides an internal artifact verifier for an explicit ordered 30 fps non-drop cut contract. It checks exact reel/track/timecode values and event count; validates clock fields and positive matching source/record durations; rejects rollover, retiming, transitions, motion effects, unparsed or truncated content and extra inline fields; and compares artifact hashes before and after inspection. It reports frame ranges and a qualified scope. Callers must authorize the artifact path before invoking it. This component is not yet wired to a native export action.

The eight parser/verifier tests cover valid frame conversion, changed reel/track/timing/count, invalid clocks, duration mismatch, midnight rollover, unsupported timing modes, transitions, motion effects and unknown content. This is generated-artifact evidence, not proof of Avid export output, source-media identity or full EDL semantics. Drop-frame/mixed-rate/effect verification remains separate work.

## Observed Windows List Tool state

Computer-use inspection of the running Sonoma project found the List Tool under Tools > List Tool. Its active setting was `Default EDL`, while its output format was `File_129`. The format menu also exposed `CMX_3600`, `CMX_DigitalCut`, `CMX_Transfer`, `Cuedos`, `File_16`, `File_32`, `Columnar`, `TabbedLists` and `XML`. No sequence was loaded in the List Tool and Preview/Save List were disabled. The format menu was dismissed without selecting a new value; no export was attempted.

These are UI observations on the qualified host, not claims about every available format or native ExportEDL behavior. A discovered preset name must not be treated as a verified CMX format. Qualification should use an explicitly inspected dedicated preset and compare the produced artifact before promoting native export support. Destination and overwrite behavior still require an actual controlled export experiment.

## Actual single-file UI export

Loaded the disposable `MCP_Sonoma_AAF_Selects` sequence into Composer, then used List Tool Load and Preview with the existing `Default EDL` / `File_129` setting. V1, A1 and A2 were visibly selected. Save List offered `To one file` and `To several files`. The single-file choice opened `Saving ListTool output...`, initially in Avid Users, with an editable filename and `.edl` type. A new absolute research path was entered and saved without an overwrite prompt.

Artifact: `.avid-mcp-analysis/sonoma-file129-ui-20260905.edl`, SHA256 `a5aa960b39af8b64a3260b2d90b0d43a4f14440d63f7a86a15e71f4acec6fe0f`. It contains two six-digit numbered cut events with long padded reel fields, combined `AA/V` tracks, source ranges `10:02:23:23–10:02:25:23` and `10:02:38:23–10:02:40:23`, and record ranges `01:00:00:00–01:00:02:00` and `01:00:02:00–01:00:04:00`. Despite the File_129 UI label, this observed file uses CMX-style event syntax accepted by the cut verifier.

The verifier passed an explicit contract transcribed from the artifact (`sonoma-file129-ui-verification.json`). This validates parsing/frame conversion and artifact consistency, not an independent match to source-media identity or separate A1/A2 coverage. The combined label must not be treated as channel-level proof. Native RPC destination behavior, overwrite behavior and dedicated preset qualification remain untested. Composer and List Tool remain loaded with the disposable sequence; no timeline edit or preset-format change was performed.

## Independent saved-bin timecode comparison

`scripts/research/qualify-edl-saved-oracle.mjs` freshly indexes the saved AVB, follows the selected sequence's V1/A1/A2 source chains to their source timecode components, and derives the expected EDL timecodes without reading EDL event values. Traversal requires unique covering nodes, 30 fps non-drop timecode, matching rates, bounded acyclic chains and exact agreement across the three saved tracks. Source offsets at intermediate master/source mobs are included. The combined `AA/V` label is explicitly the observed export layout, rather than a derived channel-level claim.

The independent contract passed against the actual UI artifact. Evidence: `.avid-mcp-analysis/edl-saved-oracle-907dba21-8107-4f6c-901b-11f3bf470ca3/` contains the fresh saved graph, derived contract/chains and result. Bin hash remained unchanged. This upgrades source/record timecode evidence for this saved fixture, but does not establish raw-media identity, separate exported audio channels, unsaved graph consistency, other rates/effects or native RPC export.
