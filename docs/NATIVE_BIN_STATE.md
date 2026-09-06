# Native bin open-state verification

Open/close receipts use the target bin's `GetBinInfo.is_open` for `binStateVerified`. A completed request and successful read are separate from observing the requested state. This does not establish saved-file fidelity or atomic undo.

Read-only experiments on Windows Media Composer 2024.12.58720 found that `GetBins` behavior depends on the optional project path and flag combination:

| Request | Observed result |
| --- | --- |
| Explicit current project directory, `OnlyOpen` | Empty |
| Explicit directory, `AllTypes` plus `OnlyOpen` | Empty |
| Explicit directory, `BinType` plus `OnlyOpen` | Empty |
| Omitted project path, `OnlyOpen` | Empty |
| Omitted project path, `AllTypes` plus `OnlyOpen` | Nonempty list including the target bin |
| Omitted project path, `AllTypes` | Larger nonempty list |

During the explicit-path probes, direct `GetBinInfo` reported the target open. Evidence is retained in `.avid-mcp-analysis/open-bin-flag-investigation.json` and `open-bin-implicit-project.json`. These observations refine the earlier empty-list finding: they do not establish that open-bin enumeration is universally broken. No bins were opened or closed by these probes, and the complete returned list was not independently verified against every bin.

The adapter keeps direct target verification for mutations. The `avid_native_read` query `open_bins` uses the qualified omitted-path form, caps the inventory at 4096 entries, resolves each absolute path within the authorized current project, rejects duplicates and rechecks the project after enumeration. It returns only canonical paths and an explicit non-atomic scope statement. Empty inventories are allowed; malformed or out-of-project entries fail the query. The `bins` query retains its existing all-entry contract.

`scripts/research/qualify-open-bin-inventory.mjs` compared the omitted-path `AllTypes` + `OnlyOpen` inventory with sequential direct `GetBinInfo` observations for every bin enumerated in the authorized disposable project. All 16 bins were open; both methods returned the same set, and repeated endpoint enumeration stayed unchanged. Evidence: `.avid-mcp-analysis/open-bin-inventory-c1a6fa36-38b1-47cd-b274-57333624c224/evidence.json`. There were no missing or extra entries. Because this state contained no closed bins, exclusion of closed bins remains unproven by this comparison. The harness checks each returned path stays in the selected project and performs no bin mutations.

A subsequent controlled exclusion test closed the disposable Sonoma selects bin, queried the omitted-path `AllTypes` + `OnlyOpen` inventory, and directly checked the target remained closed. The target was absent from the inventory. The harness then reopened it and verified `is_open=true` before evaluating the exclusion assertions. Evidence: `.avid-mcp-analysis/closed-bin-exclusion-4e28f37d-43ef-4635-b8cd-7176f1883b8c/evidence.json`; repeatable harness: `scripts/research/qualify-closed-bin-exclusion.mjs`. This qualifies one closed-bin exclusion on this host, complementing the all-open comparison; concurrent project changes, other host versions and atomic inventory consistency remain unqualified.

Actual inspect-only MCP qualification returned 16 project-scoped open entries, including the reopened Sonoma selects bin: `.avid-mcp-analysis/native-open-bins-a62e42f4-d485-4de0-bf65-f5d30a7958d9/evidence.json`. The dedicated harness saves the response before assertions. The preceding broader native-refresh failure was initially attributed to source-master tracks from a compressed stack location. Retained response-by-response evidence later corrected that diagnosis: both track queries succeeded and the viewer query rejected an empty native inventory. That attempt did not complete saved-timeline validation.
