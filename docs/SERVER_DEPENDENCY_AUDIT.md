# Installed server dependency evidence

On 2026-09-05, `node scripts/research/audit-server-dependencies.mjs` inspected all 98 non-development packages in the current lockfile and installed tree. Every installed version matched its lock entry. The report records manifest hashes, archive integrity declarations and hashes of top-level license/notice files, and confirms that the lockfile remained unchanged.

Evidence directory: `.avid-mcp-analysis/server-dependency-audit-4d975931-030f-4c6d-8e17-2b6f63f4aa84/`. `evidence.json` contains the inventory; `npm-audit.json` contains the live npm advisory result; `default-branch-alerts.jsonl` contains the five open GitHub alert summaries.

The declarations comprise 86 MIT, seven ISC, three BSD-3-Clause, one BSD-2-Clause and one Apache-2.0 package. No declaration is missing. `@posthog/core` has no top-level license/notice file matching the inventory's naming convention; its metadata declaration alone does not close the notice review. This inventory does not determine legal compatibility or redistribute third-party notices.

The live npm audit returned zero vulnerabilities across the branch dependency graph, including development dependencies. GitHub's five open default-branch alerts concern `fast-uri` (four) and `qs` (one). The branch lock selects `fast-uri` 3.1.7 and `qs` 6.16.0, outside those reported vulnerable ranges. This does not close the default-branch alerts or establish that future clean installations resolve identically.

Optional downloaded AI runtimes and weights, Python packages, FFmpeg builds, other platform binaries, archive-content authentication and final distribution notices remain separate release checks. An advisory feed reporting zero findings is not a complete security review. Re-run the inventory after dependency changes and retain a fresh npm audit alongside it.

## PostHog component notice follow-up

`node scripts/research/audit-posthog-notices.mjs` retains notice/source evidence from upstream commit `6872a1c5e4df0917dc0a72cca4a597d9b4d72803`, resolved from tag `@posthog/core@1.48.1`. The upstream core manifest matches the installed version and MIT declaration. The installed `src/vendor/uuidv7.ts` exactly matches that revision by SHA-256 and carries Apache-2.0 and LiosK copyright annotations. The [pinned upstream root license](https://github.com/PostHog/posthog-js/blob/6872a1c5e4df0917dc0a72cca4a597d9b4d72803/LICENSE) contains multiple license texts. Locally, `posthog-node` also declares MIT while its included LICENSE begins with Apache-2.0 text.

Evidence: `.avid-mcp-analysis/posthog-notices-2a2fa97f-f09a-4edc-a777-cb7c491a81d5/evidence.json`, with exact downloaded files and hashes beside it. This identifies the missing top-level notice's upstream context and proves one vendored source match. It does not establish a single license for all package contents or close final attribution review. Preserve component notices when preparing distributions; do not replace them with the package-level declaration. No installed files were modified and no new third-party implementation was incorporated.
