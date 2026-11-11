# Avid project audit with AI: inventory, locks, bins, and opaque evidence

- **Primary keyword:** Avid project audit AI
- **Secondary keywords:** Avid bin inventory MCP, Avid .lck file audit, analyze AVB with AI, Avid project migration checklist
- **Audience:** assistant editors, post supervisors, archive/migration leads
- **Tools referenced:** `avid_discover_projects`, `avid_inventory_project_files`, `avid_analyze_project`, `avid_analyze_bin`, `avid_analyze_configuration`, `avid_analyze_clip`, `avid_get_capabilities`
- **Prompt resource:** `avid-project-audit`
- **Status:** draft for HOLD-MERGE review — not published

## Answer-first summary

An Avid project audit with the Avid Media Composer MCP server means walking authorized project roots as files: discover `.avp` projects, classify the tree, report active or orphaned `.lck` bin locks, analyze AVB object graphs, fingerprint configuration evidence, and separate parsed facts from opaque or truncated data. Media Composer does not need to be running. The audit is read-only for offline analysis.

## When this workflow earns its keep

- Before conform or online
- Before show migration between storage volumes
- Before archive or LTO handoff
- After a crash when bins look “mysteriously locked”
- When a producer asks “what is actually in this project?” at 6 p.m.

## Recipe: facility audit in six tool calls

### 1. Confirm authority

Call `avid_get_capabilities`. Confirm `inspect` is enabled, roots are the ones you intend, and dependency gaps (Python, ffprobe) are known before you interpret empty sections as “empty bins.”

### 2. Discover projects

```
avid_discover_projects
```

Use this when a shared volume has many show folders and you need directories that actually contain `.avp` files.

### 3. Inventory the tree

```
avid_inventory_project_files
```

Ask the assistant to:

- Classify project, bin, setting, lock, interchange, sidecar, document, and media files
- Optionally hash critical editorial files
- Call out active vs orphaned `.lck` locks beside bins

A `.lck` next to `Cut_v04.avb` is collaboration state, not a media problem. Orphaned locks are a different risk class from a live editor holding the bin.

### 4. Aggregate the project report

```
avid_analyze_project
```

A useful prompt pattern (aligned with the packaged `avid-project-audit` prompt):

> Analyze this project. Include hashes, configurations, bins, and AAF. Do not analyze media payloads yet. Separate parsed evidence, opaque files, lock risks, and unavailable dependencies.

Respect server bounds (`AVID_MCP_MAX_FILES`, `AVID_MCP_MAX_BINS`, `AVID_MCP_MAX_MEDIA_FILES`, timeouts). Truncation is reported; do not treat a truncated pass as complete coverage.

### 5. Deep-dive critical bins

```
avid_analyze_bin
```

For each high-value bin, request mobs, tracks, clips, sequences, views, and metadata — and insist that undecodable structures stay labelled opaque.

### 6. Configuration and sample media metadata

- `avid_analyze_configuration` for AVP/AVS/config decode or fingerprinting
- `avid_analyze_clip` when you need ffprobe editorial summary for selected media (optional frame counting / hashing)

## What “good” audit output looks like

A trustworthy assistant response should include:

1. **Scope** — roots analyzed and limits hit
2. **Locks** — active vs orphaned, bin names, not guesses about who “should” unlock
3. **Bins** — counts, notable sequences, opaque sections
4. **Interchange present** — AAF/ALE/EDL/OTIO files found (deep validation is a follow-on article)
5. **Gaps** — missing Python/ffprobe, permission denials, truncated scans
6. **Non-claims** — no invented clip counts when evidence was opaque

## Safety notes for shared storage

- Keep capabilities at `inspect` for audit-only sessions.
- Never point allowed roots at an entire company NAS “just in case.”
- Treat lock reports as operational signals; unlocking is a human/facility procedure, not an MCP offline write.

## Development-branch add-ons (label clearly)

In `1.2.0-rc.1` checkouts (not npm `latest` yet), saved-project snapshot tools can add marker inspection, timeline range / source-usage queries, snapshot diffs, and locator availability checks against saved AVB bytes. Those are saved-file facts and exclude unsaved editor state. Do not advertise them as part of `@latest` until published.

## FAQ draft

**Can I audit an Avid project without opening Media Composer?**  
Yes for file-based inventory, lock detection, bin/config analysis, and interchange discovery via MCP tools over allowed roots.

**Will the audit unlock bins?**  
No. Offline analysis reports `.lck` state; it does not clear locks.

**What if pyavb cannot decode part of a bin?**  
The server should surface opaque evidence rather than invent structure.
