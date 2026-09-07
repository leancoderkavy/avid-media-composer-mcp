export type FaqItem = { question: string; answer: string }

/** Core questions shown on the home page. */
export const faq: FaqItem[] = [
  {
    question: "Is there an MCP server for Avid Media Composer?",
    answer: "Yes. Avid Media Composer MCP is an open-source Model Context Protocol server that gives AI clients read-only analysis of Avid Media Composer projects, AVB bins, AAF, ALE, EDL, configuration and media files. Guarded live editing requires a compatible Avid Extension bridge."
  },
  {
    question: "Which Avid formats can it analyze?",
    answer: "It analyzes AVB bins through pyavb, AAF through pyaaf2, ALE and CMX-style EDL with native parsers, OTIO JSON structurally, AVP and AVS as text or bounded binary evidence, and media containers through ffprobe."
  },
  {
    question: "Does it modify project files or footage?",
    answer: "No. Offline analysis is read-only and source media is never modified. The server enforces explicit allowed roots and reports opaque data as labeled evidence instead of guessing."
  },
  {
    question: "Can it edit a live Media Composer timeline?",
    answer: "Only through a separately installed, compatible Avid Extension bridge. Without a fresh bridge that advertises the requested operation, live editing fails closed."
  },
  {
    question: "Which Media Composer releases are supported?",
    answer: "The current compatibility contracts cover Media Composer 2025.12.x, 2025.6, and the 2024.12.x long-term-maintenance release track on qualified Windows and macOS combinations."
  }
]

/** Extended questions for the dedicated FAQ page. */
export const extendedFaq: FaqItem[] = [
  ...faq,
  {
    question: "Which AI clients work with Avid Media Composer MCP?",
    answer: "Any standards-compatible MCP client that can launch a local stdio process or connect to an authenticated Streamable HTTP endpoint, including Claude Desktop, Claude Code, Cursor, VS Code, Codex and LM Studio. The CLI can generate configuration for each of these clients."
  },
  {
    question: "Is Avid Media Composer MCP an official Avid product?",
    answer: "No. It is an independent, MIT-licensed open-source project. It is not affiliated with or endorsed by Avid Technology, Inc. Avid and Media Composer are trademarks of Avid Technology, Inc."
  },
  {
    question: "How do I install the Avid MCP server?",
    answer: "Install Node.js 20 or newer, set AVID_MCP_ALLOWED_ROOTS to your Avid project folder and AVID_MCP_CAPABILITIES to inspect, then run npx -y avid-media-composer-mcp@latest. AVB and AAF analysis also needs Python 3.9 or newer with the pinned pyavb and pyaaf2 packages, and clip analysis needs ffprobe on PATH."
  },
  {
    question: "What does the server do with the Model Context Protocol?",
    answer: "It exposes Avid project, bin, interchange, configuration and media evidence as MCP tools, a resource for the editing-action catalog, and prompts for project audits and safe edits. MCP clients call those tools over stdio or Streamable HTTP."
  },
  {
    question: "Can it run over HTTP for a remote AI client?",
    answer: "Yes. The Streamable HTTP transport serves MCP at /mcp and requires an Authorization: Bearer token on every request. The /health route is unauthenticated for provider health checks."
  },
  {
    question: "How does the guarded edit workflow stay safe?",
    answer: "An edit plan is previewed first, classified by risk, and bound to an exact SHA-256 confirmation token. Destructive operations require explicit opt-in, and the plan is applied only through a bridge that advertises each operation. A missing or stale bridge means no live edit."
  },
  {
    question: "What are the AVB and AVP file formats?",
    answer: "AVB is the Avid bin file format that stores clips, sequences, tracks and bin views. AVP is the Avid project file and AVS files hold settings. AVB, AVP and AVS are not public Avid-supported interchange specifications, so the server reads them as bounded evidence and never presents opaque bytes as decoded fact."
  },
  {
    question: "How is this different from screen scraping or UI automation?",
    answer: "The server parses structured project, bin, interchange and media data directly. It never drives the Media Composer user interface, never runs arbitrary scripts, and reports missing, malformed, truncated or opaque data explicitly."
  },
  {
    question: "Does it send project data to the cloud?",
    answer: "The server runs locally and reads only the allowed roots you configure. Optional PostHog operations telemetry is disabled by default and, when enabled, records tool names, outcomes and durations without prompts, arguments, results, paths, media or project names."
  },
  {
    question: "Which Avid workflow skills are included?",
    answer: "The package ships five MIT-licensed skills for ingest QC, selects, review markers, turnover and export. They guide an AI through the implemented MCP tools and their evidence limits."
  }
]
