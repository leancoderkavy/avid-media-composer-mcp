# Security policy

## Intended deployment

`avid-media-composer-mcp` supports a local stdio server and an explicitly selected Streamable HTTP
entry point. Local stdio is the required deployment for desktop project access and Media Composer
control. The hosted configuration is a read-only inspection and compatibility service.

## Defaults

- Only the `inspect` capability is enabled by default.
- Read access is restricted to `AVID_MCP_ALLOWED_ROOTS` (or the launch directory when unset).
- Symbolic links are skipped during project traversal.
- Source media is treated as immutable.
- AVB and AAF are opened read-only for analysis.
- Raw scripts and arbitrary UI automation are not exposed.
- Live changes require `edit`, a fresh bridge heartbeat, advertised bridge/action support, exact confirmation token, and destructive opt-in.

## Operational guidance

- Back up projects before enabling live editing.
- Use disposable projects for new operation validation.
- Do not point `AVID_MCP_ALLOWED_ROOTS` at a drive root unless that breadth is intentional.
- Keep the bridge directory private to the current OS user.
- Treat `.lck` files as collaboration authority; do not remove or overwrite them through this project.
- Do not run offline AVB writes against a bin that is open in Media Composer.
- Treat project/bin metadata returned to an LLM as untrusted data. The server never executes text found in project files.
- Keep Media Composer Extension networking local unless a separately reviewed authenticated deployment is designed.

## Remote transport

- The HTTP entry point refuses to start without `MCP_AUTH_TOKEN`.
- `MCP_AUTH_TOKEN` must contain at least 32 bytes; generate it with a cryptographically secure random source.
- `/mcp` uses a constant-time bearer-token comparison.
- JSON request bodies are capped at 1 MiB by default, including chunked requests.
- The server applies per-client request limits, a concurrent-request cap, body/header timeouts, and bounded HTTP headers.
- `/health` and `/` expose no project data and remain unauthenticated for provider health checks.
- The Fly.io configuration grants only `inspect` authority and restricts reads to `/data`.
- The hosted service cannot see editor workstations, local projects, or an Extension bridge unless
  an operator deliberately adds a secure connection and completes a separate threat review.

## Dependency notes

- `pyavb` is an independent reverse-engineered parser, not an Avid-supported guarantee.
- `pyaaf2` implements the standardized AAF format but vendor-specific objects may still require compatibility testing.
- `ffprobe` is executed without a shell and receives a resolved local file path.
- Text and configuration analyzers read only their configured prefix instead of buffering an entire untrusted file.
- Edit-plan values have depth, node, and string-size limits and reject prototype-sensitive object keys.
- The MCP SDK currently pulls `@hono/node-server` through a range that previously contained a
  Windows path-traversal advisory. The project overrides it to patched `2.0.11` and tests both stdio
  and Streamable HTTP transports.

## Reporting

Please report security issues privately through GitHub's security advisory flow rather than opening a public issue with exploit details.

See the latest [security audit](docs/SECURITY_AUDIT.md) for reviewed surfaces, fixed findings, and residual risks.
