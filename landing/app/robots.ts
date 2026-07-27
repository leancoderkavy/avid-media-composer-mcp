import type { MetadataRoute } from "next"

export const dynamic = "force-static"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      { userAgent: "OAI-SearchBot", allow: "/" },
      { userAgent: "GPTBot", allow: "/" }
    ],
    sitemap: "https://avid-media-composer-mcp.vercel.app/sitemap.xml",
    host: "https://avid-media-composer-mcp.vercel.app"
  }
}
