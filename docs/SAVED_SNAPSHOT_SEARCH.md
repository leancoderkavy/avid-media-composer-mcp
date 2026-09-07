# Find clips in saved snapshots

Capture authorized bins with `avid_snapshot_saved_bins`, or recover a historical revision with `avid_saved_snapshots`. Then call `avid_saved_snapshot_mobs` with that revision and optional filters:

```json
{
  "revision": "<returned revision UUID>",
  "limit": 20,
  "filters": {
    "query": "reviewed",
    "fields": ["comment"],
    "mobType": "CompositionMob",
    "rate": 30
  }
}
```

Text uses case-insensitive substring matching. `fields` defaults to name and comment; missing or unrecorded comments cannot match nonempty text. `mobType`, `usageCode` and numeric `rate` match exactly. Combined filters must all match. This is historical metadata search, not semantic or visual search. A declared numeric rate is not an assertion about timecode format or playback.

The response retains `totalMobs` for the full snapshot and adds `totalMatches` for the selected filters. Results retain their original snapshot indexes and bin paths; repeated mob IDs in different bins remain separate. Follow `nextAfter` with the same revision and filters until it is null. Use the returned `mobId` and `bin` in timeline-range or complexity queries when identities repeat.

Current root authorization still applies. `binPresent` reports availability, not agreement with the captured checksum. Search never recaptures, edits or opens Avid, and cannot include unsaved editor changes. Capture a new revision when current saved state is needed.

Qualification includes case-insensitive name/comment filtering, exact metadata combinations, missing matches, sparse pagination, duplicate identities across bins and denied roots. A real Sonoma subclip query and MCP reconnect passed with unchanged source/runtime hashes in `.avid-mcp-analysis/managed-python-snapshots-d83d18c4-2637-4380-9dae-616af17d9559/evidence.json`. The installed-package gate also searches a synthetic saved comment and verifies field exclusion and reconnect equality.
