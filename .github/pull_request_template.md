## Summary

Describe the problem and the smallest change that solves it.

## Security and source safety

- [ ] This change does not commit credentials, private project data, customer media, or proprietary Avid SDK files.
- [ ] Filesystem access remains within configured allowed roots.
- [ ] Source media and offline AVB/AAF inputs remain read-only.
- [ ] New mutations include capability checks, risk classification, preview, confirmation, post-state verification, and tests.
- [ ] User-controlled data is bounded and is never executed as code or a shell command.

## Validation

- [ ] `npm run check`
- [ ] Tests cover success and failure paths.
- [ ] Documentation and compatibility claims match demonstrated behavior.

## Evidence

List fixtures, test output, supported Media Composer versions, and any live-host validation. Do not include sensitive project data.
