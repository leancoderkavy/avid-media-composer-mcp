# Security audit

Audit date: 2026-07-26

Scope: TypeScript MCP server, local stdio and Streamable HTTP transports, filesystem policy, Python AVB/AAF sidecar, `ffprobe` execution, file-mailbox Extension bridge, edit-plan confirmation, dependencies, GitHub Actions, and contributor controls.

## Executive summary

The server already had strong source-safe defaults: read-only inspection authority, canonical allowed-root checks, skipped symlinks during traversal, shell-free subprocess execution, bounded subprocess output and time, a fail-closed bridge, exact edit-plan confirmation, destructive opt-in, and audit events.

This audit fixed four gaps:

1. The remote transport accepted weak bearer tokens and did not bound chunked request bodies.
2. Text and configuration analyzers truncated only after reading the entire input into memory.
3. Edit-plan values allowed excessive nesting and prototype-sensitive object keys.
4. GitHub Actions used mutable major-version tags, and the npm publish tag was interpolated directly into a shell script.

No known vulnerable npm dependency remains according to `npm audit`. Full project checks and GitHub security workflows are required before release.

## Findings

### SEC-001: Remote request resource exhaustion and weak tokens

- Severity: High
- Status: Fixed
- Affected boundary: Internet client to Streamable HTTP `/mcp`
- Impact: An authenticated or unauthenticated client could consume memory or request capacity with oversized bodies; a short token reduced resistance to guessing.
- Fix: Enforce a 32-byte minimum token, 1 MiB parsed-body cap for declared and chunked requests, JSON content type, per-client rate limit, concurrent-request cap, header/body/request timeouts, and defensive response headers.
- Evidence: `src/http-app.ts:18-116`, `src/http-app.ts:124-258`, `src/http-server.ts:13-18`, and `tests/http-app.test.ts:31-128`.

### SEC-002: Unbounded file buffering before truncation

- Severity: Medium
- Status: Fixed
- Affected boundary: Untrusted project/configuration file to local analyzer
- Impact: A very large file inside an allowed root could cause avoidable memory pressure even when the caller requested a bounded analysis.
- Fix: Read only the configured prefix with a file handle while retaining the file's total size and truncation status.
- Evidence: `src/analysis/text.ts:16-46`, `src/analysis/text.ts:52-110`, `src/analysis/configuration.ts:66-106`, and `tests/configuration.test.ts:40-53`.

### SEC-003: Edit-plan structural denial of service and unsafe keys

- Severity: Medium
- Status: Fixed
- Affected boundary: MCP client plan to confirmation and Extension bridge payload
- Impact: Deep or cyclic values could exhaust recursion; prototype-sensitive keys could become dangerous in a less defensive Extension implementation.
- Fix: Limit depth, nodes, and aggregate string bytes; require JSON-compatible finite values; reject cycles and `__proto__`, `prototype`, and `constructor`.
- Evidence: `src/edit/plans.ts:29-85`, `src/edit/plans.ts:114-122`, and `tests/edit-plans.test.ts:52-73`.

### SEC-004: CI and release supply-chain hardening

- Severity: Medium
- Status: Fixed
- Affected boundary: GitHub Actions and npm publication
- Impact: Mutable action tags increase workflow supply-chain risk, and direct workflow-input interpolation can create shell-injection hazards.
- Fix: Pin all actions to full commit SHAs, disable persisted checkout credentials, validate the npm distribution tag through an environment variable, add CodeQL, and configure Dependabot for npm, pip, and Actions.
- Evidence: `.github/workflows/ci.yml:22-42`, `.github/workflows/npm-publish.yml:17-52`, `.github/workflows/codeql.yml:1-38`, and `.github/dependabot.yml:1-31`.

## Existing controls confirmed

- `resolveReadablePath` canonicalizes targets and allowed roots before authorizing access.
- Project traversal skips symbolic links.
- Child processes use argument arrays with `shell: false`, timeouts, and output caps.
- The default capability is `inspect`; live application requires explicit `edit`.
- The bridge must be fresh, qualified, protocol-compatible, and advertise both the action and each edit operation.
- Destructive operations require an opt-in inside the exact token-bound plan.
- The HTTP token comparison uses `timingSafeEqual`.
- The hosted Fly configuration is read-only and restricted to `/data`.
- npm dependencies are lockfile-pinned with registry integrity values.

## Residual risks and operating requirements

- AVB and AAF parsers process complex third-party formats. Keep them in the bounded subprocess lane and validate unfamiliar files on disposable systems.
- `ffprobe` parses attacker-controlled media. Keep it patched and preserve time/output limits.
- The file-mailbox bridge trusts the current OS user's private bridge directory. Do not place it on shared storage or grant another account write access.
- An authenticated remote MCP client can read data inside configured roots. Use a dedicated random token, narrow roots, TLS at the hosting edge, and `inspect` authority only.
- GitHub branch rules and security features depend on repository plan and owner settings; verify their live state after configuration.
- CodeQL covers TypeScript. Python remains small and isolated, but should be reviewed when the sidecar gains network, write, or deserialization features.

## Release security gates

Run:

```powershell
npm audit --audit-level=high
npm run check
git diff --check
```

Then require green CI and CodeQL checks on the exact release commit. A preview, local test, push, or queued workflow is not release evidence by itself.
