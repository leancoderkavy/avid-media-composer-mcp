# Changelog

## 1.1.0-rc.1 - 2026-08-15

- Added product-scoped Avid compatibility provenance, weekly documentation-drift detection, and a
  validated 167-action Extensions SDK capability manifest.
- Added local marker/SVG validation, privacy-safe transcript revision QC, and metadata-only DNx 4.0
  turnover analysis.
- Added conservative OTIO handoff manifests, a scoped read-only MediaCentral CTMS client, and
  AMA/AMT/AVX/AAX/NEXIS/Distributed Processing diagnostics.
- Added a bounded typed live-state contract for the future read-only Media Composer Extension.

## 1.0.0 - 2026-08-15

- Promoted the verified RC.3 read-only analysis and guarded-automation foundation to stable 1.0.
- Kept live Media Composer editing fail-closed until a sanctioned Avid Extension is installed and
  validated against a real supported host.

## 1.0.0-rc.3 - 2026-08-15

- Added bounded, read-only OTIO analysis with explicit interchange-fidelity warnings.
- Hardened the local Extension mailbox as authenticated protocol v3 with signed envelopes,
  replay/expiry bindings, atomic publication, link rejection, and host-state preconditions.
- Refreshed Media Composer 2025.12 compatibility and Extensions terminology from current Avid
  documentation while retaining explicit SDK and real-host validation gates.
- Added a reproducible real-host validation protocol for future Extension operations.

## 1.0.0-rc.2 - 2026-08-13

- Derived MCP handshake, ping, readiness-log, and telemetry versions from package metadata so
  installed releases report their actual published version.

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
