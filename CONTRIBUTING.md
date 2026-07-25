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
