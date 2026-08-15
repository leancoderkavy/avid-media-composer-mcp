#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const DEFAULT_SOURCE_URL = "https://kb.avid.com/pkb/articles/en_US/compatibility/en267087";

// This is an assertion-only snapshot. The checker must never modify source,
// docs, or release metadata; a human reviews any reported Avid change first.
const EXPECTED_MATRIX_ROWS = [
  {
    product: "Media Composer",
    releaseLine: "2025.12",
    latestPatch: "2025.12.2",
    latestReleaseDate: "April 7, 2026",
  },
];

function normalize(value) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createReport({ sourceUrl, body, source }) {
  // The Avid KB can return HTML or rendered text. Replace tags with whitespace
  // before matching so table cells do not concatenate into a false negative.
  const normalized = normalize(body.replace(/<[^>]*>/g, " "));
  const issues = [];
  if (!/Avid Media Composer Documentation and Version Matrix/i.test(normalized)) {
    issues.push("The source title is not the Avid Media Composer version matrix.");
  }
  if (!/Media Composer Version Matrix/i.test(normalized)) {
    issues.push("The source does not contain a Media Composer Version Matrix section.");
  }

  for (const expected of EXPECTED_MATRIX_ROWS) {
    const row = new RegExp(
      `\\b${escapeRegExp(expected.releaseLine)}\\b\\s*(?:\\||\\s)+` +
        `\\b${escapeRegExp(expected.latestPatch)}\\b\\s*(?:\\||\\s)+` +
        escapeRegExp(expected.latestReleaseDate),
      "i",
    );
    if (!row.test(normalized)) {
      issues.push(
        `${expected.product} ${expected.releaseLine} no longer matches the expected ` +
          `${expected.latestPatch} / ${expected.latestReleaseDate} matrix row.`,
      );
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    sourceUrl,
    source,
    contentSha256: createHash("sha256").update(body).digest("hex"),
    expected: EXPECTED_MATRIX_ROWS,
    status: issues.length === 0 ? "current" : "drift-detected",
    issues,
    action: "No repository files were changed. Review the official source and update product-scoped provenance manually.",
  };
}

async function readSource() {
  const contentFileIndex = process.argv.indexOf("--content-file");
  if (contentFileIndex >= 0) {
    const contentFile = process.argv[contentFileIndex + 1];
    if (!contentFile) throw new Error("--content-file requires a file path.");
    return { body: await readFile(contentFile, "utf8"), source: "local-fixture", sourceUrl: contentFile };
  }

  const sourceUrl = process.env.AVID_DOCUMENTATION_URL ?? DEFAULT_SOURCE_URL;
  const response = await fetch(sourceUrl, {
    headers: { "user-agent": "avid-media-composer-mcp-documentation-drift-check/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Avid documentation request failed with HTTP ${response.status}.`);
  return { body: await response.text(), source: "official-remote", sourceUrl };
}

try {
  const { body, source, sourceUrl } = await readSource();
  const report = createReport({ sourceUrl, body, source });
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "current") process.exitCode = 1;
} catch (error) {
  console.error(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        status: "check-failed",
        issues: [error instanceof Error ? error.message : String(error)],
        action: "No repository files were changed. Retry the official source check before changing compatibility data.",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
