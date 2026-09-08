"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Bot, Code2, MonitorSmartphone, Terminal } from "lucide-react"
import { useState, type ComponentType } from "react"
import { CopyButton } from "@/components/copy-button"

type Route = {
  id: string
  name: string
  badge: string
  tagline: string
  file: string
  detail: string
  snippet: string
  Icon: ComponentType<{ className?: string }>
}

const serverBlock = `      "command": "npx",
      "args": ["-y", "avid-media-composer-mcp@latest"],
      "env": {
        "AVID_MCP_ALLOWED_ROOTS": "ABSOLUTE_PROJECT_PATH",
        "AVID_MCP_CAPABILITIES": "inspect"
      }`

const routes: Route[] = [
  {
    id: "claude",
    name: "Claude Desktop",
    badge: "Recommended for the easiest start",
    tagline: "Add one server block to the Claude Desktop config.",
    file: "claude_desktop_config.json",
    detail:
      "Add the block, then fully quit and reopen Claude Desktop. The server starts in inspect-only mode and reads nothing outside the roots you list.",
    snippet: `{
  "mcpServers": {
    "avid-media-composer": {
${serverBlock}
    }
  }
}`,
    Icon: Bot
  },
  {
    id: "cursor",
    name: "Cursor",
    badge: "Guided route",
    tagline: "Register the local server in Cursor's MCP settings.",
    file: "~/.cursor/mcp.json",
    detail:
      "Cursor uses the same server shape. Create the file if it does not exist, then reload the window so Cursor picks up the new server.",
    snippet: `{
  "mcpServers": {
    "avid-media-composer": {
${serverBlock}
    }
  }
}`,
    Icon: Code2
  },
  {
    id: "vscode",
    name: "VS Code / Copilot",
    badge: "Guided route",
    tagline: "Connect through your editor's MCP settings.",
    file: ".vscode/mcp.json",
    detail:
      "VS Code reads a servers map rather than mcpServers. Commit the file per workspace, or add it to your user settings for every project.",
    snippet: `{
  "servers": {
    "avid-media-composer": {
${serverBlock}
    }
  }
}`,
    Icon: MonitorSmartphone
  },
  {
    id: "cli",
    name: "Another client",
    badge: "Advanced route",
    tagline: "Print ready-made configuration from the CLI.",
    file: "terminal",
    detail:
      "The CLI emits configuration for claude, cursor, vscode, lmstudio and generic clients, plus a Codex argument array with --client codex.",
    snippet: `npx -y avid-media-composer-mcp@latest \\
  --client generic \\
  --root "ABSOLUTE_PROJECT_PATH"`,
    Icon: Terminal
  }
]

export function ClientPicker() {
  const reduceMotion = useReducedMotion()
  const [active, setActive] = useState(0)
  const route = routes[active]

  return (
    <div className="clients">
      <div className="client-grid" role="tablist" aria-label="Choose your MCP client">
        {routes.map((item, index) => {
          const RouteIcon = item.Icon
          return (
            <button
              type="button"
              role="tab"
              key={item.id}
              id={`client-tab-${item.id}`}
              aria-selected={index === active}
              aria-controls="client-panel"
              className={index === active ? "active" : ""}
              onClick={() => setActive(index)}
            >
              <small>{item.badge}</small>
              <RouteIcon />
              <strong>{item.name}</strong>
              <span>{item.tagline}</span>
            </button>
          )
        })}
      </div>

      <div className="client-detail" id="client-panel" role="tabpanel" aria-labelledby={`client-tab-${route.id}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={route.id}
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="client-detail-head">
              <span>
                <strong>{route.name}</strong>
                <small>{route.file}</small>
              </span>
              <CopyButton value={route.snippet} label="Copy config" />
            </div>
            <p>{route.detail}</p>
            <pre><code>{route.snippet}</code></pre>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
