# PostHog setup and critical-path audit

This change is for a HOLD-MERGE draft PR. No production configuration, deployment,
PostHog project, billing setting, or live ingestion was changed or exercised.

## Events

| Event | Status / trigger | Properties |
| --- | --- | --- |
| `avid_mcp_server_started` | Confirmed after stdio connect / HTTP listen | `transport`, `telemetry_enabled` |
| `avid_mcp_connection_attempt` | Confirmed HTTP bearer auth accepted/rejected, after rate-limit checks | `transport`, `outcome` (`authorized`, `unauthorized`) |
| `avid_mcp_request` | Confirmed completed HTTP responses, excluding `/` and `/health` | `transport`, bounded `method`, `route` (`/mcp` or `other`), `status_code`, `duration_ms` |
| `avid_mcp_tool_call` | Confirmed core/native tools; added coverage to the library handler wrapper (index/search, transcripts, collections/export, analysis/job commands, etc.) | Fixed registered `tool` name, `outcome` (`succeeded`, `failed`), `duration_ms`, failure `error_code` |
| `avid_landing_client_selected` | Added when switching setup-client tabs | `target` (`claude`, `cursor`, `vscode`, `cli`) |
| `avid_landing_copy` | Added after clipboard write succeeds or fails | `target` (setup client or `safe_prompt`), `outcome` (`succeeded`, `failed`) |

No landing login, account identity, checkout or payment integration exists. No
synthetic auth/payment events were added. MCP bearer checks are operational auth,
not account sign-ins. Library job-command success means the command returned;
it does not mean a background analysis job completed. Workers continue to clear
`POSTHOG_API_KEY`, and there are no new background completion events.

## MCP setup and privacy

The existing `posthog-node` singleton initializes only with a nonblank
`POSTHOG_API_KEY` (project ingestion token). `POSTHOG_HOST` defaults to
`https://us.i.posthog.com`; use the matching ingestion host for your project.
`POSTHOG_DISTINCT_ID` overrides the service fallback; otherwise the fallback uses
`FLY_APP_NAME` or `avid-media-composer-mcp`. Use only non-personal service labels.
`NODE_ENV` becomes `environment`. Server version and service name are also added.

There are no `identify` calls, person profiles, exception autocapture, or replay.
GeoIP and person processing are disabled. Existing stdio startup uses a local
random installation ID; HTTP startup uses a service label. Tool and HTTP events
use the service fallback. This patch removes token-derived fingerprints and MCP
session IDs from analytics identity; the fingerprint remains local for rate
limiting. Historical HTTP identity continuity is intentionally broken.

Only handler names, outcomes, durations and error codes are captured. Arguments,
results, media/project paths, names, queries, transcripts, bearer tokens, request
bodies, raw URLs, IP addresses and error messages/stacks are not event properties.
The shared capture API accepts general properties, so future callers must preserve
this bounded schema. Operator-supplied environment/identity labels must not contain
PII or secrets. No broader local-machine or media collection was introduced.

Capture uses the existing non-awaited `captureImmediate` with sanitized failure
logging; configured batch flush settings do not batch these immediate calls.
Existing shutdown paths drain the client with a five-second bound. Tool exceptions
are represented by the existing failed tool event, not raw exception uploads.

## Landing setup and privacy

The static-export landing previously had no PostHog SDK, initialization, env keys
or capture calls. It now uses explicit fetches to the documented
[PostHog capture API](https://posthog.com/docs/api/capture), avoiding automatic
browser metadata collection and adding no dependency. See `landing/.env.example`:

- `NEXT_PUBLIC_POSTHOG_KEY`: public **project ingestion token**, never a personal
  API key. Unset means no requests or identity creation.
- `NEXT_PUBLIC_POSTHOG_HOST`: `https://us.i.posthog.com` (default) or
  `https://eu.i.posthog.com`. Other hosts fail closed. These exact origins are
  allowed by `landing/vercel.json`'s `connect-src` policy.

Next embeds these public values at build time; changing them requires rebuilding.
This configuration is independent of the server's opt-in key. The identity is a
random in-memory page-lifetime UUID, never stored in cookies/local storage or
linked to MCP IDs. Events omit credentials and referrers, suppress IP storage
with `$ip: "0.0.0.0"`, and disable GeoIP and person profiles. Direct network
delivery still exposes the browser source IP to the receiving service at the
network layer. DNT and Global Privacy Control disable capture.

Properties are explicitly constructed from bounded enums. Clipboard text, config
snippets, prompt text, file paths, location/search/hash, DOM content, error text
and user details are never passed to capture. There is no pageview/autocapture,
session replay, global error handler or identify call. Only clipboard failures
are added as landing critical-path errors. Analytics failures are swallowed and
do not affect copying or client selection.

## Setup gaps and validation limits

- Actual project tokens, cloud region, deployed env values, ingestion and dashboard
  configuration remain unverified. No credentials were read or live events sent.
- Landing analytics remains disabled until an operator supplies a public project
  token at build time. Self-hosted ingestion needs a reviewed host/CSP change.
- Startup/config failures, SDK schema rejections before tool handlers, background
  job completion, and global browser errors are not separately captured. HTTP
  status events still cover completed HTTP error responses; health probes are
  deliberately excluded. Rate-limited auth attempts have HTTP 429 events only.
- This environment uses Node 20.19.2; locked `posthog-node` 5.52.1 declares
  `^20.20.0 || >=22.22.0`, and Vitest 5 requires newer Node than 20. The repo's
  existing `>=20.0.0` engine claim is broader than its locked dependencies.
  Use a supported current Node runtime for release qualification.
- Tests use fake tokens and mocked capture/fetch, checking default-off behavior,
  privacy signals, bounded landing payloads, HTTP identity redaction, and library
  success/failure payloads containing no private arguments/results/error text.
  Run the focused telemetry, HTTP and server suites, root typecheck, landing lint
  and landing production build. No production smoke test is part of this audit.
