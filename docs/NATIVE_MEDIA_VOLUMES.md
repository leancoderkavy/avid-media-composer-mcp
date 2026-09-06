# Native media-volume research

The locally inspected 2024.12.58720 service declares `GetMediaVolumeList` with an empty request body and a repeated volume response containing `name` (string), `is_shared` (bool), and `free_space` (uint64). No path, unit, freshness timestamp, media-database identity or online/relink state is declared in that response.

On 2026-09-06, the bounded read-only research utility successfully called it on the installed Avid host after verifying the loopback listener owner. It returned three volume display names and string-valued free-space declarations. The response omitted `is_shared` for all three records; the utility preserves omitted defaults rather than representing this as independently verified storage topology. The project read still identified `MCP_Sonoma_30p_20260905`, 1920×1080 at 30/1.

| Avid display name | Raw `free_space` declaration |
| --- | --- |
| Luqi (C:) | 174871706 |
| Mili (D:) | 1042235900 |
| Games (E:) | 484221241 |

A subsequent Windows `Win32_LogicalDisk` read reported free bytes of 179418767360, 1069338091520 and 496812888064 respectively. The observations were not atomic, and the native values do not equal these byte counts. Do not label the native values bytes or infer a conversion factor, available write capacity, freshness or storage health from this single comparison. Display names are not canonical paths and must not be parsed into an authorized path mapping.

Evidence: `.avid-mcp-analysis/native-media-volumes-20260906.json`. Reproduce with a new output filename:

```powershell
.venv/Scripts/python.exe scripts/research/inspect_mcapi.py 'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe' --probe-read-only --media-volumes --output .avid-mcp-analysis/native-media-volumes-new.json
```

`--media-volumes` requires explicit `--probe-read-only`. The fixed research RPC allowlist now has four reads; the default live probe still calls only the original three. Response bytes, runtime and volume count remain bounded. This initial experiment was research-only and sent no editor mutation.

## MCP diagnostic

`avid_native_read` with `query: "media_volumes"` now exposes the observed read through the qualified Windows native adapter. It requires inspection authority and a current project within configured roots. The explicitly requested inventory is host-wide, not limited to volumes containing that project. Project path and listener owner are checked around the read; this is not an atomic snapshot.

The diagnostic retains volume names as display strings, exact uint64 values as decimal strings, and absent fields as absent. It does not convert a display name into a path, infer shared-storage health, calculate capacity, or establish media online/relink status. It returns `freeSpaceUnit: null`, `pathsResolved: false` and `mediaOnlineVerified: false`. Response shape and the aggregate 256-volume limit are enforced. Empty declared lists are allowed; unknown properties are omitted.

`qualify-native-media-volumes.mjs` passed against the actual host through two fresh inspect-only stdio MCP sessions. Both returned the observed three names, preserved omitted shared flags and raw values, and left the protected bin/original media hashes unchanged. Evidence: `.avid-mcp-analysis/native-media-volumes-cf6f6f5f-b35c-441f-95f1-77ce9b6a4ab3/evidence.json`. Regression coverage includes uint64 maximum precision, malformed/numeric/overflow values, oversized lists, absent authority and changed project/listener ownership. The native allowlist now has 16 reads and 16 writes; MCP tool count stays 143 because this extends an existing query.

The extended harness also passed a third fresh session with configured roots excluding the open Avid project. That request returned an error without volume data or any of the three volume names, while the two authorized sessions succeeded and protected hashes stayed unchanged. Evidence: `.avid-mcp-analysis/native-media-volumes-45a61e33-0046-4954-9b11-b8bae996114a/evidence.json`. The separate adapter regression verifies that only the project read occurs before refusing an out-of-scope project; the volume RPC is never called. All 117 focused native tests passed. This test/research extension leaves production code unchanged from the preceding implementation.

## Fresh installed native runtime

The same three-session qualification passed using a freshly packed and installed development tarball, launching its MCP entrypoint with a working directory outside the checkout. The installed `dist/index.js`, `dist/server.js`, `dist/native/client.js` and `dist/native/adapter.js` hashes matched the checkout, and the entrypoint hash remained unchanged during execution. Both authorized reads succeeded; the excluded-project session returned no volume data. Protected original media/bin hashes were unchanged.

Evidence: `.avid-mcp-analysis/native-media-volumes-c48e50f4-42c7-4f86-a401-bfc50525f3c9/evidence.json`; archive and runtime hashes: `.avid-mcp-analysis/native-volume-installed-runtime.json`. The harness accepts an optional absolute entrypoint argument. Installation used npm with lifecycle scripts disabled; this verifies the native diagnostic on the existing qualified Windows/Avid workstation, not a clean OS, model setup, registry publication or another host version.
