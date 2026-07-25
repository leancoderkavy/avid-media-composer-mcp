# Security policy

## Intended deployment

`avid-media-composer-mcp` is a local stdio server launched by an MCP client under the same operating-system account that owns the Avid project and runs Media Composer. It does not expose an HTTP listener.

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

## Dependency notes

- `pyavb` is an independent reverse-engineered parser, not an Avid-supported guarantee.
- `pyaaf2` implements the standardized AAF format but vendor-specific objects may still require compatibility testing.
- `ffprobe` is executed without a shell and receives a resolved local file path.
- The MCP SDK currently pulls `@hono/node-server` through a range containing a Windows path-traversal advisory. This stdio-only project overrides it to patched `2.0.11`; no Hono/HTTP server is imported or exposed. Re-test this override before adding HTTP transport.

## Reporting

Please report security issues privately through GitHub's security advisory flow rather than opening a public issue with exploit details.
