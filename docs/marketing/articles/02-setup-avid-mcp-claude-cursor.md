# Install Avid Media Composer MCP with Claude Desktop and Cursor

- **Primary keyword:** install Avid Media Composer MCP
- **Secondary keywords:** Avid MCP Claude Desktop, Avid MCP Cursor, MCP server Avid setup, npx avid-media-composer-mcp
- **Audience:** editors and post engineers standing up a first workstation
- **Tools referenced:** `avid_ping`, `avid_get_capabilities`, `avid_detect_installations`, `avid_check_compatibility`, `avid_diagnose_integrations`, CLI `--doctor` / `--client`
- **Status:** draft for HOLD-MERGE review — not published

## Answer-first summary

To connect Claude Desktop, Claude Code, Cursor, VS Code, or LM Studio to Avid project files, install the Avid Media Composer MCP server, point `AVID_MCP_ALLOWED_ROOTS` at authorized project folders, start with `AVID_MCP_CAPABILITIES=inspect`, then confirm health with `avid_ping` and `avid_get_capabilities`. Node.js 20+ is required. AVB/AAF analysis also needs Python 3.9+ with the pinned packages in `python/requirements.txt`. Clip probing needs `ffprobe` on `PATH`.

## Prerequisites checklist

| Requirement | Why |
| --- | --- |
| Node.js 20 or newer | Runs the TypeScript MCP server |
| Python 3.9+ + `python/requirements.txt` | AVB (`pyavb`) and AAF (`pyaaf2`) inspection |
| `ffprobe` on `PATH` | `avid_analyze_clip` and related media metadata |
| Explicit project roots | Server cannot wander outside `AVID_MCP_ALLOWED_ROOTS` |
| MCP-capable client | Claude Desktop, Cursor, VS Code, Codex, LM Studio, or any stdio/HTTP MCP client |

Media Composer itself does **not** need to be open for offline analysis.

## Fast path: published package (`1.1.0` via `@latest`)

PowerShell example:

```powershell
$env:AVID_MCP_ALLOWED_ROOTS = "C:\Users\you\Documents\Avid Projects"
$env:AVID_MCP_CAPABILITIES = "inspect"
npx -y avid-media-composer-mcp@latest
```

Generic MCP client config:

```json
{
  "mcpServers": {
    "avid-media-composer": {
      "command": "npx",
      "args": ["-y", "avid-media-composer-mcp@latest"],
      "env": {
        "AVID_MCP_ALLOWED_ROOTS": "C:\\Users\\you\\Documents\\Avid Projects",
        "AVID_MCP_CAPABILITIES": "inspect"
      }
    }
  }
}
```

Generate client-shaped JSON from a built checkout with:

```powershell
node .\dist\cli.js --client cursor --root "C:\Users\you\Documents\Avid Projects"
```

Supported `--client` values include `generic`, `claude`, `cursor`, `vscode`, and `lmstudio`. Generated config does not prove the host app completed onboarding; verify tools appear in the client’s MCP panel.

## Claude Desktop / Claude Code

1. Install or confirm Node.js 20+.
2. Add the `mcpServers` block above to Claude’s MCP configuration (Desktop config JSON or Claude Code MCP settings, depending on your install).
3. Restart the client so it relaunches the stdio server.
4. Ask: “Call `avid_ping`, then `avid_get_capabilities`, and summarize authority and dependencies.”

If AVB/AAF tools report missing Python deps, create a venv, install `python/requirements.txt`, and set `AVID_MCP_PYTHON` to that interpreter.

## Cursor

1. Open Cursor Settings → MCP (or the project MCP config your team uses).
2. Add the same server entry with `command`/`args`/`env`.
3. Ensure `AVID_MCP_ALLOWED_ROOTS` uses absolute Windows or macOS paths your session can read.
4. In chat, ask Cursor to list Avid tools and run `avid_detect_installations` if you need to locate Media Composer installs.

Cursor can also use a built-from-source entry (`node` + absolute path to `dist/index.js`) when you are evaluating `1.2.0-rc.1` features that are not on npm `latest` yet.

## First verification prompts (safe)

Use these before any edit-capable session:

1. “Run `avid_ping` and report mode.”
2. “Run `avid_get_capabilities` and list enabled capabilities, dependency gaps, and bridge status.”
3. “Run `avid_detect_installations` and summarize discovered Media Composer paths.”
4. “Run `avid_check_compatibility` for our Media Composer version, OS, and architecture.”
5. “Run `avid_diagnose_integrations` and separate AMA / AMT / AVX / AAX / NEXIS / Distributed Processing signals from guesses.”

Optional local doctor:

```powershell
node .\dist\cli.js --doctor
```

## Enabling edit later (not day one)

Only after a compatible Extension bridge is installed and tested:

```powershell
$env:AVID_MCP_CAPABILITIES = "inspect,edit"
$env:AVID_MCP_BRIDGE_DIR = "$env:LOCALAPPDATA\avid-media-composer-mcp\bridge"
$env:AVID_MCP_BRIDGE_AUTH_SECRET = "<unique 32+ character secret shared with the Extension>"
```

Protocol v3 rejects unauthenticated legacy bridge documents. Keep the secret out of project bins, logs, and git.

## Authenticated HTTP (facility pattern)

For a shared internal endpoint, build the server and run Streamable HTTP with `MCP_AUTH_TOKEN`. Every MCP request needs `Authorization: Bearer <token>`; `/health` stays unauthenticated for probes. Prefer private networks and facility-controlled secret storage.

## Common setup failures

| Symptom | Likely cause |
| --- | --- |
| Tools missing in client | Config not reloaded; wrong JSON path; client not launching `npx` |
| AVB/AAF analysis fails | Python missing or `AVID_MCP_PYTHON` unset |
| Clip analysis thin | `ffprobe` not on `PATH` |
| Paths refused | Root outside `AVID_MCP_ALLOWED_ROOTS` |
| Apply edit fails closed | Bridge not connected or operation not advertised |

## Version honesty for facility docs

- Document `@latest` → `1.1.0` for stable installers.
- Document building from this repository when you need `1.2.0-rc.1` media intelligence.
- Do not tell the floor that `npx @latest` includes RC-only tools until that release ships.

## FAQ draft

**How do I connect Claude to Avid Media Composer?**  
Install Avid Media Composer MCP, set allowed roots and `inspect` capability, add the server to Claude’s MCP config, then verify with `avid_ping` and `avid_get_capabilities`.

**Does Cursor need Media Composer running?**  
Not for offline project, bin, and interchange analysis.

**Is Mac supported for live native operations?**  
Offline compatibility rules cover additional OS combinations. Mac native implementation and host qualification are deferred in current project docs; treat Windows native evidence as build-specific.
