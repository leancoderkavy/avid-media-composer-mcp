# September 6 follow-up integration

PR #63 incorporates the watch manifest publication guard, fresh installed native marker qualification, and prevention of lossy single-marker text writes. Dependency PRs #56–62 are included: pinned Zod 4.5.4, development lock updates, research protobuf 7.36.1, PostHog 5.51.6, Lucide 1.40.0, Next 16.3.4 and Motion 13.2.0. The landing manifest conflict preserves all three new versions.

Combined local validation passed 703 TypeScript tests, 46 Python tests, both transports, and fresh tarball installation with 140 exact matching tool definitions, five skills and Python/AAF checks. Landing lint and production build passed. Both npm audits reported zero vulnerabilities. Nine research protobuf boundary tests passed with the new research requirement installed.

Evidence is under `.avid-mcp-analysis/merge-sept6-*`. Native unsupported-text refusal evidence and the restored fixture are documented in `NATIVE_MARKER_UPDATE.md`; the installed native workflow is documented in `INSTALLED_NATIVE_MARKERS.md`. These are scoped host checks, not full native feature or clean-machine acceptance. No npm release is part of this integration.
