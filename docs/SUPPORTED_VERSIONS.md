# Supported Media Composer versions

Verified against Avid documentation on 2026-07-25.

| Media Composer track | Support tier | Windows | macOS | Extension terminology |
| --- | --- | --- | --- | --- |
| 2025.12.x (current patch 2025.12.1) | Current | Windows 11 22H2+ Pro/Enterprise | 13.x through 13.7.x; 14.x through 14.8.x; 15.x through 15.7.x; 26.x | Extensions SDK |
| 2025.6 | Previous | Windows 10/11 22H2+ Pro/Enterprise | 13.x through 13.7.x; 14.x through 14.7.x; 15.x through 15.5 | Panel SDK |
| 2024.12.x (current LTM patch 2024.12.6) | Long-term maintenance | Windows 10/11 22H2+ Pro/Enterprise | 13.x through 13.7.x; 14.x through 14.7.x; 15.x through 15.4.x | Panel SDK |

The MCP uses release-line matching, so a patch such as `2025.12.1` resolves to the `2025.12`
compatibility contract. Unknown release lines fail closed for live bridge operations.

## Runtime checks

- `avid_get_compatibility_matrix` returns the machine-readable release matrix and source URLs.
- `avid_check_compatibility` evaluates an explicit Media Composer/OS/architecture combination.
- `avid_detect_installations` checks standard application locations on Windows and macOS plus
  `AVID_MCP_APPLICATION_PATH`.
- Protocol v2 bridge heartbeats must declare Media Composer version, platform, OS version, and
  architecture. A stale, unsupported, or incompletely qualified host is not considered connected.

## Qualification boundary

An OS/version match does not qualify a complete workstation. GPU model and driver, Avid-qualified
computer model, I/O hardware and driver, NEXIS/MediaCentral versions, plug-ins, and licensing can
change whether a configuration is supported. The MCP reports the release/OS/architecture result
separately and keeps those additional checks visible.

## Official sources

- [Media Composer 2025.12 ReadMe](https://resources.avid.com/SupportFiles/attach/Media_Composer/2025.12/Media_Composer_v2025.12_ReadMe.pdf)
- [Media Composer 2025.6 ReadMe](https://resources.avid.com/SupportFiles/attach/Media_Composer/Media_Composer_v2025.6_ReadMe.pdf)
- [Media Composer 2024.12 ReadMe](https://resources.avid.com/SupportFiles/attach/README_Avid_Editor_v24.12.pdf)
- [Avid version matrix](https://kb.avid.com/pkb/articles/en_US/compatibility/en267087)
- [Avid Windows 10 end-of-support policy](https://kb.avid.com/pkb/articles/en_US/Knowledge/Windows-10-End-of-Support)
