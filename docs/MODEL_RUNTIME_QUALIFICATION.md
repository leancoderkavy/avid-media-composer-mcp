# Optional runtime installation and offline inference qualification

## Setup owner interruption before npm

`scripts/research/qualify-runtime-setup-crash.mjs` invokes the production installer in child processes and pauses after completed exclusive lock creation or completed staging-manifest creation. The parent confirms that the recorded PID is the child, observes a competing install refusal while it is alive, kills that exact process, awaits its close event, and checks another install refusal. Both barriers retained identical lock bytes, published no runtime, and preserved the expected staging contents. Evidence: `.avid-mcp-analysis/runtime-setup-crash-6c34cb1d-0695-47dc-b112-4369cfd45364/evidence.json`; both children closed with SIGKILL.

The initial research harness exited at an unresolved promise instead of remaining at its barrier; adding an IPC message listener made the successful run retain the child until explicit termination. The successful run asserts termination rather than treating a stale lock as process evidence. This qualification stops before npm launches: automatic recovery, orphaned dependency installers, interruption during download/audit/import, and power-loss durability remain open. No production installer behavior changed.

The optional Transformers.js runtime is installed separately from the core MCP package. New installations use a unique staging directory, disable npm lifecycle scripts, audit high-severity dependencies, import the runtime in a child process and record a complete dependency-tree checksum before publishing the runtime directory. The child closes native-library handles before directory publication.

An existing receipt is checked before reuse; setup does not rerun npm install or silently repair changed dependencies. A legacy runtime with the exact expected manifest can be audited and imported, then adopted with a tree receipt without reinstalling dependencies. For adoption, scriptsDisabled:false means this operation does not establish the original installation's script policy. It does not prove that scripts ran.

Normal `modelRuntime()` loading now also checks the managed receipt and complete dependency-tree hash before importing the runtime entry. Missing receipts require explicit `--install-model-runtime --model-dir PATH` adoption; mismatched trees are refused without automatic repair. Each loader call repeats the check, including when Node may already cache the module. This adds filesystem hashing cost and establishes on-disk consistency with the receipt, not publisher authentication, loaded-memory integrity or protection against an external writer changing files between verification and import.

CLI runtime status includes `inferencePreflight`: `verified`, `adoption_required` or `tree_changed`, with a `passed` boolean and a next step. `modelLoadVerified` remains false because status does not import models or check weights. Inspection runs no installer, audit or repair. The same report is returned after explicit installation/adoption.

The inference loader uses the entry path returned by bounded runtime validation. It does not independently read dependency metadata without a size bound. Oversized dependency `package.json` files are refused before import; the version, manifest, receipt and tree checks share the status validation path.

`scripts/research/qualify-runtime-import-integrity.mjs` checks the installed runtime, copies it into a disposable directory, adds one owned file, verifies refusal, removes that file and verifies restored loading. The original dependency-tree hash remained unchanged. Evidence: `.avid-mcp-analysis/runtime-import-integrity-09093496-acc3-4bd5-ba5d-6fc317beb544/evidence.json`. Verification plus first import took 2.946 seconds; verification plus cached import took 2.769 seconds; changed-copy refusal took 2.780 seconds. These are two warm-filesystem loader observations on this Windows host, not cold-start percentiles or model inference timings. The retained copy contains dependencies only, not model weights.

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

- [Non-speech negative probes](NONSPEECH_QUALIFICATION.md) found false transcript text for a pure tone and seeded white noise. Digital silence was rejected. This is an open quality failure despite successful offline execution.

- Actual English/Mandarin auto-language workflow: `.avid-mcp-analysis/speech-auto-3cf8417d-35d7-4e8c-a599-153cbd23ee68/evidence.json`.
- Actual visual-summary lifecycle: `.avid-mcp-analysis/visual-summary-7cb0f246-c17f-4569-825f-8d5359f0ed4b/evidence.json`; the overview remained identical, including its previously documented quality defects.
- Sonoma CLIP ranking: `.avid-mcp-analysis/visual-ranking-cd9ab79e-eb9f-40c7-b9d0-5266aaee7ddb/evidence.json`; hit@1 14/16, hit@3 16/16 and MRR 0.9375, unchanged from the earlier development set.

Tree receipts detect changes during setup/status and every ordinary `modelRuntime()` loader call, as described above. Receipts record earlier audit/import results, not a current vulnerability audit or publisher authentication. Model weights and system dependencies retain their separate provenance and lifecycle requirements.

## Atomic receipt publication

Temporary creation now uses an exclusive file handle before entering cleanup. If the temporary path already exists, creation fails and its contents are preserved; cleanup runs only after this attempt successfully opened its file. A regression deliberately creates a collision and verifies preservation. Partial-write and concurrent-publication tests still pass. The updated real child-process interruption experiment also passed at both boundaries: `.avid-mcp-analysis/runtime-receipt-crash-85d46614-d5a6-4d82-a4e8-9172a37d848c/evidence.json`.

Setup now writes a complete validated receipt to a unique temporary file in the cache root, then links it exclusively to the runtime's installation.json. A partial write cannot become the final receipt, and concurrent publishers cannot replace a winner. The attempt's temporary file is removed on ordinary success/failure. A process crash may leave a temporary file in the cache root; it is outside the inventoried runtime, remains available for inspection and does not change the dependency-tree hash. This does not remove a surviving setup lock, establish worker termination or prove power-loss durability.

Regression tests inject a partial write failure and exercise two simultaneous publishers, verifying that the final receipt is absent or complete and existing content is preserved. The full runtime installation/adoption tests still cover failed staging, changed trees and replacement setup locks.

Actual installed-runtime evidence: `.avid-mcp-analysis/runtime-receipt-2027927f-b197-45ee-997c-ec41aa202b44/evidence.json`. `qualify-runtime-receipt.mjs` copies dependencies without the original receipt into a disposable cache, retains an abandoned partial temporary receipt in the cache root, runs real audit/import/adoption, checks managed status and loads a tensor. The new runtime tree equals the original hash; the original cache stayed unchanged. This is actual filesystem/adoption evidence with existing dependencies, not a new dependency installation, model inference or process-kill experiment.

`qualify-runtime-receipt-crash.mjs` separately tests real child-process termination at two instrumented points in the production receipt publisher: after a partial temporary write and after the completed receipt is linked. The parent waits for an IPC barrier, inspects the filesystem, terminates that exact child and awaits its close event. In the first case the final receipt is absent until a new publication succeeds; in the second it is already complete and replacement is refused. Abandoned temporary bytes are retained in both cases, and a synthetic dependency-tree hash stays unchanged. Evidence: `.avid-mcp-analysis/runtime-receipt-crash-aeb4f70c-53e5-44b8-9ed3-ea416dad18e8/evidence.json`; both children closed with SIGKILL. Syntax and actual execution passed. This uses synthetic receipts/dependency files and instrumented publication boundaries; it does not qualify a full installer crash, surviving setup-lock recovery or power loss.
