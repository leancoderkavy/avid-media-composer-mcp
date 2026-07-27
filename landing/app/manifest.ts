import type { MetadataRoute } from "next"

export const dynamic = "force-static"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Avid Media Composer MCP",
    short_name: "Avid MCP",
    description: "Source-safe Avid project analysis for MCP-compatible AI clients.",
    start_url: "/",
    display: "standalone",
    background_color: "#050507",
    theme_color: "#111117"
  }
}
