# Workflow skills

The npm package and repository include five original MIT-licensed skills in `skills/`: `avid-ingest-qc`, `avid-selects`, `avid-review-markers`, `avid-turnover`, and `avid-export`. They guide an AI through the implemented MCP tools and their evidence limits. They contain no Jumper code or proprietary SDK content.

Install/configure the MCP server first using [local setup](LOCAL_SETUP.md). Copy the selected skill directories into the skill directory supported by your AI client; for Codex this is `$CODEX_HOME/skills` (normally `~/.codex/skills`). Preserve existing skills with the same names and review differences before replacing them. Reload skill discovery as required by the client. An explicit Codex prompt example is `$avid-selects Find exterior shots in these files and prepare a selects collection`.

For a client without skill discovery, attach the relevant `SKILL.md` as task instructions alongside its MCP connection. The instructions depend on tool discovery, not a particular LLM provider. They do not install dependencies, enable capabilities, download models or expand access to filesystem roots.

Useful task examples:

| Skill | Request |
| --- | --- |
| avid-ingest-qc | Inventory these rushes, create contact sheets, and QC the first two minutes. |
| avid-selects | Find landscape shots and save a collection with reviewed source ranges. |
| avid-selects | Find shots like this reference frame, refine toward vineyards, and lower the rank of shots resembling people; review the results before saving selects. |
| avid-review-markers | Add timestamped review markers, or update requested whole-clip Comments with exact-value checks and separate saved evidence. |
| avid-turnover | Compare these saved-bin snapshots and report changed source usage. |
| avid-export | Export this source range and the reviewed transcript as SRT. |

Package smoke validation checks that all five skill files reach a fresh installation and that every named MCP tool exists in its live discovery response. This validates packaging and tool references; qualification inside named AI client applications remains separate.

The selects skill now covers native reference-AAF export, source/slot-checked building, native import, save/reopen, saved-range inspection and optional render. Selects/export instructions also distinguish explicit analysis resume tools from automatic job replay. The initial chained host test found a stereo-routing regression; explicit stereo authoring subsequently passed for the prepared-PCM fixture. Follow [workflow qualification](AAF_WORKFLOW_QUALIFICATION.md) and report technical/structural success separately from fidelity.

The selects skill also describes the observed one-frame UI trim workflow with baseline/candidate snapshots and avid_verify_saved_trim. It requires a separately available computer-use executor, exact record-sequence/track context, and verified saved-state transitions. Same-session undo/redo evidence and the loss of history after bin closure are explicit. This is workflow guidance around the existing verifier, not a standalone UI execution adapter or named-client acceptance result.

The selects skill covers combined image/frame and text scoring, unwanted-concept penalties, source-content mismatch recovery, and verified versus legacy thumbnail indicators. Its recovery guidance preserves checksum evidence and avoids treating ranking controls as guaranteed content filters. Both observed one-frame trim directions are documented. These are instructions for the implemented tools; fresh-package validation does not prove a named AI client has applied the instructions successfully.
