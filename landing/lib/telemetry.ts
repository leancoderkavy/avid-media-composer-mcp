// Explicit capture only: no SDK autocapture, cookies, URLs, referrers or replay.
export type SetupClient = "claude" | "cursor" | "vscode" | "cli"
export type CopyTarget = SetupClient | "safe_prompt"
type LandingEvent = "avid_landing_client_selected" | "avid_landing_copy"

let distinctId: string | undefined

export function captureLanding(event: LandingEvent, target: CopyTarget, outcome?: "succeeded" | "failed") {
  try {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim()
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com"
    if (!key || typeof window === "undefined" || navigator.doNotTrack === "1" ||
      (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return
    // Keep destinations and property values bounded even if called from untyped code.
    if (!["https://us.i.posthog.com", "https://eu.i.posthog.com"].includes(host)) return
    if (!["avid_landing_client_selected", "avid_landing_copy"].includes(event) ||
      !["claude", "cursor", "vscode", "cli", "safe_prompt"].includes(target)) return
    if (event === "avid_landing_copy" && outcome !== "succeeded" && outcome !== "failed") return
    distinctId ??= `landing:${crypto.randomUUID()}`
    void fetch(`${host}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      referrerPolicy: "no-referrer",
      keepalive: true,
      body: JSON.stringify({
        api_key: key,
        event,
        distinct_id: distinctId,
        properties: {
          target,
          ...(event === "avid_landing_copy" ? { outcome } : {}),
          $ip: "0.0.0.0",
          $geoip_disable: true,
          $process_person_profile: false,
        },
      }),
    }).catch(() => undefined)
  } catch {
    // Analytics must never break setup, including when browser APIs are blocked.
  }
}
