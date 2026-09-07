export type Tool = { name: string; purpose: string; mutation: string }
export type ToolGroup = { title: string; description: string; tools: Tool[] }

/** Tools in the published 1.1.0 package, grouped by job. Mirrors the README tool table. */
export const toolGroups: ToolGroup[] = [
  {
    title: "Health, capabilities and compatibility",
    description: "Discover what the server can do on this host before reading any project data.",
    tools: [
      { name: "avid_ping", purpose: "Server health and mode", mutation: "None" },
      { name: "avid_get_capabilities", purpose: "Authority, dependency, coverage and bridge report", mutation: "None" },
      { name: "avid_get_bridge_status", purpose: "Validate bridge heartbeat and advertised support", mutation: "None" },
      { name: "avid_get_compatibility_matrix", purpose: "Report the latest three release/platform contracts", mutation: "None" },
      { name: "avid_check_compatibility", purpose: "Evaluate a Media Composer/OS/architecture combination", mutation: "None" },
      { name: "avid_detect_installations", purpose: "Find standard Windows/macOS installations", mutation: "None" },
      { name: "avid_diagnose_integrations", purpose: "Distinguish AMA, AMT, AVX, AAX, NEXIS and Distributed Processing prerequisites", mutation: "None" }
    ]
  },
  {
    title: "Project discovery and inventory",
    description: "Find Avid projects and classify every file in a project tree without opening Media Composer.",
    tools: [
      { name: "avid_discover_projects", purpose: "Find directories containing .avp files", mutation: "None" },
      { name: "avid_inventory_project_files", purpose: "Classify and optionally hash a project tree, including active or orphaned bin locks", mutation: "None" },
      { name: "avid_analyze_project", purpose: "Aggregate project, configuration, bin, interchange and media report", mutation: "None" },
      { name: "avid_analyze_configuration", purpose: "Decode or fingerprint AVP, AVS and configuration files", mutation: "None" }
    ]
  },
  {
    title: "Bin and interchange analysis",
    description: "Parse AVB, AAF, ALE, EDL and OTIO structures and flag missing, malformed, truncated or opaque data.",
    tools: [
      { name: "avid_analyze_bin", purpose: "Deep .avb analysis through pyavb: mobs, tracks, clips, sequences, views and metadata", mutation: "None" },
      { name: "avid_analyze_aaf", purpose: "Deep .aaf analysis through pyaaf2: mobs, slots, components, essence and descriptors", mutation: "None" },
      { name: "avid_analyze_ale", purpose: "Parse ALE headings, columns and rows", mutation: "None" },
      { name: "avid_analyze_edl", purpose: "Parse CMX-style EDL events, transitions, comments and motion lines", mutation: "None" },
      { name: "avid_analyze_otio", purpose: "Validate bounded OTIO JSON structure and report interchange-fidelity risks", mutation: "None" },
      { name: "avid_preview_otio_handoff", purpose: "Build a local-media manifest, checksums, blockers and manual-import readiness report", mutation: "None" },
      { name: "avid_analyze_dnx_turnover", purpose: "Assess supplied DNx and DNx 4.0 turnover metadata and target-version risks", mutation: "None" }
    ]
  },
  {
    title: "Media, markers and transcripts",
    description: "Inspect media containers and validate editorial sidecar packages locally.",
    tools: [
      { name: "avid_analyze_clip", purpose: "Full ffprobe metadata and editorial summary with optional frame counting and SHA-256 hashing", mutation: "None" },
      { name: "avid_validate_marker_package", purpose: "Validate source markers and reject unsafe SVG overlays", mutation: "None" },
      { name: "avid_compare_transcripts", purpose: "Compare transcript revisions locally and return aggregate timing and speaker QC without text", mutation: "None" }
    ]
  },
  {
    title: "Guarded editing and bridge",
    description: "Preview, tokenize and apply bounded edit plans only through a compatible Avid Extension bridge.",
    tools: [
      { name: "avid_get_edit_operation_catalog", purpose: "Browse the 167 planned editing actions", mutation: "None" },
      { name: "avid_get_extension_capability_manifest", purpose: "Report SDK, onboarding, implementation and host-evidence status for all catalog actions", mutation: "None" },
      { name: "avid_get_live_state", purpose: "Read live state through an Extension bridge", mutation: "Bridge request only" },
      { name: "avid_preview_edit_plan", purpose: "Validate, risk-label and tokenize a plan", mutation: "None" },
      { name: "avid_apply_edit_plan", purpose: "Apply an exact confirmed plan through the bridge", mutation: "Yes, guarded" }
    ]
  },
  {
    title: "Enterprise reads",
    description: "Allowlisted, read-only access to MediaCentral when explicitly configured.",
    tools: [
      { name: "avid_ctms_read", purpose: "Discover or follow one allowlisted read-only MediaCentral CTMS HAL relation", mutation: "Network read" }
    ]
  }
]

export const toolCount = toolGroups.reduce((n, g) => n + g.tools.length, 0)
