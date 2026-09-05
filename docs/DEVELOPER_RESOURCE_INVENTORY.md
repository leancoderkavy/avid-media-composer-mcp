# Media Composer workstation inspection and developer resources

Checked: 2026-09-04. Repository baseline: `36eba17`.

Follow-up SDK-independent testing successfully exercised 16 native methods, including
disposable-bin creation, synthetic audio linking, and marker operations with
close/reopen persistence checks. See [the real-host smoke report](NATIVE_API_SMOKE_TEST.md).
The workstation observations below originated in the initial read-only inspection.

This is a focused inventory of the public resources located and the installed host observed. It is not a claim that every private SDK document has been obtained or every editor feature has been tested. Public documentation, installed components, and functioning MCP operations are different evidence levels.

## Workstation findings

| Observation | Evidence | Implication |
| --- | --- | --- |
| Media Composer Ultimate 2024.12 is open | Computer-use capture of the editing workspace and Help > About | A real editor is now available for fixture validation. |
| License type is Trial | About dialog | Host availability is time-limited; no expiry date was inspected. |
| Installed build is `24.12.0.58720` | Executable file version and Windows installed-product registry | Qualify this exact build before extrapolating behavior to newer releases. |
| Empty Test project and Test Bin | Computer-use workspace capture | No clips, loaded sequence, or edit results were available to validate. |
| Tools menu includes Avid Huddle | Computer-use menu capture | An installed panel is registered in this older Tools-menu layout. |
| Command Palette is available through Tools, Ctrl+3 | Computer-use capture | Commands can be mapped for controlled UI experiments. No mapping was changed. |
| Input menu exposes Source Browser, Import Media, Tape Capture, Link to Volume for Export, and Import EDL | Computer-use menu capture | Visible import workflows are available; no import was executed. |
| Accessibility tree is sparse | The workspace returned panes and title-bar controls, without semantic bin/timeline controls | UI automation will need screenshots, explicit focus, and post-action checks. |

The About dialog also showed Symphony, NewsCutter, PhraseFind AI, and ScriptSync AI options as activated. This is UI evidence of the reported options, not a test of their functionality. About and Command Palette were closed after inspection. The Test project was left open. No content edits, exports, or saves were performed by this investigation.

### Installed integration components

Installation directory: `C:\Program Files\Avid\Avid Media Composer`.

- `AvidMediaComposer.exe`: file version `24.12.0.58720`.
- `avid-api-gateway.exe`: file version `1.0.0.311`; Windows Authenticode reported a valid Avid Technology signature.
- `qwebchannel.js`, Qt WebEngine components, Python components, and local HTML help exist. Their presence does not establish a public scripting API.
- `C:\ProgramData\Avid\APIGateway\config.json` exists. Its contents were not read.
- `C:\ProgramData\Avid\PanelSDKPlugins\avid-huddle.avpi` is installed.

Read-only OS socket inspection, while the editor was open:

| Owning process | Local listeners |
| --- | --- |
| `avid-api-gateway.exe` | IPv6 loopback `::1:4920` and `::1:4930` |
| `AvidMediaComposer.exe` | IPv4 loopback `127.0.0.1:9100` and IPv6 loopback `::1:9100` |

The initial inventory observed listeners only. A subsequent SDK-independent investigation verified native gRPC on `127.0.0.1:9100`, standard service discovery, and three successful read-only methods; see [NATIVE_API_RESEARCH.md](NATIVE_API_RESEARCH.md). Gateway ports 4920 and 4930 were not contacted. The public MediaCentral API Gateway documentation below must not be assumed to describe these local services.

### What the bundled AVPI reveals

Read-only ZIP inspection of the installed Huddle package found two entries:

- `avid-manifest.json` (1,036 bytes)
- `static/application.svg` (5,529 bytes)

The manifest has fields for identity/version, `usesApi`, `subscribesToChannels`, `entitlements`, `uiItems`, `windowSize`, `targetHosts`, `allowedDomains`, `windowStyle`, and `singleton`. Selected observed values:

- Category: `suite-plugin`.
- Target host: `MediaComposer`.
- Declared API families: `avid.mediacomposer.general` and `avid.mediacomposer.SRT`.
- Floating singleton window; empty subscriptions and entitlements arrays in this particular package.

This is useful evidence of package structure and declarative API dependencies. It supplies neither method definitions nor proof that another extension can use the same access. The package contained no JavaScript SDK implementation. No vendor package was modified or copied into the repository, and no extension was installed.

### Version-specific interchange finding

The installed `Help\Content\Editing_Guide\OpenTimelineIO.htm` documents OTIO export through the List Tool and explicitly says OTIO import is unavailable. It also describes limited effect transfer and multichannel audio limitations. Its page title still calls OTIO a public preview, so treat the local help as version-specific documentation, not a contemporary compatibility matrix.

Avid independently documents the addition of OTIO import in **2025.6**. Therefore, use AAF/ALE/EDL for initial inbound interchange experiments on this 2024.12 host; use OTIO for outgoing structural inspection. [2025.6 announcement](https://www.avid.com/resource-center/whats-new-avid-media-composer-20256)

## Public resource inventory

### Direct Media Composer extension development

| Resource | What it provides | Access/result |
| --- | --- | --- |
| [Extensions developer overview](https://connect.avid.com/media_composer_extensions.html) | Describes project/bin/timeline integration and links to SDK onboarding | Public overview; no method reference on this page. |
| [Extensions / former Panel SDK onboarding](https://connect.avid.com/23-q4-global-mc-panel-sdk-lp.html) | The destination of the overview's SDK link | Still says new partner onboarding is paused. No form submitted. |
| [Official extension directory](https://www.avid.com/media-composer/extensions) | Shipping partners and workflow examples | Useful capability leads; not SDK documentation. |
| [Media Composer 2026.8 announcement](https://www.avid.com/resource-center/whats-new-avid-media-composer-2026-8) | Announces sequence creation, OTIO exchange, and transcript read/write API/SDK enhancements | Roadmap input for newer hosts; no signatures or SDK artifacts supplied. |
| [2025.12 What's New](https://resources.avid.com/SupportFiles/attach/Media_Composer/2025.12/Media_Composer_v2025.12_What's_New.pdf) | Extensions naming/menu change and marker-overlay features | Public release documentation. |

Searches for the exact installed identifiers `avid.mediacomposer.general` and `avid-manifest.json`, plus Media Composer SDK/API terms, did not locate a public method reference or downloadable JavaScript SDK in the inspected results. This is a search result, not proof that no public material exists elsewhere. The user subsequently confirmed that Avid will not provide SDK access. Installed-binary inspection recovered native method and message descriptors and demonstrated live reads without the SDK download; it did not locate a complete Extensions SDK.

### Host documentation and qualification

| Resource | Use |
| --- | --- |
| [2024 documentation index](https://kb.avid.com/pkb/articles/en_US/Knowledge/Media-Composer-2024-Documentation) | Installed release family: editing/effects guides, installation, fixes, and maintenance ReadMes. The index lists 2024.12.6; this host is 2024.12.0. |
| [2024.12 What's New](https://resources.avid.com/SupportFiles/attach/WhatsNew_MediaComposer_v24.12.pdf) | Baseline changes for this installation. |
| [2025 documentation index](https://kb.avid.com/pkb/articles/en_US/User_Guide/Media-Composer-2025-Documentation) | Intermediate-release feature and compatibility deltas. |
| [2025.6 feature announcement](https://www.avid.com/resource-center/whats-new-avid-media-composer-20256) | OTIO import introduction and transcript workflow changes. |
| [2026 documentation index](https://kb.avid.com/pkb/articles/en_US/Knowledge/Media-Composer-2026-Documentation) | Current ReadMe, What's New, editing/effects guides, installation, and administration links. |
| [2026.8 ReadMe](https://resources.avid.com/SupportFiles/attach/Media_Composer/2026/2026.8/Media_Composer_v2026.8_ReadMe.pdf) | Host/platform requirements and known limitations. |
| [2026.8 What's New](https://resources.avid.com/SupportFiles/attach/Media_Composer/2026/2026.8/Media_Composer_v2026.8_What's_New.pdf) | Release-specific user workflows. |
| [Qualified systems and I/O hardware](https://kb.avid.com/pkb/articles/en_US/compatibility/en422411) | Workstation qualification reference. No complete machine qualification audit was done here. |
| [Networking Port Usage Guide](https://resources.avid.com/SupportFiles/attach/Avid_Networking_Port_Usage_Guide.pdf) | Infrastructure networking reference. The fetched May 2026 PDF did not contain `4920`; do not use it as proof of the observed local gateway protocol. |

Some large editing/effects PDFs failed retrieval through the web research tool. Their official indexes remain the download entry points. Local HTML editing help was inspected directly where relevant; the full manuals were not read end to end.

### Other Avid SDKs and APIs

The [Avid Developer portal](https://developer.avid.com/) distinguishes the following integration families. They serve narrower purposes than a local editorial-control adapter.

| Surface | Purpose | Resource/access |
| --- | --- | --- |
| AVX | Video effects | [Toolkit overview](https://www.avid.com/alliance-partner-program/avx-connectivity-toolkit); lists headers, guide, samples, and test host. Download retrieval failed. |
| AMA | Media linking and export formats | [Evaluation entry](https://my.avid.com/cpp/sdk/ama), linked from the developer portal; retrieval timed out. |
| Open I/O | Hardware I/O integration | [Evaluation entry](https://my.avid.com/cpp/sdk/openio); redirected to account sign-in. |
| AAX | Audio effects/instruments | [SDK page](https://developer.avid.com/aax/); agreement/account workflow. |
| DNx | Codec and MXF workflows | [Toolkit entry](https://my.avid.com/cpp/sdk/dnx), linked from the portal; retrieval timed out. |
| AMT | OP-Atom media plus AAF metadata | [Developer portal](https://developer.avid.com/); evaluation request through Avid. |
| CTMS / Media Suite | Enterprise media assets | [API documentation](https://developer.avid.com/ctms/), [client examples](https://developer.avid.com/ctms/examples.html). |
| MediaCentral API Gateway | Enterprise service routing | [Documentation](https://developer.avid.com/upstream/). |
| MediaCentral UX Toolkit | Cloud UX plugins | [Documentation](https://developer.avid.com/mcux_ui_plugin/). |

No SDK agreement was accepted and no gated SDK was downloaded. Download availability does not establish redistribution permission. Pro Tools scripting and Sibelius scripting belong to other products and should not be treated as Media Composer automation APIs.

### Open-source formats, examples, and tooling

| Resource | MCP relevance |
| --- | --- |
| [pyavb source](https://github.com/markreidvfx/pyavb) and [API docs](https://pyavb.readthedocs.io/en/latest/) | AVB object graph reading/writing; reuse existing read-only integration and study controlled fixture differences. |
| [pyaaf2 source](https://github.com/markreidvfx/pyaaf2) and [API docs](https://pyaaf.readthedocs.io/en/latest/) | AAF reading/writing; useful for generated interchange experiments. |
| [AAF SDK developer site](https://aaf.sourceforge.net/) | Format SDK, examples, utilities, documentation, and historical implementation reference. |
| [OpenTimelineIO source](https://github.com/AcademySoftwareFoundation/OpenTimelineIO) and [docs](https://opentimelineio.readthedocs.io/en/latest/) | Timeline model, time arithmetic, adapters, examples, and tests. |
| [OTIO AAF adapter](https://github.com/OpenTimelineIO/otio-aaf-adapter) | Read/write bridge for clips/tracks/gaps/markers/nesting/transitions. Its matrix excludes general effects and speed-effect writing; do not promise lossless conversion. |
| [OTIO adapter catalog](https://github.com/AcademySoftwareFoundation/OpenTimelineIO/blob/main/docs/tutorials/adapters.md) | ALE, CMX EDL, AAF, and other adapters now live in separate repositories. |
| [ffprobe documentation](https://ffmpeg.org/ffprobe.html) | Machine-readable container/stream/timecode inspection for media fixtures. |
| [Avid GitHub organization](https://github.com/avid-technology) | Public enterprise integration examples, rather than a discovered Media Composer Extensions SDK. |
| [Avid CTMS Node example](https://github.com/avid-technology/ctms-examples-node) | Authentication/session and HAL API patterns for the optional enterprise adapter. |

### Shipping integration references

[Jumper's installation documentation](https://docs.getjumper.io/NLE/avid/avid-guide) identifies `.avpi` packaging, the gateway helper, Tools versus Extensions menus, and keyboard fallbacks for some SDK actions. Its [Windows release notes](https://docs.getjumper.io/release-notes/windows) describe SDK stability workarounds. These are first-party implementation observations from Jumper, not guarantees for our adapter.

The [Avid directory](https://www.avid.com/media-composer/extensions) provides additional leads including Marvin Jr., Autodesk Flow Capture, and Flawless. They demonstrate workflows worth investigating; installing a partner product does not provide its developer credentials or SDK rights.

## Recommended MCP build order

1. **Record host readiness.** Add version, gateway process/listener, and installed-panel diagnostics with explicit evidence labels. Never promote an observed listener to `bridge-connected` without the repository's authenticated protocol handshake.
2. **Produce real fixtures on this host.** Use synthetic media and separate disposable projects. Exercise one operation at a time and compare AVB/AAF outputs with the existing analyzers. Check save/reopen and recovery; retain timing, stable identifiers, locks, and unsupported objects.
3. **Implement conservative interchange outputs.** Start with AAF/ALE/EDL for this 2024.12 installation. Gate OTIO import at 2025.6 or later and verify effects, retimes, and audio routing separately.
4. **Use the verified native research route.** Avid SDK access is unavailable. The installed executable supplies discoverable protobuf definitions, and app/project/bin reads succeeded on the native local service. Preserve exact-build evidence and investigate additional definitions with the standalone research utility.
5. **Implement a separate native adapter.** Start with the three demonstrated reads, qualify error/busy/closed-project behavior, then add one reversible operation with structured post-state and persistence verification. Give this route its own capability and evidence contract; do not label it an authenticated Extension bridge. Keep unsupported actions unavailable.
6. **Qualify newer hosts separately.** 2025.12 changes panel menus; 2026.8 adds announced API capabilities. An upgrade is a separate installation/compatibility decision, not something performed by this inspection.

Production runtime code is unchanged. Separate research utilities now have 14 passing offline tests and successful real-host evidence for 16 native methods, including scoped fixture writes. The production MCP suite was not rerun. This establishes an SDK-independent integration path on this build; production MCP editing integration and broader qualification remain outstanding.
