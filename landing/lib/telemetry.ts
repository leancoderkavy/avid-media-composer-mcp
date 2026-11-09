// Explicit capture only: no SDK, autocapture, cookies, browser storage or replay.
// Pageviews carry the page URL (without hash) and referrer so PostHog Web Analytics works;
// click events carry only bounded enum properties.
export type SetupClient = "claude" | "cursor" | "vscode" | "cli"
export type CopyTarget = SetupClient | "safe_prompt"
type LandingEvent = "avid_landing_client_selected" | "avid_landing_copy"

// Public project ingestion token for the "leancoderkavy" PostHog project. It is a client
// token (not a personal API key) and is safe to ship in browser bundles.
const fallbackKey = "phc_ua4YCP5MJnrHUgWryu23xyuKYMuyVfwPacgYJYRwBVXb"
const allowedOrigins = new Set(["https://us.i.posthog.com", "https://eu.i.posthog.com"])
const utmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const

// Random identifiers that live only for the page lifetime (they survive client-side
// navigation but not reloads); never persisted or linked to MCP identities.
let distinctId: string | undefined
let sessionId: string | undefined
let lastPageview: string | undefined

function config(): { key: string; host: string } | undefined {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() || fallbackKey
  const hostString = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com"
  if (typeof window === "undefined" || navigator.doNotTrack === "1" ||
    (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return
  // Validate host using proper URL parsing to prevent incomplete substring sanitization
  try {
    const url = new URL(hostString)
    return allowedOrigins.has(url.origin) ? { key, host: url.origin } : undefined
  } catch {
    return // Invalid URL format
  }
}

// PostHog derives session timing from UUIDv7 session IDs.
function uuidv7(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let ms = Date.now()
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ms % 256
    ms = Math.floor(ms / 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function send(event: string, properties: Record<string, unknown>) {
  const target = config()
  if (!target) return
  distinctId ??= `landing:${crypto.randomUUID()}`
  sessionId ??= uuidv7()
  void fetch(`${target.host}/i/v0/e/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "omit",
    referrerPolicy: "no-referrer",
    keepalive: true,
    body: JSON.stringify({
      api_key: target.key,
      event,
      distinct_id: distinctId,
      timestamp: new Date().toISOString(),
      properties: {
        ...properties,
        $session_id: sessionId,
        $ip: "0.0.0.0",
        $geoip_disable: true,
        $process_person_profile: false,
      },
    }),
  }).catch(() => undefined)
}

export function capturePageview() {
  try {
    if (typeof window === "undefined") return
    const { origin, host, pathname, search } = window.location
    const currentUrl = `${origin}${pathname}${search}`
    // Avoid duplicate sends for the same URL (e.g. React strict-mode effect replays).
    if (currentUrl === lastPageview) return
    lastPageview = currentUrl
    const params = new URLSearchParams(search)
    const utm: Record<string, string> = {}
    for (const key of utmKeys) {
      const value = params.get(key)
      if (value) utm[key] = value.slice(0, 200)
    }
    let referrer = "$direct"
    let referringDomain = "$direct"
    if (document.referrer) {
      try {
        const ref = new URL(document.referrer)
        referrer = `${ref.origin}${ref.pathname}`
        referringDomain = ref.host
      } catch {
        // Leave as direct when the referrer is not a parseable URL.
      }
    }
    send("$pageview", {
      $current_url: currentUrl,
      $host: host,
      $pathname: pathname,
      $referrer: referrer,
      $referring_domain: referringDomain,
      title: document.title.slice(0, 200),
      ...utm,
    })
  } catch {
    // Analytics must never break navigation, including when browser APIs are blocked.
  }
}

export function captureLanding(event: LandingEvent, target: CopyTarget, outcome?: "succeeded" | "failed") {
  try {
    // Keep property values bounded even if called from untyped code.
    if (!["avid_landing_client_selected", "avid_landing_copy"].includes(event) ||
      !["claude", "cursor", "vscode", "cli", "safe_prompt"].includes(target)) return
    if (event === "avid_landing_copy" && outcome !== "succeeded" && outcome !== "failed") return
    send(event, { target, ...(event === "avid_landing_copy" ? { outcome } : {}) })
  } catch {
    // Analytics must never break setup, including when browser APIs are blocked.
  }
}
