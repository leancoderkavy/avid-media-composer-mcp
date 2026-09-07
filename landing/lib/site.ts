export const siteUrl = "https://avid-media-composer-mcp.com"
export const siteName = "Avid Media Composer MCP"
export const repo = "https://github.com/leancoderkavy/avid-media-composer-mcp"
export const npmUrl = "https://www.npmjs.com/package/avid-media-composer-mcp"
export const packageVersion = "1.1.0"

/** Bump when page content materially changes. Used for sitemap lastmod and visible freshness signals. */
export const lastUpdated = "2026-09-06"

export const absoluteUrl = (path = "/") => new URL(path, siteUrl).toString()

export const pages = {
  home: { path: "/", title: "Avid Media Composer MCP Server | AI Project Analysis" },
  tools: { path: "/tools/", title: "MCP Tools for Avid Media Composer" },
  setup: { path: "/setup/", title: "Install the Avid Media Composer MCP Server" },
  faq: { path: "/faq/", title: "Avid Media Composer MCP FAQ" }
} as const

export const docs = {
  readme: `${repo}#readme`,
  quickStart: `${repo}#quick-start`,
  capabilityMatrix: `${repo}/blob/main/docs/CAPABILITY_MATRIX.md`,
  supportedVersions: `${repo}/blob/main/docs/SUPPORTED_VERSIONS.md`,
  architecture: `${repo}/blob/main/docs/ARCHITECTURE.md`,
  bridge: `${repo}/blob/main/docs/AVID_EXTENSION_BRIDGE.md`,
  localSetup: `${repo}/blob/main/docs/LOCAL_SETUP.md`,
  workflowSkills: `${repo}/blob/main/docs/WORKFLOW_SKILLS.md`,
  implementationStatus: `${repo}/blob/main/docs/IMPLEMENTATION_STATUS.md`,
  research: `${repo}/blob/main/RESEARCH.md`,
  security: `${repo}/blob/main/SECURITY.md`,
  contributing: `${repo}/blob/main/CONTRIBUTING.md`,
  license: `${repo}/blob/main/LICENSE`,
  changelog: `${repo}/blob/main/CHANGELOG.md`
} as const

export function breadcrumbs(items: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Home", path: "/" }, ...items].map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path)
    }))
  }
}
