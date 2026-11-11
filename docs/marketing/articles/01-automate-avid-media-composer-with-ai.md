# Automate Avid Media Composer with AI (without guessing at your bins)

- **Primary keyword:** automate Avid Media Composer with AI
- **Secondary keywords:** Avid Media Composer MCP, AI assistant Media Composer, MCP server for Avid, AI project analysis Avid
- **Audience:** professional editors, assistant editors, post supervisors
- **Tools referenced (published `1.1.0` unless noted):** `avid_ping`, `avid_get_capabilities`, `avid_discover_projects`, `avid_inventory_project_files`, `avid_analyze_project`, `avid_analyze_bin`, `avid_analyze_aaf`, `avid_analyze_ale`, `avid_analyze_edl`, `avid_analyze_clip`, `avid_check_compatibility`, `avid_preview_edit_plan`, `avid_apply_edit_plan`
- **Status:** draft for HOLD-MERGE review — not published

## Answer-first summary

You can automate parts of an Avid Media Composer workflow with an AI assistant today by connecting a Model Context Protocol (MCP) server to local project evidence: bins, interchange files, configuration fingerprints, locks, and media metadata. The open-source Avid Media Composer MCP server exposes those reads as structured tools. Offline analysis does not rewrite `.avb` bins or source media. Live timeline mutation is a separate, fail-closed path that needs a compatible Extension bridge (or a separately qualified native adapter on a documented Windows build in the development branch).

## Why “AI for Avid” usually stalls

Media Composer is not After Effects. There is no public general-purpose scripting API that lets an assistant casually drive the timeline. Avid’s own AI features (for example PhraseFind AI and ScriptSync AI) run inside the application. Outside the app, post teams still spend hours on inventory, lock audits, AAF/ALE/EDL checks, and workstation compatibility questions — work that is mostly file evidence on disk.

That file evidence is exactly what an MCP server can expose to Claude, Cursor, VS Code, Codex, LM Studio, or any other standards-compatible MCP client.

## What Avid Media Composer MCP actually automates

Founder Kavy Rattana built this server as an independent, MIT-licensed connector — a sibling to [Premiere Pro MCP](https://github.com/leancoderkavy/premiere-pro-mcp) for editors who work across NLEs.

### 1. Discover and inventory without opening the NLE

| Job | Tool |
| --- | --- |
| Find project folders that contain `.avp` files | `avid_discover_projects` |
| Classify project-tree files and optional hashes; surface active or orphaned `.lck` locks | `avid_inventory_project_files` |
| Aggregate project, configuration, bin, interchange, and media reporting | `avid_analyze_project` |

Ask an assistant: “Inventory Episode 101, include hashes for bins and AAF, and separate lock risks from opaque files.”

### 2. Read bins and interchange formats as structured evidence

| Format | Tool |
| --- | --- |
| AVB bins via `pyavb` | `avid_analyze_bin` |
| AAF via `pyaaf2` | `avid_analyze_aaf` |
| ALE rows and columns | `avid_analyze_ale` |
| CMX-style EDL events | `avid_analyze_edl` |
| Clip containers via `ffprobe` | `avid_analyze_clip` |

Opaque or truncated structures are reported as such. The server does not invent missing metadata.

### 3. Screen the workstation before you blame the cut

`avid_check_compatibility` evaluates a Media Composer / OS / architecture combination against the server’s release matrix snapshot. A match is a screening result, not a full Avid workstation certification.

### 4. Guarded live edits (separate from offline analysis)

- `avid_preview_edit_plan` validates, risk-labels, and tokenizes a plan.
- `avid_apply_edit_plan` applies only an exact confirmed plan through a compatible Extension bridge.
- Without a bridge that advertises the operation, apply fails closed (`BRIDGE_NOT_CONNECTED` / unsupported), rather than silently scripting the UI.

Always start with `avid_get_capabilities` so the assistant sees authority, dependency health, coverage, and bridge status before it proposes work.

## What this is not

- Not an official Avid product and not endorsed by Avid Technology, Inc.
- Not a promise that every cataloged edit action already runs on your host. The 167-action catalog is a planned contract; host evidence is separate.
- Not automatic rewriting of bins on disk during offline analysis.
- Not a substitute for editorial judgment on conform, color, or delivery QC.

## A minimal automation loop you can run this week

1. Set `AVID_MCP_ALLOWED_ROOTS` to the project tree you authorize.
2. Set `AVID_MCP_CAPABILITIES=inspect`.
3. Launch with `npx -y avid-media-composer-mcp@latest` (published `1.1.0` today) or build from source for development features.
4. In your MCP client, run `avid_ping` then `avid_get_capabilities`.
5. Run `avid_analyze_project` on one show folder with media-payload analysis deferred.
6. Drill into locked or high-risk bins with `avid_analyze_bin` and interchange files with the matching analyzer.

## When to enable the development branch

Repository `1.2.0-rc.1` adds local media intelligence (indexing, QC, transcripts, visual search, saved-bin snapshots, and more). Those tools are real in this checkout but are **not** what `npx …@latest` installs until the RC ships. Label any RC-only workflow clearly when you publish or train a facility.

## Related reading in this pack

- Setup with Claude and Cursor
- Pre-conform AAF / ALE / EDL validation
- Post-house workflow recipes

## FAQ draft

**Can AI automate Avid Media Composer?**  
It can automate inspection and interchange validation today via MCP tools over local project files. Live timeline changes still need a compatible Extension bridge (or a separately qualified native path on the documented Windows build in development).

**Does the MCP modify my Avid project offline?**  
No. Offline analysis is read-only for project files and source media.

**Is this the same as Avid’s built-in AI?**  
No. Built-in AI runs inside Media Composer. This MCP connects external assistants to project evidence through the Model Context Protocol.
