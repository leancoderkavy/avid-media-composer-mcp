# Explicit stereo AAF selects

`avid_build_aaf_selects` accepts `channels: 2` on a sound destination track. Its corresponding entry in every select's `slotIds` must be a pair of distinct sound source-slot IDs. The order determines left/right. Picture and ordinary sound tracks retain their existing integer mapping.

For a master with picture slot 1 and left/right sound slots 2/3:

```json
{
  "tracks": [
    { "name": "V1", "kind": "picture" },
    { "name": "A1", "kind": "sound", "channels": 2 }
  ],
  "selects": [
    { "mobId": "<inspected master UMID>", "start": 2850, "length": 60, "slotIds": [1, [2, 3]] },
    { "mobId": "<inspected master UMID>", "start": 3300, "length": 60, "slotIds": [1, [2, 3]] }
  ]
}
```

These fields belong inside the normal request alongside `template`, its inspected `expectedSha256`, composition `name` and `rate`. No resampling is performed: both channels must have the composition edit rate and cover each requested range.

The author writes a stereo track format and a two-input Audio Channel Combiner for each cut, using the structure independently observed in an Avid native export. It creates a new AAF and preserves the reference template and media. `avid_inspect_aaf_selects` returns `channels: 2` on that track and two overlapping cut records, labeled `channelIndex: 1`/`2`. Timeline position advances once per stereo cut.

Inspection accepts only the recognized operation ID and constant effect parameters, with two distinct, synchronized, direct sound references to one master. Unknown effects, extra inputs, channel timing differences and unsupported track formats are rejected. Both independent cuts and stereo inputs reject source-clip modifiers such as fades, `ChannelIDs`, `MonoSourceSlotIDs` and `SubclipFullLength`; ignoring these fields could misrepresent playback or channel routing. This is not general effect support. The builder reopens its output, checks every source mapping and runs the composition inspector before reporting conformance.

Import uses the existing `import_aaf_selects` preview/apply workflow. Correct structure alone is not rendered fidelity: save/reopen, inspect the saved stereo source references, render, and compare each decoded channel against its intended source. The original independent-track workflow remains available; two mono destination tracks do not assert stereo routing.

## Windows qualification

The real MCP run `qualify-aaf-workflow-mcp.mjs --canonical-tracks --stereo` used the newer reference that had produced dual mono with independent audio tracks. It built a new explicit stereo composition, imported once into `MCP_Workflow_29bbafaa.avb`, saved/reopened, verified all six picture/channel source references and rendered 120 frames. All token replays were refused; the source media, reference and selected preserved files remained unchanged.

Evidence: `.avid-mcp-analysis/aaf-workflow-mcp-51c29267-c57b-4f38-bf30-eb9952868aba/evidence.json`. Its `native-export-ec15fa86-9e38-41b7-8e6e-2719ba7c0404/export/audio-comparison-ad01ceec-a96b-46d1-925c-c7a8b128502d/evidence.json` reports exact complete 24-bit source-clock PCM agreement and distinct output channels. This qualifies the two-cut prepared-PCM Sonoma fixture on Windows Media Composer 2024.12. It does not qualify arbitrary codecs/rates, surround sound, color fidelity or every host build.
