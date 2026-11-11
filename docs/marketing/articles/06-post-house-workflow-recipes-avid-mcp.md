# Post-house workflow recipes for Avid Media Composer MCP

- **Primary keyword:** Avid MCP post house workflow
- **Secondary keywords:** Avid assistant editor automation, Media Composer Extension bridge MCP, avid-selects skill, guarded edit plan Avid
- **Audience:** post supervisors, AE leads, facility engineers
- **Tools / skills referenced:** published inspect tools; `avid_preview_edit_plan`, `avid_apply_edit_plan`, `avid_get_live_state`, `avid_get_edit_operation_catalog`, `avid_get_extension_capability_manifest`, `avid_ctms_read`; skills `avid-ingest-qc`, `avid-selects`, `avid-review-markers`, `avid-turnover`, `avid-export`
- **Status:** draft for HOLD-MERGE review — not published

## Answer-first summary

Post houses can adopt Avid Media Composer MCP in layers: (1) read-only project and interchange intelligence on any MCP client, (2) local media-intelligence jobs on the development branch, (3) guarded live operations only where a compatible Extension bridge or qualified native adapter exists. Packaged workflow skills teach assistants the implemented tools and their evidence limits — they do not expand filesystem roots or silently enable edit.

## Layered rollout (recommended)

### Layer 0 — Policy

- Allowed roots = show folders, not the entire SAN
- Default capability = `inspect`
- Edit / export / project-write enabled only on named seats
- Bridge secrets stored like other production credentials

### Layer 1 — AE daily drivers (published `1.1.0`)

| Recipe | Tools |
| --- | --- |
| Morning project health | `avid_discover_projects`, `avid_inventory_project_files`, lock review |
| Bin deep dive | `avid_analyze_bin` |
| Turnover package check | `avid_analyze_aaf`, `avid_analyze_ale`, `avid_analyze_edl`, `avid_analyze_otio`, `avid_preview_otio_handoff` |
| Workstation screen | `avid_check_compatibility`, `avid_detect_installations`, `avid_diagnose_integrations` |

### Layer 2 — Media intelligence seats (`1.2.0-rc.1` checkout)

Install from source per `docs/LOCAL_SETUP.md`. Train on:

- Ingest QC + contact sheets
- Bounded transcription / diarization with mandatory review
- Visual search for selects prep
- Saved-bin snapshot diffs for turnover notes

### Layer 3 — Guarded live operations

Before enabling `edit`:

1. `avid_get_extension_capability_manifest` — what is implemented vs host-proven
2. `avid_get_edit_operation_catalog` — browse planned actions (catalog ≠ host proof)
3. `avid_get_bridge_status` / `avid_get_live_state` — bridge healthy?
4. `avid_preview_edit_plan` — risk labels + confirmation token
5. Human confirms exact plan
6. `avid_apply_edit_plan` — applies only the tokenized plan

Packaged prompt: `avid-safe-edit`.

If the bridge is absent, apply fails closed. That is a feature for facilities.

### Native adapter note (Windows, build-specific)

Development docs describe a guarded native adapter on a qualified Media Composer 2024.12 Windows build with bounded operations (comments, AAF selects import, bin columns, markers, duplication, rename, volumes, viewer inspection, etc.). Treat it as separate from the Extension catalog. Mac native qualification is deferred. Never imply “works on every Media Composer seat.”

## Workflow skills (copy into the client skill directory)

From `skills/` (MIT, original to this project):

| Skill | Example ask |
| --- | --- |
| `avid-ingest-qc` | Inventory these rushes, create contact sheets, and QC the first two minutes. |
| `avid-selects` | Find landscape shots and save a collection with reviewed source ranges. |
| `avid-review-markers` | Add timestamped review markers, or update requested whole-clip Comments with exact-value checks. |
| `avid-turnover` | Compare these saved-bin snapshots and report changed source usage. |
| `avid-export` | Export this source range and the reviewed transcript as SRT. |

Skills guide tool use; they do not download models or widen `AVID_MCP_ALLOWED_ROOTS`.

## MediaCentral CTMS (optional enterprise read)

`avid_ctms_read` can discover or follow one allowlisted, read-only MediaCentral CTMS HAL relation when explicitly configured. It is not a general write API into MediaCentral.

## Sibling product for Premiere rooms

Facilities with Premiere bays can evaluate [Premiere Pro MCP](https://github.com/leancoderkavy/premiere-pro-mcp) alongside this server. Keep configs separate so allowed roots and credentials never cross shows.

## Sample week for one AE seat

| Day | Focus |
| --- | --- |
| Mon | Install inspect-only; run capabilities + one project inventory |
| Tue | AAF/ALE/EDL validation on a real turnover package |
| Wed | (RC seat) index a rush folder; contact sheet + short QC window |
| Thu | (RC seat) visual search selects dry-run; human reviews rankings |
| Fri | Bridge demo on a non-air project **or** document why bridge is deferred |

## Messaging for producers (approved facts only)

Safe:

- Independent open-source MCP server for Avid project analysis and guarded automation
- Offline analysis does not modify bins or source media
- Live edits require explicit bridge/native qualification
- Built by Kavy Rattana; sibling Premiere Pro MCP exists

Unsafe / do not say:

- “Official Avid AI”
- “Fully drives any timeline today”
- Unverified time-saved percentages or studio logos

## FAQ draft

**How should a post house start?**  
Inspect-only on one show root, with Python/ffprobe verified, before any edit capability.

**Do workflow skills replace SOPs?**  
No. They encode tool evidence limits for AI clients; facility SOPs still govern unlocks, conform, and delivery.

**Can we read MediaCentral?**  
Only via explicitly allowlisted CTMS reads when configured; not a blanket CMS integration claim.
