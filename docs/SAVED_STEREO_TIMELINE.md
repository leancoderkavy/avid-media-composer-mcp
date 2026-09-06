# Saved stereo source references

Saved-bin snapshots now expose source references inside the observed Avid `EFF2_AUDIO_CHANNEL_COMBINER` stereo component. Each recognized component produces two overlapping `SCLP` nodes with its original source MOB, source track and source start, plus:

```json
{"channelCombiner":{"channelIndex":1,"channelCount":2}}
```

The second channel has `channelIndex: 2`. Channel indices identify children of the stored combiner; they do not assert speaker identity, panning, gain or a perceptual channel layout. Subclip bounds and range overlaps apply to each channel independently.

Use `avid_snapshot_saved_bins`, followed by `avid_saved_timeline_range` or `avid_saved_source_usage`. Pagination retains each channel as a separate result. Semantic snapshot diffs retain channel labels, so a change in a label is not silently discarded. Existing snapshots without channel labels remain readable; create a new snapshot to inspect newly supported components.

Recognition is limited to sound combiners with exactly two ordered child tracks (indices 1/2), direct same-rate sound source clips of the parent length, zero reverse/mode/scalar fields and no parameter/keyframe list. Other effects or variants remain opaque with an incomplete-result warning. The reader does not infer timing through arbitrary effects, nested groups or retimes. It reads saved files only and never changes the editor or media.

The Windows 2024.12 PCM fixture was qualified through real stdio MCP range and usage queries. A query across timeline [45,75) returned both channels mapped to source [2895,2910) and [3300,3315), correctly paginated; usage returned four audio references for the two cuts. The source bin hash remained unchanged. Evidence: `.avid-mcp-analysis/stereo-timeline-476d5e14-dece-4037-b38a-5480fd9537bd/evidence.json`. Reproduce against the existing owned fixture with `node scripts/research/qualify-stereo-timeline-mcp.mjs`.

Synthetic AVB tests cover clipping, channel identity, traversal limits, reversed/unknown effects, duplicate channels and mismatched lengths/rates. TypeScript tests cover persisted labels, range paging, source usage and semantic diffs. Full checks passed with 294 TypeScript tests, 16 Python tests, 123 tools, both transports and fresh package installation.
