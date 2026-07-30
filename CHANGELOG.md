# Changelog

## 1.0.0-rc.1 - 2026-07-30

- Separated public, unauthorized, and authenticated HTTP rate limits so unauthenticated traffic
  cannot exhaust authenticated MCP capacity.
- Added runtime schemas for bridge capabilities, live state, edit results, partial application,
  undo groups, and state revisions while preserving protocol v2.
- Added a clean-tarball installation smoke test across the supported CI matrix.
- Added dedicated landing CI and Dependabot coverage, resolved its development dependency advisory,
  and added CSP and browser hardening headers for the static Vercel deployment.
- Added distribution-tag-aware npm publishing and a decision-complete release checklist.
- Kept live Media Composer editing provider-gated until a sanctioned `.avpi` Extension is built and
  validated against disposable projects.

## 0.2.0 - 2026-07-25

- Added executable compatibility rules for Media Composer 2025.12.x, 2025.6, and 2024.12.x.
- Added Windows and macOS installation discovery and host-configuration diagnostics.
- Upgraded the bridge contract to protocol v2 with fail-closed version, OS, and architecture checks.
- Expanded CI to Windows and macOS on Node.js 20 and 24.
- Added an authenticated Streamable HTTP transport, container image, and Fly.io deployment.
- Added guarded local and GitHub Actions npm publication paths with provenance.
- Added comprehensive HTTP routing, server-handler, media-probe, process, bridge failure-path,
  configuration, capability, installation-discovery, and deployment-policy unit tests.
- Enforced minimum coverage thresholds to prevent validation regressions.

## 0.1.0 - 2026-07-25

- Initial TypeScript stdio MCP server with 16 tools, one resource, and two prompts.
- Added allowed-root, capability, audit, edit-plan token, and bridge checks.
- Added project inventory, lock detection, configuration evidence, ALE, EDL, and ffprobe analysis.
- Added bounded read-only AVB and AAF Python inspectors.
- Added 167-action Media Composer editing catalog.
- Added versioned Media Composer Extension mailbox protocol.
- Added TypeScript, Python, simulated bridge, and MCP protocol tests.
- Documented Tavily research, architecture, capability limits, SDK gate, and roadmap.
