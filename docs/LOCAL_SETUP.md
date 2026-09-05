# Unreleased local setup

This checkout contains new Windows native and local analysis tools. They have not been published as a new npm release. The public 1.1.0 package does not yet contain this work. Our original implementation remains MIT and does not require Jumper.

## Build

Use Node.js 20 or newer. Run `npm ci` and `npm run build`. Install FFmpeg/ffprobe for media work; Python is optional for AVB/AAF analysis and is not needed by the native adapter.

```powershell
$env:AVID_MCP_ALLOWED_ROOTS = 'D:\Avid Projects;D:\Media'
$env:AVID_MCP_OUTPUT_ROOT = 'D:\MCP Outputs'
$env:AVID_MCP_NATIVE_BINARY = 'C:\Program Files\Avid\Avid Media Composer\AvidMediaComposer.exe'
$env:AVID_MCP_CAPABILITIES = 'inspect'
node dist/cli.js --doctor
node dist/index.js
```

Create the output directory first. Configure executable paths using `AVID_MCP_FFMPEG`, `AVID_MCP_FFPROBE` and `AVID_MCP_PYTHON` if needed. Native support is restricted to the qualified Windows 2024.12.58720 executable hash; other builds fail closed.

## Client configuration

```powershell
node dist/cli.js --client claude --root 'D:\Avid Projects' --root 'D:\Media' --output 'D:\MCP Outputs' --native 'C:\Program Files\Avid\Avid Media Composer\AvidMediaComposer.exe'
```

Formats: `claude`, `cursor`, `vscode`, `lmstudio`, `generic`. The command prints configuration by default. Add `--config ABSOLUTE_JSON_FILE --install` to back up and merge it. Existing Avid entries are never replaced; malformed JSON/JSONC is rejected. Keep the checkout at a stable path and restart the client. For Codex, use `codex mcp add` with the generated command/environment. Named-client UI and clean-machine qualification remain pending.

Native edits use `avid_native_preview` then the exact token with `avid_native_apply`. Enable `edit`, or `project-write` for bin creation. Tokens are single-use and check current project/target evidence. An abandoned `.avid-mcp/native-write.lock` under the user's home requires inspection before manual removal. No automatic retry or atomic undo is promised. Application completion, post-state readback and persistence are distinct evidence.

## Optional local models

```powershell
node dist/cli.js --download-models --model-dir 'D:\MCP Models'
node dist/cli.js --download-models --speech --model-dir 'D:\MCP Models'
$env:AVID_MCP_MODEL_DIR = 'D:\MCP Models'
```

These explicit commands install and audit a separate optional runtime, then download fixed model revisions. npm must be available alongside Node. Model inference loads cached files only; footage is not uploaded. The optional runtime uses Transformers.js 4.2.0 with sharp 0.35.4 and adm-zip 0.6.0 in its own installation root, where override pins apply.

- CLIP: `Xenova/clip-vit-base-patch32`, revision `d15189d7028b43f1d3e65039190477f6af591c2a`.
- Whisper English: `onnx-community/whisper-tiny.en`, revision `2575352d61be1bf7225cf8f8b268a4678025fc58`.

Libraries and weights retain their own licenses; downloaded models are not relicensed as our code or bundled in the MCP package. References: [Transformers.js](https://github.com/huggingface/transformers.js), [CLIP weights](https://huggingface.co/Xenova/clip-vit-base-patch32), [OpenAI CLIP](https://github.com/openai/CLIP), [Whisper weights](https://huggingface.co/onnx-community/whisper-tiny.en), [OpenAI Whisper](https://github.com/openai/whisper). Final model license/provenance review remains a release item.

## Media workflow

1. `avid_index_media` produces content IDs. Use metadata/facets and substring search within a selected scope.
2. Enable `export` for artifacts, reports, contact sheets and visual-frame caching. Outputs use unique names and source integrity checks.
3. `avid_index_visual` creates a sampled-frame index. `avid_search_visual` supports text and reference images; scores are similarity, not probability. It does not detect every shot.
4. Enable `project-write` and `export` for local transcription. Use the returned revision for search, range reads, extractive outlines or TXT/JSON/CSV/SRT/VTT export. Machine transcription requires review; face recognition and diarization are not implemented.
5. Longer operations can run through the analysis-job tools. There is one worker per queue, a bounded queue and explicit cancellation. Partial artifacts remain for inspection; jobs are session-owned and do not resume automatically after restart.
6. Save selected ranges with `avid_save_collection`, then read them or query their stringout positions with `avid_collection_range`. `avid_export_collection_otio` produces a single-video-track OTIO file with local references and source identity metadata. It does not import into Avid or create audio tracks. OpenTimelineIO round-trip validation is separate from Avid import verification.

Metadata, transcripts and images returned to a cloud-backed AI client may reach its model provider. Local processing alone does not make that client offline. Telemetry stays off unless a PostHog key is configured.

See [implementation status](IMPLEMENTATION_STATUS.md) for the substantial remaining plan. This is not full Jumper parity or a finished installer.
