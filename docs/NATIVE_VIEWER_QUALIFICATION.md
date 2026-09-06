# Native viewer loading qualification

`show_clip` uses the existing preview/apply token flow and requests the Source viewer. Its receipt reports `viewerVerified` only when bin-scoped viewer readback contains the requested MOB ID with viewer type `Source`. Application completion alone does not establish that result. A failed read or identity mismatch leaves verification false and does not replay the request.

On the qualified Windows 2024.12 host, loading the disposable Sonoma source master completed but reported a different Source MOB ID. Read-only investigation found that ID absent from the bin and `GetMobInfo` returned no columns for it. The load response has no identity mapping field. Evidence: `.avid-mcp-analysis/viewer-identity-investigation.json`. A temporary viewer identity is a possible explanation, not established equivalence; the adapter does not substitute names or file paths to claim success.

A separate sequence comparison passed. `node scripts/research/qualify-source-viewer.mjs --sequence` loaded `MCP_Sonoma_AAF_Selects` into Source through MCP preview/apply and observed the exact requested ID afterward. The saved bin and original source MP4 hashes remained unchanged. Evidence: `.avid-mcp-analysis/source-viewer-ddfd864a-c182-4834-9205-4c1eecd06e39/evidence.json`. The sequence was left loaded in Source.

The harness saves its receipt and subsequent viewer read before asserting success. Without `--sequence`, it targets the previously tested master and may reproduce the unresolved mismatch. Do not run it as an automatic retry after an uncertain load. Neither case verifies seeking, playback, visible monitor pixels, undo, full live timeline structure or other host builds.
