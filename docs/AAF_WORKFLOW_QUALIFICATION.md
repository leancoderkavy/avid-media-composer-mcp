# Chained AAF workflow qualification

The native-reference export, source-checked builder, native import, save/reopen, saved range inspection and MP4 render stages now run through shipped MCP tools. This qualification found an unresolved stereo-routing difference; it is not full workflow fidelity acceptance.

## Completed stages

The upstream export/build receipt is `.avid-mcp-analysis/native-aaf-master-mcp-f6012198-7bad-489d-9d85-f4968f0fdcf9/evidence.json`. Its new reference retains the PCM source's stereo master attributes, three 30 fps slots and local media checksum. Its generated selects contain two 60-frame cuts starting at source frames 2850/3300.

The generated selects imported into new bin `MCP_Workflow_da91aac5.avb`, with native composition `060a2b340101010501010f1013-000000-aefa3d0112888806-8b35d8bbc16d-18d9`. Save/reopen preserved identity. The first research script incorrectly assumed that all stereo imports would use the earlier channel-combiner layout and stopped on that assertion. The journal showed a completed import and six correct video/audio source references across three independent tracks. No second import was attempted for that bin.

`scripts/research/continue-aaf-workflow-render.mjs` continued from that journal, verified the observed source mappings and exported the already-imported sequence. Evidence is under `.avid-mcp-analysis/aaf-workflow-mcp-cbe5901f-91b7-4b74-8109-d669dff04bb6/render-continuation-061efd81-51e6-4488-8560-6db05c91d182/`. The 120-frame decode, explicit start/color/channel metadata contracts and token replay refusal passed. Source, bin and earlier evidence hashes stayed unchanged.

## Stereo failure and controlled follow-up

The rendered channels are sample-identical dual mono, while the source channels differ. The strict source-clock stereo comparison fails. The audio report is `native-export-353fe398-87a9-40af-aab6-7d8f087ccaa9/export/audio-comparison-286fba2e-2edb-4910-bc55-9bd515fcba06/evidence.json` under the continuation directory. This is the same class of failure seen in the older original-MP4 experiment, but the present input is the prepared PCM source; do not attribute this new failure to AAC timestamp gaps.

A follow-up used the exact same reference AAF and cuts, rebuilding destination track names as V1/A1/A2 instead of Track 1/2/3. It created another unique composition/bin rather than changing the first experiment. `scripts/research/qualify-aaf-workflow-mcp.mjs --canonical-tracks` completed save/reopen, all source-range checks and render in `MCP_Workflow_026fec45.avb`. Evidence: `.avid-mcp-analysis/aaf-workflow-mcp-48ec76c7-1219-41a9-bebe-225198363849/evidence.json`. It still produced separate audio tracks and failed the strict stereo comparison. Standard destination names therefore did not remedy this fixture.

Both old and new source-master reference AAFs retain `_CHANNEL_GROUP_LIST` and `_ORIGINAL_CHANNEL_GROUP_LIST` values `ST:A1A2,`. Their master slot kinds/rates/lengths also agree. Those declarations alone do not guarantee the host's imported composition routing. Import settings and other descriptor/grouping differences remain to be inspected; no cause beyond the observed topology/audio difference is claimed.

## Import settings and older-reference control

Computer use inspected the current Windows import settings after the restart. Audio showed Multichannel Audio `None`; automatic center panning, bit-depth conversion and gain/attenuation were unchecked. Sample-rate conversion and its pull-up/down exception were checked. The multichannel editor exposed channel-pair controls through A99. Both dialogs were canceled without changing the preset. The OMFI/AAF tab exposed resolution/report options, without a visible stereo-composition control. These observations are current UI state, not a fingerprint of the API's named `Untitled` preset or proof of its state before restart.

Avid's [Media Composer editing guide](https://resources.avid.com/SupportFiles/attach/Media_Composer/Media_Composer_v2025.x_Editing_Guide.pdf) documents multichannel import mapping and the resulting master-clip Track Formats column. That documentation does not establish how this reference-derived composition will be routed; saved-graph and rendered-sample tests remain necessary.

The read-only checksum-selected `scripts/research/inspect-aaf-source-contracts.py` records deeper reference differences in `.avid-mcp-analysis/aaf-source-contracts-ab62dd0c-b0a2-47af-a525-28d46d798cba/evidence.json`. The PCM source mob's older `_SAVED_AAF_AUDIO_RATE_NUM`/`_LENGTH` values are 48000/9161600; the newer values are 30/5726. The source slot changes from 2 to 1, with corresponding master references. Both PCM descriptors still declare 48000 Hz, length 9161600, two channels and 24-bit quantization. This is metadata evidence, not a demonstrated cause or a basis for automatically rewriting those fields.

`node scripts/research/qualify-aaf-workflow-mcp.mjs --canonical-tracks --original-reference` rebuilt the same cuts using the checksum-selected older reference, then imported into a fresh `MCP_Workflow_3979a705.avb` with the unchanged preset. Save/reopen, all six source mappings, complete 120-frame render, replay refusal and preserved-file checks passed. Evidence: `.avid-mcp-analysis/aaf-workflow-mcp-ddf01099-1a1f-4217-bff9-253e9dbfce72/evidence.json`. Strict audio comparison again failed with identical rendered channels: `native-export-9c6f25cf-e8a2-42a6-83bb-9bb8346c2db0/export/audio-comparison-5d70fa2d-3ef9-46e6-9f87-ae08ff7489ce/evidence.json` beneath that directory.

The older reference alone therefore does not restore stereo in a newly built/imported composition under the current host state. The reference metadata differences cannot alone explain the regression. Explicit composition grouping/panning, host import state and existing master resolution need controlled investigation. No import-setting or source-AAF repair has been adopted.

## Remaining acceptance boundary

The earlier PCM fixture and its post-restart render still have exact stereo PCM evidence. That evidence does not generalize to these new imports. Native receipts correctly separate technical metadata/decoding from `sourceFidelityVerified: false`. Two reported output channels, correct source ranges, a preserved source hash or a successful import response cannot establish stereo preservation.

Next work is to establish explicit imported channel grouping/panning with saved-graph and rendered-sample evidence, while preserving these failed outputs as regression fixtures. General color fidelity, multiple sources/rates, downstream descriptors, relink and undo remain open. The bundled skills now describe the available chained workflow and require that these evidence levels remain separate.
