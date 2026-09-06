# Installed local model runtime audit

The local inference runtime is a separately installed application. The core MCP dependency audit does not cover it. This Windows x64 audit inventories the existing receipt-verified runtime without importing its modules or changing its files.

Run after building:

```powershell
node scripts/research/audit-model-runtime.mjs .avid-mcp-analysis/models
node scripts/research/audit-model-runtime-upstream.mjs PATH_TO_INVENTORY_JSON
```

The first command checks the complete runtime tree before and after inventory, compares installed package versions with the runtime lock, hashes manifests, standalone notices, README files and native/WASM files, and records absent optional packages separately. Reads and traversal are bounded. The second correlates the currently researched ONNX versions with registry integrity declarations and immutable upstream notice URLs; it refuses a different installed version instead of reusing an old mapping.

## Observed installation

The retained [inventory](model-runtime-inventory.json) contains 49 installed packages, 27 absent optional package locations, and 23 native/WASM files. Every installed package declares a license. Five package locations have no separately named license/notice file: `guid-typescript`, `onnxruntime-node`, `onnxruntime-web`, and two `onnxruntime-common` versions. This filename-based observation does not mean those projects have no license; README/source notices require separate review.

| Native package | Installed version | Declared license | Files inventoried |
| --- | --- | --- | --- |
| @img/sharp-win32-x64 | 0.35.4 | Apache-2.0 AND LGPL-3.0-or-later | 3 |
| onnxruntime-node | 1.24.3 | MIT | 16 |
| onnxruntime-web | 1.26.0-dev.20260416-b7804b056c | MIT | 4 |

The ONNX Node package contains binaries for several platforms, including DirectML and DirectX compiler DLLs. Their presence is not evidence that they were loaded or exercised. Sharp's bundled README lists additional component licenses, including LGPL-covered libraries; its top-level Apache text is not the entire native component notice chain. The inventory retains that README's hash alongside the native binary hashes.

## Upstream reconciliation

[Retained source mappings](model-runtime-upstream-notices.json) identify ONNX Node's release tag at commit `3a728b75062256951b6e19ce718907cf1a1d4cf0` and ONNX Web's version suffix at commit `b7804b056c30aa35c1748f8e4e239d0e2ff25d6d`. Registry integrity strings matched the installed lock. Neither registry version returned `gitHead`; this does not establish reproducible binary provenance.

Both inspected commits supply identical [Microsoft MIT license text](https://raw.githubusercontent.com/microsoft/onnxruntime/3a728b75062256951b6e19ce718907cf1a1d4cf0/LICENSE) and [third-party notices](https://raw.githubusercontent.com/microsoft/onnxruntime/3a728b75062256951b6e19ce718907cf1a1d4cf0/ThirdPartyNotices.txt). Exact bytes and hashes were retained in the local evidence directory. Those aggregate notices must be reconciled against actual binary components; they are not a statement that every component listed is linked into every binary. The registry-linked `guid-typescript` source repository/commit returned HTTP 404 during this investigation, leaving its original notice source unresolved.

Live npm audits reported zero known advisories for both the core checkout and this optional runtime. This is registry advisory evidence, not native binary vulnerability coverage or license clearance. GitHub's five default-branch alerts concern older `fast-uri` and `qs` ranges, not the versions audited on the feature branch; no alerts were dismissed.

## Evidence and remaining work

- Installed inventory: `.avid-mcp-analysis/model-runtime-audit-1a2bb74f-e93d-47fc-ad54-e9f346f65779/evidence.json`.
- Registry/source notices: `.avid-mcp-analysis/model-runtime-upstream-cdd81c6c-14f7-4027-800f-bd1bd11b5cdb/evidence.json`.
- The original installation tree matched its receipt before and after the inventory. Both research scripts passed syntax checks and actual execution.

Remaining work includes binary-to-component mapping, runtime notice delivery during installation, Sharp/libvips component/source reconciliation, the unavailable Guid notice source, other platforms, and final distribution review. Model weights, diarization/face Python runtimes and FFmpeg retain separate audit scopes. No runtime was reinstalled, imported, updated or relicensed by this work.
