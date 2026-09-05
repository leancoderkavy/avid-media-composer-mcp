# Optional runtime installation and offline inference qualification

The optional Transformers.js runtime is installed separately from the core MCP package. New installations use a unique staging directory, disable npm lifecycle scripts, audit high-severity dependencies, import the runtime in a child process and record a complete dependency-tree checksum before publishing the runtime directory. The child closes native-library handles before directory publication.

An existing receipt is checked before reuse; setup does not rerun npm install or silently repair changed dependencies. A legacy runtime with the exact expected manifest can be audited and imported, then adopted with a tree receipt without reinstalling dependencies. For adoption, scriptsDisabled:false means this operation does not establish the original installation's script policy. It does not prove that scripts ran.

A cache-level exclusive setup lock prevents cooperating installers from running together. The lock is checked before removal, and an unexpected replacement is retained. Failed staging remains available for inspection. A surviving lock does not establish whether its worker stopped; automatic stale-lock recovery, runtime update/rollback/removal, arbitrary concurrent writers and cross-platform setup qualification remain open.

## Fresh runtime evidence

`.avid-mcp-analysis/runtime-install-proof-8b291dd2-87f9-448c-8b7f-438e34c24152/evidence.json` records actual Windows CLI fresh installation, checksum-preserving reuse, cached DistilBART inference with fetch prohibited, changed-tree refusal and preservation of an unexpected file. Runtime/package-lock hashes remained unchanged after the extra test file was removed. The proof copied existing pinned weights; it did not establish a new weight download or clean-machine system dependency installation.

A subsequent explicit summary download command reused that runtime successfully and its tree remained unchanged. Actual adoption of the existing model cache is recorded in `.avid-mcp-analysis/runtime-legacy-adoption.json`; `runtime-legacy-after-inference.json` confirms unchanged runtime bytes after further inference.

## Correcting the offline boundary

The first fresh-runtime inference test created an unrevisioned config.json under the dependency's default .cache directory. Inspection of the installed Transformers.js 4.2.0 source showed pipeline preflight passing device/dtype without forwarding revision, cache_dir or local_files_only. Tokenizer discovery also omits those options. Therefore the previous per-call local_files_only flags did not justify an unconditional cached-only claim: metadata discovery could access the network even when the later weight loads were local-only. This finding concerns model metadata requests, not an observed footage upload.

The inspected installed bundle SHA-256 was `4932ec78a6b136d97d09a12093afb476530d9aa099dbaf1f9822ad56bfe2bc3d`. Relevant functions are pipeline in src/pipelines.js, loadTokenizer in src/tokenization_utils.js and the model-registry file discovery helpers.

Normal inference now disables remote model access, directs the default cache outside dependencies, and uses absolute directories for pinned model revisions. Speech/summary/text pipelines construct their components directly to avoid pipeline preflight. CLIP and Florence component loaders also use pinned local directories. Explicit download operations remain permitted to access model hosts.

`scripts/research/qualify-offline-models.mjs` exercised actual CLIP text/image embeddings, English and multilingual Whisper, DistilBART and Florence with globalThis.fetch replaced by a rejecting, counting function. Evidence: `.avid-mcp-analysis/offline-models-92468052-ab87-4357-a0cc-8a2a47177c03/evidence.json`. All completed with zero fetch attempts; the sampled image hash was unchanged. This is an application fetch guard, not native packet capture or proof for every possible external dependency.

Regression evidence:

- Actual English/Mandarin auto-language workflow: `.avid-mcp-analysis/speech-auto-3cf8417d-35d7-4e8c-a599-153cbd23ee68/evidence.json`.
- Actual visual-summary lifecycle: `.avid-mcp-analysis/visual-summary-7cb0f246-c17f-4569-825f-8d5359f0ed4b/evidence.json`; the overview remained identical, including its previously documented quality defects.
- Sonoma CLIP ranking: `.avid-mcp-analysis/visual-ranking-cd9ab79e-eb9f-40c7-b9d0-5266aaee7ddb/evidence.json`; hit@1 14/16, hit@3 16/16 and MRR 0.9375, unchanged from the earlier development set.

Tree receipts detect changes when setup/status is requested; ordinary inference does not hash every runtime dependency on each call. Receipts record earlier audit/import results, not a current vulnerability audit or publisher authentication. Model weights and system dependencies retain their separate provenance and lifecycle requirements.
