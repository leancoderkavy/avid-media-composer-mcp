# Media Composer Extension bridge contract

Protocol version: `1`

This contract is ready for an `.avpi` Media Composer Extension built with the sanctioned Extensions SDK. It does not reverse engineer `avid-api-gateway` and does not include proprietary SDK material.

## Directory layout

Set `AVID_MCP_BRIDGE_DIR` to a local, same-user directory shared by the MCP process and extension:

```text
state/capabilities.json
requests/<operation-id>.json
responses/<operation-id>.json
```

The MCP uses atomic rename for requests. The extension should do the same for capability and response documents.

## Capability heartbeat

The extension rewrites `state/capabilities.json` at least every 10 seconds:

```json
{
  "protocolVersion": 1,
  "extensionVersion": "0.1.0",
  "mediaComposerVersion": "2025.12",
  "sessionId": "d88ed40e-e967-41f0-928f-3190a8a9b57f",
  "heartbeatAt": "2026-07-25T22:00:00.000Z",
  "supportedActions": ["inspect.getState", "edit.applyPlan"],
  "supportedEditOperations": ["bin.create", "bin.rename", "timeline.spliceIn"],
  "project": {
    "id": "avid-project-id",
    "name": "Episode_101",
    "path": "D:\\Avid Projects\\Episode_101"
  }
}
```

The MCP considers the bridge disconnected after 15 seconds without a heartbeat. A version match alone is not health evidence.

## Inspection request

```json
{
  "protocolVersion": 1,
  "operationId": "uuid",
  "createdAt": "2026-07-25T22:00:01.000Z",
  "action": "inspect.getState",
  "payload": {
    "scope": "full",
    "options": {}
  }
}
```

The extension should return stable identities, not UI row numbers, whenever the SDK provides them. A full state should distinguish:

- application/version/license/features;
- current user and workspace;
- project identity, path, format, rate, raster, color space, film settings;
- open/closed/locked bins;
- bin items with mob IDs and media state;
- sequences, tracks, segments, transitions, effects, keyframes, markers;
- source/record monitors, marks, playhead, track patches/targets/locks;
- media creation, render, import, export, audio, color, and site/user/project settings;
- current selection and modal/busy state.

## Edit request

```json
{
  "protocolVersion": 1,
  "operationId": "uuid",
  "createdAt": "2026-07-25T22:00:02.000Z",
  "action": "edit.applyPlan",
  "payload": {
    "confirmationToken": "64-character-sha256",
    "plan": {
      "projectId": "avid-project-id",
      "allowDestructive": false,
      "operations": [
        {
          "action": "bin.create",
          "arguments": { "name": "Selects" },
          "expectedState": { "projectId": "avid-project-id" }
        }
      ]
    }
  }
}
```

Before mutation, the extension must:

1. verify the active project;
2. reject unsupported operations;
3. reject modal/busy state;
4. revalidate every `expectedState`;
5. reject locked/shared-bin writes not owned by the current editor;
6. resolve all stable targets before applying the first mutation;
7. create an undo group when the SDK supports it;
8. stop on the first failure and report partial-apply evidence explicitly.

## Response

```json
{
  "protocolVersion": 1,
  "operationId": "uuid",
  "completedAt": "2026-07-25T22:00:03.000Z",
  "ok": true,
  "data": {
    "applied": 1,
    "results": [
      {
        "index": 0,
        "action": "bin.create",
        "targetId": "new-bin-id",
        "verified": true
      }
    ],
    "postStateRevision": "revision-id"
  }
}
```

Failure responses use:

```json
{
  "protocolVersion": 1,
  "operationId": "uuid",
  "completedAt": "2026-07-25T22:00:03.000Z",
  "ok": false,
  "error": {
    "code": "EXPECTED_STATE_MISMATCH",
    "message": "The active sequence changed after preview",
    "details": {}
  }
}
```

## Security boundary

The bridge is local and inherits the operating-system user boundary, like other local stdio creative-tool MCPs. The mailbox directory must not be shared across untrusted users. A future remote transport requires authentication, origin validation, replay protection, request signing, and a separate threat review.
