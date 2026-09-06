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
