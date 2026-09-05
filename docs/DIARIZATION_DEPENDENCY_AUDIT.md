# Diarization Python dependency audit

Checked 2026-09-05 against the actual Windows Python 3.12 installations. The audit reads installed distribution metadata and license-file hashes, then requests each exact release from the [PyPI JSON API](https://docs.pypi.org/api/json/). This is the documented release-specific vulnerability feed. It does not execute pip, install an audit package into the target runtime, transmit media or modify the target tree.

## Finding and repair

The original environment inherited pip 23.2.1 from Python's bundled `ensurepip`. [PyPI's exact-release record](https://pypi.org/pypi/pip/23.2.1/json) returned 14 active advisory entries representing seven distinct CVEs: CVE-2023-5752, CVE-2025-8869, CVE-2026-13346, CVE-2026-1703, CVE-2026-3219, CVE-2026-6357 and CVE-2026-8643. Aliases account for duplicate entries. This finding concerns the installed package version; exploitability of individual advisories in the constrained setup path was not established.

Fresh diarization setup now creates the virtual environment with `--without-pip`, downloads a fixed pip 26.2.1 wheel, verifies its exact size and SHA-256, and bootstraps from that wheel using Python's module runner. The old bundled pip is never installed or executed. The bootstrap installs only the verified local wheel with no index/dependency resolution, checks the resulting pip version, then proceeds with the pinned binary-only model-runtime dependencies. No system Python or existing runtime is upgraded in place.

Pinned wheel: `pip-26.2.1-py3-none-any.whl`, 1,816,632 bytes, SHA-256 `71138adf1f4ca900cdb7d289c21b7494329f2332b6d85f0e1c42108c0384ed3e`. Its URL and digest were checked against [PyPI release metadata](https://pypi.org/pypi/pip/26.2.1/json). The completed receipt records `pipVersion`. Read-only status reports `bootstrapCurrent` separately from tree consistency. Legacy receipts remain readable and their files remain unchanged; explicit setup refuses silently reusing a legacy bootstrap and instructs the caller to choose a fresh model directory. Cached inference does not invoke pip.

## Exact installed distribution results

| Distribution | Version after fresh setup | Listed active advisories | License inventory |
| --- | --- | --- | --- |
| pip | 26.2.1 | 0 | 44 license/notice paths, including vendored dependencies |
| NumPy | 2.2.6 | 0 | Four license paths; binary-distribution text includes bundled-library terms |
| sherpa_onnx | 1.13.7 | 0 | Apache license file retained |
| sherpa-onnx-core | 1.13.7 | 0 | Metadata declares Apache-2.0; no license/notice file found in the installed distribution's file inventory |

Zero listed advisories is a point-in-time Python-package feed result, not proof of no vulnerabilities. Bundled native libraries may not appear as separate Python distributions. Their versions, advisories and notices need separate inspection before release. The core wheel's missing notice file also remains a redistribution review item; the [upstream repository](https://github.com/k2-fsa/sherpa-onnx) declares Apache-2.0, but that alone does not enumerate every binary component. This package still does not bundle optional runtime wheels or model weights. Exact converted-model notices and broader runtime lifecycle work remain open.

## Evidence and reproduction

- Original runtime inventory/advisories: `.avid-mcp-analysis/diarization-audit-bcb0d59b-7da9-42fa-8fcb-09a50591bcaa/evidence.json`.
- Fresh installation: `.avid-mcp-analysis/diarization-audited-install.log`.
- Fresh runtime inventory/advisories: `.avid-mcp-analysis/diarization-audit-6d0f7b0d-00c1-4754-822b-7f5a50a42bb2/evidence.json`.

Each audit retains exact PyPI responses, installed metadata/license-file hashes and an unchanged-tree check. Reproduce after building with `node scripts/research/audit-diarization-runtime.mjs <MODEL_CACHE>`. Network access goes to PyPI with public package names/versions only. New cache installation and known-model inference qualification are separate from this feed lookup.

Full local checks passed with 268 TypeScript tests, 12 Python tests, 119 tools, both transports and fresh-tarball installation/audit. Tests cover failed/oversized/hash-invalid wheel downloads before file publication, pinned setup command ordering, current-bootstrap reuse, and preserved legacy runtime refusal. This audit does not close native-component security, redistribution, cross-platform bootstrap or clean-machine qualification.


Actual inference regression on the new cache also passed: synthetic alternating voices grouped A/B/A/B in automatic and supplied-two modes, both modes processed the full Sonoma preview, reuse did not require a base Python command, deliberate tree modification was refused, and source/runtime hashes were unchanged after restoring only the test's own extra file. Evidence: `.avid-mcp-analysis/diarization-runtime-607758fe-35dd-4508-ab4e-09fbb37d203a/evidence.json`. `qualify-diarization-runtime.mjs` now accepts an optional model-cache argument so new isolated installations can be qualified without changing older caches.
