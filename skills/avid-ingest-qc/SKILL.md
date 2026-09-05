---
name: avid-ingest-qc
description: Inventory local editorial media, create contact sheets, and review bounded technical QC with Avid Media Composer MCP.
---

Use the connected Avid MCP tool schemas as the argument contract. Start with `avid_get_capabilities`; report missing dependencies or path scope before attempting dependent work.

1. Index the requested files with `avid_index_media` in batches of at most 100. Retain returned content IDs; do not substitute filenames for IDs.
2. Read `avid_library_metadata` and `avid_media_facets`. Flag mixed rates, dimensions, codecs and channel counts using observed values.
3. Produce `avid_media_report` and, when useful, `avid_contact_sheet` (at most 40 files per sheet). These require export capability; indexing requires project-write.
4. Run `avid_media_qc` over explicit source-time ranges. Each call covers at most ten minutes and the first video/audio streams. For longer material, record each covered interval and any gaps. Review black, freeze and silence findings in context: a fade or still shot can be intentional.
5. Return report paths, source IDs, coverage intervals and unresolved findings. Loudness measurements and timestamp checks do not certify broadcast delivery or perceptual sync.

For recurring ingest, configure `avid_configure_watch_folder`, then explicitly start `avid_watch_service`. Two stable observations precede indexing. Polling ends with the MCP session; a saved watch configuration does not mean the service is running.

Example request: “Inventory these rushes, make contact sheets, and check the first two minutes of each for black frames and silence.” Do not link media into Avid unless the request includes editor ingest.
