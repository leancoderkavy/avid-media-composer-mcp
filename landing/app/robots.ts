import type { MetadataRoute } from "next"
import { absoluteUrl, siteUrl } from "@/lib/site"

export const dynamic = "force-static"

/**
 * Search and AI crawlers are explicitly allowed. This site is documentation for an
 * open-source project, so citation by AI answer engines is the goal.
 */
const aiCrawlers = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User",
  "ClaudeBot", "Claude-User", "Claude-SearchBot", "anthropic-ai",
  "PerplexityBot", "Perplexity-User",
  "Google-Extended", "GoogleOther",
  "Bingbot", "DuckAssistBot", "YouBot",
  "Applebot", "Applebot-Extended",
  "meta-externalagent", "Amazonbot", "CCBot", "cohere-ai", "MistralAI-User"
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      ...aiCrawlers.map(userAgent => ({ userAgent, allow: "/" }))
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: siteUrl
  }
}
