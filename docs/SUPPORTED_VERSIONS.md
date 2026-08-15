# Supported Media Composer versions

Verified against Avid's current documentation index and version matrix on 2026-08-15.

| Media Composer track | Support tier | Windows | macOS | Extension terminology |
| --- | --- | --- | --- | --- |
| 2025.12.x (current matrix patch 2025.12.2) | Current | Windows 11 22H2+ Pro/Enterprise | 13.x through 13.7.x; 14.x through 14.8.x; 15.x through 15.7.x; 26.2 through 26.6 | Media Composer Extensions |
| 2025.6 | Previous | Windows 10/11 22H2+ Pro/Enterprise | 13.x through 13.7.x; 14.x through 14.7.x; 15.x through 15.5 | Panel SDK |
| 2024.12.x (current LTM patch 2024.12.6) | Long-term maintenance | Windows 10/11 22H2+ Pro/Enterprise | 13.x through 13.7.x; 14.x through 14.7.x; 15.x through 15.4.x | Panel SDK |

The MCP uses release-line matching, so a patch such as `2025.12.2` resolves to the `2025.12`
compatibility contract. Unknown release lines fail closed for live bridge operations.

The 2025.12.2 claim is product-scoped: it is the `Media Composer` row in Avid's
Media Composer version matrix, checked on 2026-08-15. Do not substitute a similarly
numbered Pro Tools or Media Composer Distributed Processing release. The direct official
matrix response on that date contained `2025.12 | 2025.12.2 | April 7, 2026`; an earlier
Tavily extraction reported 2025.12.1, so the live product-scoped source takes precedence.
The complete machine-readable provenance is exposed with each release track at runtime.

In Avid's 2025.12 documentation and product language, the former Panel SDK/panels are
called **Media Composer Extensions** and appear in an Extensions menu. This repository
uses that current name for the target integration. The older `panel-sdk` label remains in
machine-readable history only for pre-2025.12 release lines; it is not evidence that an
Extension SDK package, an installed extension, or live editing support is available.

## Runtime checks

- `avid_get_compatibility_matrix` returns the machine-readable release matrix and source URLs.
- `avid_check_compatibility` evaluates an explicit Media Composer/OS/architecture combination.
- `avid_detect_installations` checks standard application locations on Windows and macOS plus
  `AVID_MCP_APPLICATION_PATH`.
- Protocol v2 bridge heartbeats must declare Media Composer version, platform, OS version, and
  architecture. A stale, unsupported, or incompletely qualified host is not considered connected.
- Compatibility status is a release/OS/CPU screening result, not an Avid qualification claim for
  a workstation, an Extension, or any editing operation.

## Documentation drift check

`node scripts/check-avid-documentation-drift.mjs` fetches the official matrix, emits a JSON
report, and exits nonzero if its product-scoped 2025.12 row no longer matches this snapshot.
The scheduled **Avid documentation drift check** workflow runs it weekly. It is assertion-only:
it never rewrites compatibility data or opens a release. A failed run requires a human review of
the official source before updating the provenance and regression tests.

## Extension SDK capability manifest

`src/compatibility/extension-capabilities.ts` exports a machine-readable manifest covering every
one of the 167 edit-catalog actions. All entries currently state `internal-catalog`,
`pending-avid-onboarding`, and `not-started`; therefore the manifest is an SDK onboarding map,
not an assertion of documented SDK methods, installed extension support, or real-host editing.
The manifest validator rejects catalog/manifest drift and any catalog-only action that claims a
method, host version, or host evidence.

## Qualification boundary

An OS/version match does not qualify a complete workstation. GPU model and driver, Avid-qualified
computer model, I/O hardware and driver, NEXIS/MediaCentral versions, plug-ins, and licensing can
change whether a configuration is supported. The MCP reports the release/OS/architecture result
separately and keeps those additional checks visible.

## Official sources

- [Media Composer 2025 Documentation](https://kb.avid.com/pkb/articles/en_US/User_Guide/Media-Composer-2025-Documentation)
- [Avid Media Composer documentation and version matrix](https://kb.avid.com/pkb/articles/en_US/compatibility/en267087)
- [Media Composer 2025.12 What's New](https://www.avid.com/resource-center/whats-new-avid-media-composer-202512)
- [Media Composer 2025.6 ReadMe](https://resources.avid.com/SupportFiles/attach/Media_Composer/Media_Composer_v2025.6_ReadMe.pdf)
- [Media Composer 2024.12 ReadMe](https://resources.avid.com/SupportFiles/attach/README_Avid_Editor_v24.12.pdf)
- [Avid Windows 10 end-of-support policy](https://kb.avid.com/pkb/articles/en_US/Knowledge/Windows-10-End-of-Support)
