# Media Composer Extension bridge contract

Protocol version: `3`

This is a local mailbox contract for a future Media Composer Extension made with Avid's sanctioned Extensions SDK. It does not ship an extension, reverse engineer Avid APIs, or establish real-host support.

## Security and installation boundary

Set `AVID_MCP_BRIDGE_DIR` to a same-user local directory. Set `AVID_MCP_BRIDGE_AUTH_SECRET` to a unique secret of at least 32 characters in both the MCP and the Extension's protected configuration; optionally set the matching `AVID_MCP_BRIDGE_AUTH_KEY_ID`. The MCP does not persist, log, return, or package that secret. A missing or invalid secret leaves the bridge disconnected.

```text
state/capabilities.json
requests/<operation-id>.json
responses/<operation-id>.json
```

All documents are JSON. Publish capability, request, and response documents by writing a same-directory temporary file with exclusive creation and atomically renaming it into place. Mailbox directories and files must be real paths, not symbolic links or junctions. Do not share the directory, secret, or process account with another user.

V3 deliberately rejects v1 and v2 documents: their unauthenticated shape is not a safe compatibility fallback.

## Authenticated envelopes and negotiation

Every document carries an `authentication` object:

```json
{
  "algorithm": "hmac-sha256",
  "keyId": "studio-workstation-7",
  "nonce": "7d4c115c-2e1e-4c82-9f16-e9c4c5dd3026",
  "signedAt": "2026-08-15T22:00:00.000Z",
  "signature": "base64url-hmac-sha256"
}
```

The signature is HMAC-SHA-256 over canonical JSON for the complete document with only `authentication.signature` omitted: object keys are UTF-16 code-unit sorted, arrays retain order, and primitives use JSON serialization. `signedAt` must be within 60 seconds of the verifier clock. The Extension must reject a request with an expired `expiresAt`, unknown key ID, invalid signature, reused nonce, or a non-increasing `requestSequence` within a `clientSessionId`.

The Extension advertises `supportedProtocolVersions`; the MCP connects only where that list includes 3 and records `negotiatedProtocolVersion: 3`. No lower-version downgrade is attempted.

## Capability heartbeat

The Extension atomically rewrites `state/capabilities.json` at least every ten seconds. Its identity fields distinguish an extension build, a local installation, and a running host session. `stateRevision`, when available, binds previews and edits to observed host state.

```json
{
  "protocolVersion": 3,
  "supportedProtocolVersions": [3],
  "extensionId": "com.example.avid-mcp",
  "installationId": "workstation-7-installation",
  "extensionVersion": "0.3.0",
  "mediaComposerVersion": "2025.12.1",
  "platform": "windows",
  "operatingSystemVersion": "Windows 11 24H2",
  "architecture": "x64",
  "sessionId": "d88ed40e-e967-41f0-928f-3190a8a9b57f",
  "heartbeatAt": "2026-08-15T22:00:00.000Z",
  "stateRevision": "state-1042",
  "supportedActions": ["inspect.getState", "edit.applyPlan"],
  "supportedEditOperations": ["bin.create"],
  "project": { "id": "avid-project-id", "name": "Episode_101" },
  "authentication": { "algorithm": "hmac-sha256", "keyId": "studio-workstation-7", "nonce": "7d4c115c-2e1e-4c82-9f16-e9c4c5dd3026", "signedAt": "2026-08-15T22:00:00.000Z", "signature": "base64url-hmac-sha256" }
}
```

The MCP considers a bridge disconnected after 15 seconds without a valid heartbeat, a valid HMAC, and a qualified Media Composer/platform/architecture combination. A version match alone is not health or feature evidence.

## Requests and responses

Each request contains a unique `operationId`, `nonce`, `clientSessionId`, strictly increasing `requestSequence`, creation and expiry times, and an authenticated payload. The response must echo `operationId`, `clientSessionId`, `requestSequence`, and `requestNonce`; the MCP rejects an unsigned, mismatched, stale, symlinked, or malformed response as invalid/replayed.

```json
{
  "protocolVersion": 3,
  "operationId": "5dbb7cc7-02e3-442d-a940-2de01c0ac899",
  "clientSessionId": "b18a5a75-037a-43eb-90c5-29995a2650af",
  "requestSequence": 4,
  "nonce": "06ba2571-9560-4e1b-a248-5c3851d70a69",
  "createdAt": "2026-08-15T22:00:01.000Z",
  "expiresAt": "2026-08-15T22:00:31.000Z",
  "action": "inspect.getState",
  "payload": { "scope": "summary", "options": {} },
  "authentication": { "algorithm": "hmac-sha256", "keyId": "studio-workstation-7", "nonce": "95655a43-18ad-4c9c-902e-b1d38668158d", "signedAt": "2026-08-15T22:00:01.000Z", "signature": "base64url-hmac-sha256" }
}
```

For `edit.applyPlan`, the MCP sends the exact confirmation token plus `bridgePrecondition` containing the connected installation ID, host session ID, optional state revision, and active project ID. Before a mutation, the Extension must validate this binding, the active project, all expected-state guards, supported actions, modal/busy state, and shared-bin ownership. It must create an undo group where supported, stop at the first failure, and return per-operation and post-state evidence. The MCP refuses live edits that lack an `expectedState` guard.

Successful inspection responses carry a bounded `stateRevision`; edit responses carry `preStateRevision`, `postStateRevision` after any mutation, and exact per-operation evidence. The established data schemas for inspection and edit results remain unchanged apart from the authenticated response envelope.

## Operational limits

The MCP reserves an operation ID before atomically publishing its request, so concurrent duplicate IDs fail closed. The Extension should retain a bounded, durable nonce and sequence ledger for at least the maximum command timeout plus clock skew, scoped by `clientSessionId`, before processing a request. A clean Extension restart may establish a new host `sessionId`; this invalidates any previously previewed host-state binding and must be surfaced to the user.
