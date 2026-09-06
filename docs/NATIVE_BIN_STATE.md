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

The adapter keeps direct target verification. A future project-wide open-bin tool must qualify the omitted-path form and enforce authorized project scope around enumeration; it must not expose arbitrary current-session paths just because the native request omitted a project path.

`scripts/research/qualify-open-bin-inventory.mjs` compared the omitted-path `AllTypes` + `OnlyOpen` inventory with sequential direct `GetBinInfo` observations for every bin enumerated in the authorized disposable project. All 16 bins were open; both methods returned the same set, and repeated endpoint enumeration stayed unchanged. Evidence: `.avid-mcp-analysis/open-bin-inventory-c1a6fa36-38b1-47cd-b274-57333624c224/evidence.json`. There were no missing or extra entries. Because this state contained no closed bins, exclusion of closed bins remains unproven by this comparison. The harness checks each returned path stays in the selected project and performs no bin mutations.
