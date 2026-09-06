# Native clip-bin lookup

Call `avid_native_read` with `query: "mob_bin"` and an observed native `mobId`; no bin argument is required. The connector calls `GetBinFromMob`, validates exactly one absolute existing AVB path within the current authorized project and checks the project again before returning `{mobId, bin, scope}`. Unexpected response fields are omitted. Missing/malformed responses, outside-project paths, non-AVB files and project changes are refused.

This is Avid's current location report. It does not open a bin, relink media, prove saved clip membership, establish uniqueness across copies or resolve a Source-viewer alias into a master clip. Inspect the returned bin's clips and match the exact MOB ID before using it for a subsequent edit. Existing preview/apply checks still apply.

Actual Windows 2024.12 qualification queried the known sequence IDs in `MCP_Color_ac0a950e18ee.avb` and `MCP_Load_7006b4d8.avb` through two independent MCP processes. All four lookups returned their expected bins; original Sonoma media and both bin hashes remained unchanged. Evidence: `.avid-mcp-analysis/native-mob-bin-6a3b9ad3-5d1e-4f07-960e-9a091bc779d6/evidence.json`. Run `node scripts/research/qualify-native-mob-bin.mjs` with that owned project open to reproduce. This does not qualify missing IDs, closed-bin behavior or another editor build.
