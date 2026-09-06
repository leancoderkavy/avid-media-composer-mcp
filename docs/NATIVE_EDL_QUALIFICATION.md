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
