"use client"

import { usePathname } from "next/navigation"
import { useEffect } from "react"
import { capturePageview } from "@/lib/telemetry"

// Sends a PostHog $pageview on first load and after every client-side route change.
export function PageviewTracker() {
  const pathname = usePathname()
  useEffect(() => {
    capturePageview()
  }, [pathname])
  return null
}
