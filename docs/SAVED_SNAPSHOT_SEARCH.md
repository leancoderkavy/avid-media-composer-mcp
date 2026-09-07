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

Before relying on a particular saved bin, call `avid_verify_snapshot_bin` with its `revision` and returned `bin` path. This explicitly streams at most 512 MiB and compares the current SHA-256 with the captured hash. `matches` means the compared bytes match, `changed` includes both hashes, and `missing` preserves the historical identity without inventing a current hash. Detectable concurrent writes/path replacement, oversized files and access errors fail the check. It does not recapture or invalidate the historical snapshot. The result is an observation, not a lock: the bin can change afterward, and unsaved editor state and referenced media remain unverified.

Qualification includes case-insensitive name/comment filtering, exact metadata combinations, missing matches, sparse pagination, duplicate identities across bins and denied roots. A real Sonoma subclip query and MCP reconnect passed with unchanged source/runtime hashes in `.avid-mcp-analysis/managed-python-snapshots-d83d18c4-2637-4380-9dae-616af17d9559/evidence.json`. The installed-package gate also searches a synthetic saved comment and verifies field exclusion and reconnect equality.

An actual Codex session used a fresh package installation and generated ephemeral settings to find `.SUB.04` at 30 fps, then carried the returned mob and bin identities into a `[0,30)` timeline query. Its three returned source ranges matched a direct MCP oracle and it described them as saved snapshot state. Only the two read tools were exposed; the source bin, snapshot, selected package files, managed runtime tree and existing user configuration remained unchanged. Final evidence: `.avid-mcp-analysis/codex-saved-search-59753ec0-890a-4723-abb4-07f9b9672f7c/evidence.json`. This qualifies the existing authenticated Windows Codex client, not every LLM, persistent GUI onboarding or native edits.
