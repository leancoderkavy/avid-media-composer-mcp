# One-frame native UI trim and undo qualification

## Coordinate-origin restrictions

Saved trim verification now validates explicitly declared source bounds against each mob's duration and refuses nonzero origins on the edited composition or its immediate referenced sources. The saved-bin parser normalizes subclip track coordinates relative to `_START`; treating every source offset as though that normalized graph starts at absolute source zero is not qualified. The previous duration-only checks could accept an otherwise exact synthetic edit despite this unresolved origin convention. Regression tests cover both target and referenced-source origins, inconsistent bounds and explicit zero origins. Existing decoded graphs without a sourceBounds field remain supported by the standalone verifier; MCP-captured snapshots always carry declared bounds.

Actual MCP verification still passed the retained forward, inverse and backward Avid captures, whose origins are zero: `.avid-mcp-analysis/saved-trim-mcp-ea81f1aa-61a0-4490-bcdc-b398d0abd118/evidence.json`. Captured bins remained unchanged. This closes a false-acceptance path; it does not implement nonzero-origin trimming or physical-media handle verification.

## Descriptor versus physical MP4 timing

The read-only `qualify-sonoma-descriptor-media.mjs` compares a separately named authorized Sonoma preview MP4 against the retained descriptor evidence. It requires the two saved WINF strings to equal the known fixture declaration (`D//Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4`); it never constructs a filesystem path from those strings. This is a fixture-specific correspondence check, not a general locator resolver or historical essence-identity proof.

Full FFprobe decoding produced 5,725 video frames versus the descriptor's 5,726 at 30 fps. Both declare 1280x720. The MP4 video stream starts at 0.033333 seconds and declares duration 190.833333 seconds. No corrective offset is inferred merely from this one-frame difference.

Audio decoding produced 9,192,704 samples versus the descriptor's 9,164,224, both at 48 kHz with two channels. With the observed 1/48000 audio time base, integer timestamp accounting found 960 ticks of gaps and 32,640 ticks of overlaps across 49 nonzero inter-frame discontinuities. Thus `9,192,704 + 960 - 32,640 = 9,161,024`, the decoded presentation span from timestamp zero to the final frame end. The descriptor remains 3,200 samples longer than that span. This demonstrates why sample sums, presentation spans and Avid descriptor lengths must remain distinct. It does not identify the cause of the descriptor offset or certify synchronization.

Evidence: `.avid-mcp-analysis/sonoma-descriptor-media-4294b24e-7de0-4b12-9806-26928ebfedd6/evidence.json` retains stream metadata, raw audio frame timestamps/sample counts, decoded video count and arithmetic. The MP4 and prior evidence hashes were unchanged before/after. Script syntax and full execution passed. Physical handle acceptance still requires qualified mapping of the selected ranges to the actual essence clock, including these discontinuities; descriptor length alone is insufficient.

## Captured descriptor declarations

New saved snapshots retain selected descriptor declarations per mob. `avid_trace_saved_sources` returns one `descriptors` entry per visited bin/mob, with status `recorded`, `absent` (captured null descriptor), or `not_recorded` (historical snapshot without this field). Each recorded entry includes the descriptor class ID, available numeric fields, one locator's declared path variants and identity, and the physical-media descriptor class ID when present. This is a bounded subset; descriptor attributes, multiple/nested descriptors and physical-media contents are not decoded here. Unknown locator classes remain identified without inferring a path.

All locator strings are untrusted saved metadata. Capturing and tracing never resolves or opens them, including network and out-of-scope paths. The caller must separately authorize and validate a candidate path before reading media. Numeric fields retain their original names and units: descriptor `length` uses the descriptor's `edit_rate`, which need not equal the mob timeline rate. No resampling or frame/sample conversion is implied.

Historical snapshots remain readable. For exact before/after trim comparison, capture both retained bins using the same parser version: mixing a historical descriptor-free baseline with a descriptor-bearing candidate changes the normalized records and is correctly refused rather than silently ignoring the new fields.

The restored Sonoma fixture returned five visited mobs: two absent descriptors, a CDCI video descriptor (30 edit rate, length 5726, 1280x720), an MPGA audio descriptor (48000 edit/sample rate, length 9164224, two channels), and an MDES descriptor with a WINF locator. Video and audio descriptors use MSML locators. Actual MCP assertions and unchanged-bin evidence: `.avid-mcp-analysis/trim-source-trace-51eefa79-0192-47b6-b333-0df257f926df/evidence.json`. The three saved trim directions also passed with descriptors included in new captures: `.avid-mcp-analysis/saved-trim-mcp-a6d244b8-5c30-4e44-872a-29a0ca9305ad/evidence.json`. The referenced media was not opened during these checks; essence identity, availability and handles remain unverified.

## Nested source mapping around the restored cut

`scripts/research/qualify-trim-source-trace.mjs` captures the retained restored baseline through MCP and traces [59,61), spanning both sides of the cut. All six V1/A1/A2 paths have three resolved references followed by one unresolved endpoint. Direct source ranges are [2909,2910) and [3300,3301). The master picture offset is zero and its next source offset is two; each sound channel has master offset one and next source offset one. All paths consequently reach [2911,2912) and [3302,3303) at the final captured source mob. These values were checked against the separately decoded saved nodes and asserted in the reproducible script.

The last references use track ID zero and a source identity absent from this captured bin. They remain `unresolved` with `incomplete: true`: neither an intentional terminal convention nor missing physical media is inferred. Physical source descriptors, locator/essence linkage and handle availability require further qualification. Evidence: `.avid-mcp-analysis/trim-source-trace-20c29ed9-c3e5-4d69-8343-12b5fc3e95cf/evidence.json`. The baseline AVB SHA-256 remained unchanged; no editor action occurred.

Source tracing also now computes relative timeline deltas before adding source offsets, avoiding intermediate integer rounding at large absolute timeline positions. Unsafe, negative or empty mapped intervals return `invalid_source_range` without emitting rounded source coordinates. Tests cover exact near-limit mapping and overflow/negative refusal. These numeric checks do not classify terminal references or validate physical media.

## Editor-state observation limits

On 2026-09-06, computer use resumed the interrupted Copy.05 observation and confirmed dual-roller trim mode at 01:00:02:00 with zero/zero counters and V1/A1/A2 selected. Opening Edit visibly exposed disabled Undo and enabled `Redo Trim Tail+Head -1`. The menu was dismissed, U exited trim mode, and a fresh screenshot confirmed the normal source/record layout with no trim counters. No trim, save, undo or redo was executed during this observation.

The accessibility objects were exactly equal across trim mode, the open Edit menu and normal editing. They contained the top-level window, two CW_monitor panes, a generic AvidMediaComposer pane and system title-bar controls. Focus was reported only as the top-level window. The visible sequence name, timecode, selected tracks, rollers, counters and history command were absent. Thus this accessibility route cannot supply the preconditions for an unattended trim executor on this host. This result applies to the observed computer-use accessibility interface, not every possible Windows or Avid interface.

Evidence: `.avid-mcp-analysis/native-ui-state-eb39fd34-26f6-45c5-843f-7fc0a1c34b64/evidence.json` retains the raw accessibility states, equality results and manually observed screenshot facts. The saved bin remained SHA-256 `8b8ccefa6225a38acc6aae30be05d05b469c14b8758afc12bdd80494df785822`. Screenshots were inspected during the experiment; their interpretation is not a shipped detector. A future executor needs a separately qualified observation mechanism for mode, focus, selection and history, including unknown-state refusal and layout/version tests. Native viewer identity/position and saved-bin verification remain useful independent checks but cannot replace these missing editor-state signals.

## Declared source-duration checks

Source bounds now also require exactly one source track with the referenced numeric index and matching media kind. The union of the before/after intervals must be covered by direct SCLP nodes on that track. Missing/ambiguous tracks, malformed or overlapping ranges, gaps, filler and opaque/combiner coverage are refused. Adjacent direct nodes can cover an interval. This prevents a longer picture track or overall mob duration from concealing a shorter sound track; picture and sound may legitimately share a numeric index.

Each bounds record now includes `sourceTrackId`, `sourceTrackOrdinal` and `mediaKind`. These describe the immediate source track only: nested physical-media availability and usable handles are still not verified. Actual MCP verification of the retained forward, inverse and backward captures passed with source-track resolution: `.avid-mcp-analysis/saved-trim-mcp-f440f6e3-bcc5-44f9-8a39-94bef25006e9/evidence.json`. No editor mutation occurred and all captured inputs stayed unchanged.

The saved trim verifier now rejects outgoing or incoming clip intervals that exceed the referenced same-rate source mob's declared duration, including invalid baseline intervals and unsafe integer arithmetic. It returns `declaredSourceBounds` for every selected track, identifying outgoing/incoming source IDs, declared duration, and half-open before/after source intervals. A forward roll lengthens the outgoing source interval and moves the incoming start while preserving its end; the reverse transformation is checked likewise.

This is a declared graph-bound check, not proof of per-track physical media handles, online availability, nested source conformance, UI selection or playback. It does not execute an edit or repair a graph whose baseline already exceeds its declared bounds.

The updated `scripts/research/qualify-saved-trim-mcp.mjs` passed actual MCP snapshot/verification for the retained forward trim, inverse undo and backward trim, returning six bounds records for each three-track edit and rejecting a one-track expectation. All four captured input-bin hashes stayed unchanged. Evidence: `.avid-mcp-analysis/saved-trim-mcp-a2593a8b-b4da-4b58-a39f-ce8d90d78e7f/evidence.json`. Focused tests also reject a mathematically exact edit that extends an outgoing clip past its source's declared end.

On 2026-09-06, computer use loaded the owned MCP_Sonoma_AAF_Selects.Copy.05 sequence from MCP_CopyMCP_93108dc0c7b8.avb into the record viewer. Its baseline is documented in NATIVE_UI_EDIT_BASELINE.md. A screenshot confirmed the copy name before editing.

With the position near the 60-frame cut, U entered dual-roller trim mode at 01:00:02:00 across V1/A1/A2. One period key moved both trim counters to 1. Ctrl+S saved the bin. Independent AVB decoding verified the exact edit: the first segment ends at frame 61, the second begins at 61 and its source start changes from 3300 to 3301; all three media tracks change identically. Duration remains 120 frames at 30 fps. The entire decoded sequence equals that expected transformation, including unchanged nonmedia tracks, identity, source references and other fields.

Ctrl+Z returned both counters to zero; Ctrl+S saved the undo. The complete decoded sequence equals the original baseline and all other decoded mobs remain unchanged. The binary hash differs after saving, so this is semantic restoration, not byte-for-byte undo. Trim mode was subsequently exited with U.

Evidence: .avid-mcp-analysis/native-ui-trim-20260906 contains baseline.json, trimmed.avb/json, undone.avb/json and verification.json. scripts/research/verify-native-ui-trim.mjs asserts the complete expected transformation and restoration. The baseline hash is 4b5154121a5c293f02abd64796e44ab6b20b961c7a38813ca5784960efcac97c; trimmed 7280e576e1fece04820ae8f756e3bce3e0874c8b7a42884cb6397b6cbbebd618; undone 7cee614e2e9bbbd8ed650e7cc4392b3147bface367be6e85a895ec11a791c1f2.

This is one observed manual computer-use workflow on Avid 2024.12, not a shipped UI adapter or native trim RPC. Post-edit close/reopen, redo, other trim modes, selection combinations, keyboard mappings, concurrent edits, unknown AVB fields and playback fidelity remain unqualified. The monitors remained black in captures. Do not infer undo support for native API mutations from this UI trim result.

Avid's [Media Composer User Guide](https://resources.avid.com/SupportFiles/attach/MC_UserGuide.pdf) provides trim-mode background. Actual key behavior and ranges above were established by the installed editor and saved-bin experiment, not inferred from documentation for another Avid product.

## Saved undo after bin close/reopen

The fixture-specific qualify-native-ui-undo-reopen.mjs first required the current bin checksum to equal the captured undone.avb, then used guarded MCP close_bin/open_bin operations and verified the single expected sequence identity. Independent parsing of a newly captured reopened.avb matched every decoded mob to the original pre-edit baseline, with no name or identity exclusions. Evidence: .avid-mcp-analysis/native-ui-undo-reopen-05c6a9f4-3c68-4b6f-900a-697bc4d1dc52/evidence.json. This closes bin-reopen persistence for the saved undo result only. It does not establish that undo/redo history survives closure or that the intermediate trimmed result was independently reopened.
## History availability after reopening

After the guarded close/reopen, computer use double-clicked the sole copied sequence, confirmed Copy.05 in the record viewer/timeline, focused the timeline ruler, and inspected Edit. Undo, Redo and Undo-Redo List were disabled. Select-All Tracks was present, confirming the timeline menu context rather than the bin context. No disabled history command was invoked. The menu was dismissed and the saved bin hash remained 7cee614e2e9bbbd8ed650e7cc4392b3147bface367be6e85a895ec11a791c1f2, equal to reopened.avb.

This is a negative acceptance result for retaining the prior redo action across this bin close/reopen, not a claim about every Avid history configuration. The future adapter must invalidate any assumed UI undo/redo availability when the bin closes, the sequence reloads or the host restarts. Recovery must inspect current state and retain verified before/after artifacts; it cannot blindly send Ctrl+R or Ctrl+Z based on an earlier successful edit. Same-session redo before closing remains untested.
## Same-session redo

A subsequent uninterrupted UI session on Copy.05 completed trim/save/undo/save/redo/save/undo/save. One period key in dual-roller mode made the same 60-to-61 cut change. Ctrl+Z restored it, Ctrl+R reapplied it, and a final Ctrl+Z restored it again; Ctrl+S captured each state before continuing. No bin closure occurred within this cycle. Trim mode was exited after final restoration.

The read-only capture utility scripts/research/capture-native-ui-redo.mjs preserves each named stage without overwriting it. scripts/research/verify-native-ui-redo.mjs checks the production trim verifier against the initial and redone transforms and the final inverse. It also compares every decoded mob: redo equals initial trim, and both undo captures equal the original baseline. Evidence: .avid-mcp-analysis/native-ui-redo-20260906/verification.json. The current restored bin SHA-256 is a32ac6db26653ff723c4d947d70a9e60ce2f1b806c7f9215984e27b53f33b03b. Earlier fixture-specific reopen scripts require their earlier recorded checksum and should refuse this newer saved revision.

This qualifies the single same-session cycle, including intervening saves. It does not reverse the observed loss of redo availability across bin closure, establish arbitrary edit history, or provide a shipping UI adapter.

## MCP verification tool

avid_verify_saved_trim compares two saved snapshot revisions with explicit baselineBin/candidateBin, mobId, cut, delta (-1 or 1), and selected trackOrdinals. Capture each state using avid_snapshot_saved_bins. The result verifies all normalized captured mob fields within the selected bins; it does not inspect other bins or execute a trim. Warning/incomplete graphs, unresolved or mixed-rate direct sources, unsupported cut components and unrelated edits are refused. Real MCP evidence: .avid-mcp-analysis/saved-trim-mcp-0d7379ba-0c81-474e-bf2e-bd61d85d4dd0/evidence.json. The captured Avid V1/A1/A2 trim passed, while a V1-only expectation failed.

## Backward trim and restoration

A new controlled computer-use cycle on the same disposable Copy.05 sequence entered dual-roller mode with all three media tracks selected, pressed comma once, saved, then invoked undo and saved again. The counters changed from 0/0 to -1/-1 and back to 0/0. The saved graph moved the cut from frame 60 to 59 and incoming source starts from 3300 to 3299 on V1/A1/A2, retaining 120 total frames. Production verification passed the backward edit and forward inverse. All decoded restored mobs equal the baseline; trim mode was exited afterward.

Evidence: `.avid-mcp-analysis/native-ui-backward-20260906/verification.json`. Baseline SHA-256: `a32ac6db26653ff723c4d947d70a9e60ce2f1b806c7f9215984e27b53f33b03b`; backward: `25cbac5b2e20f132afa3fb71ce870a0949b42b24176e8d93cf931b3963f2b898`; restored: `8b8ccefa6225a38acc6aae30be05d05b469c14b8758afc12bdd80494df785822`. The capture/verifier scripts are `capture-native-ui-backward.mjs` and `verify-native-ui-backward.mjs`. This qualifies one observed negative-direction edit and same-session recovery; it does not ship UI execution or establish playback fidelity.
