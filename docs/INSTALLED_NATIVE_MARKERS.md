# Fresh-package native marker qualification

The development archive was installed through the managed package CLI into a new isolated directory, and the resulting installed server entry was used by a stdio MCP client for actual Avid marker edits. This qualifies package installation followed by the marker workflow on the existing Windows host; it does not establish AI-client approval or clean-machine onboarding.

On the owned 30 fps marker fixture, the installed server created two markers, saved/reopened the bin, cleared one comment and changed its color, saved/reopened again, restored the original fields, and finally deleted the test markers and saved/reopened. Each native operation required its ordinary preview and single-use apply token; the harness asserted operation-specific verification flags and preservation of the other note. No approval metadata or client controls were relaxed.

Independent saved AVB inspection used the existing checkout Python oracle. It verified the requested comment/color change, preservation of other decoded fields, exact decoded restoration, and final equality to the marker-empty decoded baseline. The protected source bin and Sonoma MP4 hashes were unchanged. The archive and installed server-entry checksums were unchanged after execution. Opaque binary equivalence, atomic undo, application restart, other frame rates, GUI onboarding and a model approving/invoking the write remain separate requirements.

Evidence:

- Installation: `.avid-mcp-analysis/installed-native-markers-5ef5bf50-7eca-4fdd-8426-0defb3038ffb/evidence.json`
- Native events and saved snapshots: `.avid-mcp-analysis/native-marker-clear-acfefaae-5ea6-487a-a1e8-a1e1f254d427/`
- Independent verification: `saved-clear-verification.json` in that native evidence directory.
- Archive SHA-256: `39c4c307992d2443f19b0c2a691f17206de886c5e2ee6a26b35621aa3f49ec4a`
- Installed entry SHA-256: `ccf452f77abeb7420331555e651b22cdef446e2fcd82cbd9bd6e16093761f2a0`
- Cleaned fixture SHA-256: `5750cf368879f47220cc54afc0e7b039ed9051ec06cbfb2af2931ef522ae0ca4`

`qualify-installed-native-markers.mjs` requires an absolute completed native-marker-clear evidence directory. It binds the current fixture to that run's hash-verified cleaned AVB before installing or editing. `qualify-native-marker-clear.mjs` retains its original invocation and additionally accepts an absolute installed entry, expected entry checksum and expected fixture baseline checksum. A changed baseline is refused rather than overwritten. Re-running requires evidence matching the fixture's current saved bytes.
