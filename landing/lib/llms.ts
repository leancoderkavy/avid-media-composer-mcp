import { plainText } from "@/components/rich-text"
import { extendedFaq } from "./faq"
import { guidePath, guides } from "./guides"
import { absoluteUrl, docs, lastUpdated, npmUrl, packageVersion, repo, siteName, stableVersion } from "./site"
import { toolCount, toolGroups } from "./tools"

/**
 * llms.txt and llms-full.txt are generated from the same content the pages render,
 * so a new guide or tool cannot silently fall out of the AI-crawler surfaces.
 */

const summary =
  `${siteName} is an independent, open-source Model Context Protocol (MCP) server that gives AI clients such as Claude, ChatGPT, Cursor and Codex source-safe, read-only analysis of Avid Media Composer projects, AVB bins, AAF, ALE, EDL, OTIO, configuration files and media metadata, plus guarded editing automation through a compatible Avid Extension bridge. MIT licensed. Not affiliated with or endorsed by Avid Technology, Inc.`

const keyFacts = [
  `Package: \`avid-media-composer-mcp\` on npm — stable ${stableVersion}, release candidate ${packageVersion}. Run the stable build with \`npx -y avid-media-composer-mcp@latest\`.`,
  "Languages: TypeScript server with a bounded Python inspector (pyavb, pyaaf2) and optional ffprobe.",
  "Transports: local stdio, or authenticated Streamable HTTP at `/mcp` with a bearer token.",
  "Safety model: explicit allowed roots, read-only offline analysis, opaque data reported as evidence, guarded edit plans bound to an exact SHA-256 confirmation token, fail-closed bridge.",
  "Supported Media Composer release tracks: 2025.12.x, 2025.6 and 2024.12.x long-term maintenance, on qualified Windows and macOS combinations.",
  "Not an Avid product. Avid and Media Composer are trademarks of Avid Technology, Inc."
]

const sitePages = [
  ["Home", "/", "Overview, capabilities, architecture and core FAQ."],
  ["Tool reference", "/tools/", `Every one of the ${toolCount} MCP tools in the published package, grouped by job, with mutation status.`],
  ["Setup guide", "/setup/", "Prerequisites, environment variables, client configuration JSON and the HTTP transport."],
  ["FAQ", "/faq/", "Supported formats, AI clients, safety, live editing, privacy and compatibility."]
]

const sourceLinks: [string, string, string][] = [
  ["GitHub repository", repo, "Canonical source, issues and releases."],
  ["README", docs.readme, "Quick start, tool table, safe edit workflow."],
  ["Capability matrix", docs.capabilityMatrix, "Implemented, dependency, extension-contract, provider-gated and not-claimed status per area."],
  ["Supported versions", docs.supportedVersions, "Media Composer release tracks and OS combinations with provenance."],
  ["Architecture", docs.architecture, "Analysis lane versus live-control lane."],
  ["Avid Extension bridge contract", docs.bridge, "Protocol for guarded live editing."],
  ["Workflow skills", docs.workflowSkills, "Ingest QC, selects, review markers, turnover and export skills."],
  ["Security policy", docs.security, "Threat model and reporting."],
  ["Research and primary sources", docs.research, "Avid format and SDK research."],
  ["npm package", npmUrl, "Published releases."]
]

export function llmsTxt(): string {
  const lines = [
    `# ${siteName}`,
    "",
    `> ${summary}`,
    "",
    `Last updated: ${lastUpdated}`,
    "",
    "Key facts:",
    "",
    ...keyFacts.map(fact => `- ${fact}`),
    "",
    "## Site pages",
    "",
    ...sitePages.map(([name, path, note]) => `- [${name}](${absoluteUrl(path)}): ${note}`),
    ...guides.map(guide => `- [${guide.metaTitle}](${absoluteUrl(guidePath(guide.slug))}): ${guide.description}`),
    `- [llms-full.txt](${absoluteUrl("/llms-full.txt")}): the full site content in one Markdown file for AI consumption.`,
    "",
    "## Source and documentation",
    "",
    ...sourceLinks.map(([name, href, note]) => `- [${name}](${href}): ${note}`),
    "",
    "## Optional",
    "",
    `- [Changelog](${docs.changelog})`,
    `- [Contributing](${docs.contributing})`,
    `- [Implementation status](${docs.implementationStatus}): unreleased development-branch work, including native Windows operations.`,
    ""
  ]
  return lines.join("\n")
}

export function llmsFullTxt(): string {
  const lines: string[] = [
    `# ${siteName} — full site content`,
    "",
    `> ${summary}`,
    "",
    `Source of truth: ${absoluteUrl("/")} · Repository: ${repo} · Last updated: ${lastUpdated}`,
    "",
    "## Key facts",
    "",
    ...keyFacts.map(fact => `- ${plainText(fact)}`),
    "",
    "## Tool reference",
    "",
    `The published package exposes ${toolCount} MCP tools. Every offline tool is read-only.`,
    ""
  ]

  for (const group of toolGroups) {
    lines.push(`### ${group.title}`, "", group.description, "")
    for (const tool of group.tools) lines.push(`- \`${tool.name}\` — ${tool.purpose} (mutation: ${tool.mutation})`)
    lines.push("")
  }

  lines.push("## Guides", "")
  for (const guide of guides) {
    lines.push(`### ${guide.metaTitle}`, "", `URL: ${absoluteUrl(guidePath(guide.slug))}`, "", plainText(guide.answer), "")
    for (const section of guide.sections) {
      lines.push(`#### ${section.h2}`, "")
      for (const paragraph of section.body ?? []) lines.push(plainText(paragraph), "")
      for (const item of section.list ?? []) lines.push(`- ${plainText(item)}`)
      if (section.list) lines.push("")
      if (section.table) {
        lines.push(`| ${section.table.head.map(plainText).join(" | ")} |`)
        lines.push(`| ${section.table.head.map(() => "---").join(" | ")} |`)
        for (const row of section.table.rows) lines.push(`| ${row.map(plainText).join(" | ")} |`)
        lines.push("")
      }
    }
    lines.push(`Related MCP tools: ${guide.tools.join(", ")}.`, "")
    for (const item of guide.faq) lines.push(`**${item.question}** ${item.answer}`, "")
  }

  lines.push("## Frequently asked questions", "")
  for (const item of extendedFaq) lines.push(`**${item.question}** ${item.answer}`, "")

  lines.push(
    "## Source and documentation",
    "",
    ...sourceLinks.map(([name, href, note]) => `- ${name}: ${href} — ${note}`),
    "",
    "Avid and Media Composer are trademarks of Avid Technology, Inc. This project is independent and not endorsed by Avid.",
    ""
  )

  return lines.join("\n")
}
