# Release checklist

Use separate evidence states for local validation, merge, npm publication, deployment, authenticated
verification, and real Media Composer validation. A later state must identify the exact commit.

## Release candidate

1. Confirm the worktree contains no unrelated files and `HEAD` is based on current `origin/main`.
2. Run root and landing dependency audits, `npm run check`, landing lint/build, and `git diff --check`.
3. Push a pull request and require the Windows/macOS Node 20/24 matrix, landing job, and CodeQL.
4. Merge without bypassing checks, then verify remote `main` contains the reviewed SHA.
5. Publish the version declared in `package.json` with npm provenance under `next`. Verify the
   version does not already exist and that trusted publishing is bound to user `leancoderkavy`,
   repository `avid-media-composer-mcp`, workflow `npm-publish.yml`, and environment `npm`. Do not
   restore a long-lived publisher token when OIDC is available.
6. Install `avid-media-composer-mcp@next` in clean Windows and macOS environments and call
   `avid_ping` plus tool discovery.
7. Deploy the exact merged SHA to Fly, Vercel, and GitHub Pages; verify canonical aliases, headers,
   unauthenticated `401`, authenticated MCP discovery, and production telemetry receipt.

## Stable 1.0

1. Promote only after the release-candidate install and production checks pass.
2. Change package, lockfile, changelog, README, and landing metadata from the verified release
   candidate to `1.0.0`/`latest`.
3. Repeat every required check on the final commit and merge through protected `main`.
4. Publish with provenance under `latest`, create the matching GitHub release/tag, and verify both
   `npm view avid-media-composer-mcp@1.0.0 version` and the `latest` distribution tag.
5. Recheck production aliases, remote `main`, CI, CodeQL, open pull requests, and npm metadata.

## Explicit non-gates

- Avid Extension SDK access is not available and does not block the read-only 1.0 release.
- The 167-action catalog is not live support evidence.
- Search indexing, revenue, MediaCentral, Media Toolkit, NEXIS, and advanced QC remain separate work.
- SDK onboarding, redistribution permission, Extension signing, and qualified-host execution are
  external gates; repository completion must not mark them done without retained evidence.
- Follow `REAL_HOST_VALIDATION.md` before advertising any action as live-editing support.
