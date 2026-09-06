# Native read ownership lookup

Each native RPC still performs a fresh Windows listener-owner lookup and validates the configured executable path. Schema loading still hashes the binary on each call; expected owner identity checks before guarded writes are unchanged. No cached owner identity authorizes a later request.

The lookup now queries `ROOT/StandardCimv2/MSFT_NetTCPConnection` directly through `Get-CimInstance`, filtering local port 9100, local address 127.0.0.1 and State 2. The installed Windows `NetTCPIP/MSFT_NetTCPConnection.cdxml` maps Get-NetTCPConnection to that same class and maps Listen to numeric value 2. This avoids the cost of loading the NetTCPIP PowerShell module for each lookup. It continues to resolve process path, PID and start time, rejects missing/ambiguous/foreign owners, and fails if the provider command fails.

`node scripts/research/benchmark-native-reads.mjs` compares both query paths against the same running owner and measures schema loading and full guarded GetAppInfo calls. It performs five sequential samples, saves the results and verifies the fixed saved-bin hash. The independent command timings are separate measurements, not an exact decomposition of a single RPC.

On the qualified Windows host, the pre-change run measured median full reads at 1,571 ms, owner lookup at 1,431 ms and direct CIM at 868 ms. After the change, full reads measured 941 ms, the original lookup 1,526 ms, direct CIM 877 ms and schema loading 77 ms. All five owner comparisons agreed in each comparison run; the fixture was unchanged. These small, sequential samples establish an observed local improvement, not a latency guarantee, load benchmark or cross-version qualification.

Evidence under `.avid-mcp-analysis`:

- `native-read-timing-f56e3eac-e58e-498d-9d89-5341557dd75a`: initial cost measurement.
- `native-read-timing-436ed818-74e1-4783-b591-ad3b63986f89`: old full-call path and direct-provider comparison.
- `native-read-timing-a2931e8c-000a-4cb3-93f8-bc5ffbe4162c`: updated full-call path and owner equivalence.

Every directory contains `evidence.json`. Unit tests separately verify repeated fresh lookup and missing, ambiguous, foreign and failed-provider rejection. This change does not make the surrounding editor-state reads atomic or qualify additional editing operations.

Broader fresh-package native reads also passed after the lookup change: app/project/bin/clip/track/viewer queries, independent saved timeline checks, and bin/empty-inclusive clip-column reads across reconnect. Evidence: `.avid-mcp-analysis/installed-native-e2459fac-98f2-4dec-a41e-e98bfb2ad655/evidence.json`, with native and column evidence linked inside. This uses the existing qualified host and dependencies; it is not a new write or clean-machine qualification.
