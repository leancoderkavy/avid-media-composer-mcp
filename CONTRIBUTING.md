# Contributing

Contributions are welcome, especially:

- real-world read-only fixture coverage that can legally be shared;
- parser correctness and bounded-output improvements;
- Media Composer Extension work from developers with lawful SDK access;
- operation-by-operation compatibility evidence;
- source-safe media QC.

## Ground rules

- Do not commit proprietary Avid SDK files, credentials, customer media, project data, or personally identifying metadata.
- Do not add claims of support without a fixture, test, and version record.
- Keep source media immutable by default.
- Preserve lock and expected-state checks.
- New mutations need a catalog risk rating, capability boundary, preview path, post-state verification, and tests.
- Raw script or arbitrary UI automation proposals require a separate threat review.

## Checks

```powershell
npm install
npm run python:setup
npm run check
```

Use small synthetic fixtures or documented, redistributable samples.

## Before opening a pull request

1. Open or reference a structured issue unless the change is a small documentation correction.
2. Keep each pull request focused on one behavior or risk.
3. Add success and failure-path tests.
4. Run `npm run check` and include the result in the pull request.
5. Complete the source-safety checklist in the pull request template.

Maintainers use CodeQL, dependency review, npm audit, protected-branch checks, and CODEOWNERS review for security-sensitive paths. Automated checks are evidence of passing gates, not proof of live Media Composer behavior.

## Security reports and support

- Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/leancoderkavy/avid-media-composer-mcp/security/advisories/new).
- Use [GitHub Discussions](https://github.com/leancoderkavy/avid-media-composer-mcp/discussions) for setup and usage questions.
- See [SUPPORT.md](SUPPORT.md) for the support boundary.
