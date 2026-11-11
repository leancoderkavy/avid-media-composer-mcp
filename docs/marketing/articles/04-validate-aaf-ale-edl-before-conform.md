# Validate AAF, ALE, and EDL before conform with Avid Media Composer MCP

- **Primary keyword:** validate AAF before conform
- **Secondary keywords:** ALE validation Avid, EDL QC Media Composer, OTIO handoff Avid, DNx turnover check
- **Audience:** assistant editors, conform editors, DI/online coordinators
- **Tools referenced:** `avid_analyze_aaf`, `avid_analyze_ale`, `avid_analyze_edl`, `avid_analyze_otio`, `avid_preview_otio_handoff`, `avid_analyze_dnx_turnover`, `avid_validate_marker_package`, `avid_compare_transcripts`
- **Status:** draft for HOLD-MERGE review — not published

## Answer-first summary

Before you burn a conform bay on a bad package, use Avid Media Composer MCP to parse AAF, ALE, and CMX-style EDL evidence locally, validate bounded OTIO JSON, preview OTIO handoff blockers, assess supplied DNx turnover metadata, and check marker packages — without modifying the delivered files. These tools return structured findings an AI assistant can triage with an editor; they do not certify color, perceptual sync, or final delivery.

## Why interchange fails late

Turnover packages look fine in a folder list and still fail when:

- AAF compositions reference missing or mismatched essence
- ALE columns do not match the batch-import expectation
- EDL frame-count mode or reel names disagree with the online
- OTIO carries transitions, retimes, or nested timelines the destination cannot honor
- Marker SVG overlays include unsafe content

Catching those as structured tool output is cheaper than discovering them after a link.

## Recipe A — AAF package triage

Tool: `avid_analyze_aaf`

Ask the assistant to report:

- Composition / master / source mob structure
- Slots, components, essence descriptors
- Missing or opaque sections
- Anything that needs Media Composer confirmation rather than automated certainty

AAF analysis uses `pyaaf2`. It inspects; it does not import or relink the Avid project.

### Development-branch selects path (RC only)

In this repository’s `1.2.0-rc.1` work (not `@latest` yet):

- `avid_inspect_aaf_template` — inspect a master-only exported AAF and hash local media locators
- `avid_merge_aaf_references` — merge checksum-selected reference AAFs into a verified template
- `avid_build_aaf_selects` — build a straight-cut selects AAF with explicit mappings
- `avid_inspect_aaf_selects` — inspect same-rate straight-cut selects compositions

These still leave host import/playback as a separate step. Do not market them as “one-click into the timeline.”

## Recipe B — ALE column sanity

Tool: `avid_analyze_ale`

Prompt pattern:

> Parse this ALE. List headings, columns, and row counts. Flag malformed rows. Do not invent missing tape or timecode fields.

ALE is plain text; the tool parses what is present. Import success in Media Composer still depends on the target bin’s expected columns and facility conventions.

## Recipe C — EDL event pass

Tool: `avid_analyze_edl`

Request:

- Event list with transitions and comments
- Clip names and motion-effect lines where present
- Inconsistencies the parser can see in the text (not “will online accept this?” prophecy)

## Recipe D — OTIO readiness

| Tool | Role |
| --- | --- |
| `avid_analyze_otio` | Bounded OTIO JSON structural validation; flags transitions, effects, retimes, nested timelines, media references, audio-routing risks |
| `avid_preview_otio_handoff` | Local-media manifest, optional checksums, blockers, manual-import readiness |

Neither tool imports media into Media Composer.

## Recipe E — DNx turnover metadata

Tool: `avid_analyze_dnx_turnover`

Use when a vendor supplies DNx / DNx 4.0 turnover metadata and you need target-version risk notes **without** the MCP server performing a transcode.

## Recipe F — Markers and transcript QC sidecars

- `avid_validate_marker_package` — validate source markers; reject unsafe SVG overlays
- `avid_compare_transcripts` — compare transcript revisions locally; returns aggregate timing/speaker QC **without** returning transcript text

These support package hygiene; they are not a substitute for legal/QC sign-off.

## Suggested pre-conform checklist (human + MCP)

1. `avid_get_capabilities` — dependencies present?
2. `avid_analyze_aaf` / `avid_analyze_ale` / `avid_analyze_edl` on the delivered set
3. `avid_analyze_otio` + `avid_preview_otio_handoff` if OTIO is in play
4. `avid_analyze_dnx_turnover` when DNx metadata is part of the package
5. `avid_validate_marker_package` for marker deliveries
6. Editor review of opaque/truncated findings
7. Only then open Media Composer for import/conform

## What not to claim in sales calls

- “Validates every AAF ever made” — unsupported effect graphs and opaque sections exist
- “Guarantees conform success” — host codec, path, and policy issues remain
- “Replaces a color/online supervisor” — out of scope

## FAQ draft

**Can MCP validate an AAF without Media Composer?**  
It can analyze AAF structure through `pyaaf2` and report evidence. Import and relink still happen in the NLE (or via separately documented native import paths in development).

**Does OTIO analysis relink media?**  
No. Analysis and handoff preview stay local and bounded.

**Will ALE analysis fix my columns?**  
No. It parses and reports; column remediation is editorial/facility work.
