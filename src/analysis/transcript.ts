import { AvidMcpError } from "../errors.js";

export interface TranscriptTokenInput {
  text: string;
  startSeconds: number;
  endSeconds: number;
  speaker?: string;
  confidence?: number;
}

export interface TranscriptRevisionInput {
  id?: string;
  tokens: readonly TranscriptTokenInput[];
}

export interface TranscriptQcOptions {
  gapThresholdSeconds?: number;
  maxComparisonCells?: number;
}

export interface TranscriptTimingIssue {
  kind: "gap" | "overlap" | "invalid-duration";
  tokenIndex: number;
  durationSeconds: number;
}

export interface TranscriptQc {
  tokenCount: number;
  gapCount: number;
  overlapCount: number;
  invalidDurationCount: number;
  lowConfidenceCount: number;
  speakerLabelCount: number;
  timingIssues: TranscriptTimingIssue[];
  privacy: string;
}

export interface TranscriptRevisionComparison {
  baseline: TranscriptQc;
  candidate: TranscriptQc;
  commonTokenCount: number;
  insertedTokenCount: number;
  removedTokenCount: number;
  timingChangedTokenCount: number;
  speakerChangedTokenCount: number;
  privacy: string;
}

const DEFAULT_GAP_THRESHOLD_SECONDS = 0.5;
const DEFAULT_MAX_COMPARISON_CELLS = 1_000_000;

function normalizedText(text: string): string {
  return text.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function validateToken(token: TranscriptTokenInput, index: number): void {
  if (!normalizedText(token.text)) {
    throw new AvidMcpError("TRANSCRIPT_TOKEN_TEXT_INVALID", "Transcript token text must be non-empty", { index });
  }
  if (!Number.isFinite(token.startSeconds) || !Number.isFinite(token.endSeconds) || token.startSeconds < 0) {
    throw new AvidMcpError("TRANSCRIPT_TOKEN_TIMING_INVALID", "Transcript token timing must be finite and non-negative", { index });
  }
  if (token.confidence !== undefined && (!Number.isFinite(token.confidence) || token.confidence < 0 || token.confidence > 1)) {
    throw new AvidMcpError("TRANSCRIPT_CONFIDENCE_INVALID", "confidence must be between zero and one", { index });
  }
}

/** Runs in memory and deliberately returns no transcript text. */
export function inspectTranscriptRevision(
  revision: TranscriptRevisionInput,
  options: TranscriptQcOptions = {},
): TranscriptQc {
  const gapThreshold = options.gapThresholdSeconds ?? DEFAULT_GAP_THRESHOLD_SECONDS;
  if (!Number.isFinite(gapThreshold) || gapThreshold < 0) {
    throw new AvidMcpError("TRANSCRIPT_GAP_THRESHOLD_INVALID", "gapThresholdSeconds must be finite and non-negative");
  }
  const issues: TranscriptTimingIssue[] = [];
  const speakers = new Set<string>();
  let lowConfidenceCount = 0;
  for (const [index, token] of revision.tokens.entries()) {
    validateToken(token, index);
    if (token.speaker?.trim()) speakers.add(token.speaker.trim());
    if (token.confidence !== undefined && token.confidence < 0.6) lowConfidenceCount += 1;
    if (token.endSeconds < token.startSeconds) {
      issues.push({ kind: "invalid-duration", tokenIndex: index, durationSeconds: token.endSeconds - token.startSeconds });
    }
    if (index > 0) {
      const previous = revision.tokens[index - 1];
      if (previous) {
        const separation = token.startSeconds - previous.endSeconds;
        if (separation >= gapThreshold) issues.push({ kind: "gap", tokenIndex: index, durationSeconds: separation });
        if (separation < 0) issues.push({ kind: "overlap", tokenIndex: index, durationSeconds: Math.abs(separation) });
      }
    }
  }
  return {
    tokenCount: revision.tokens.length,
    gapCount: issues.filter((issue) => issue.kind === "gap").length,
    overlapCount: issues.filter((issue) => issue.kind === "overlap").length,
    invalidDurationCount: issues.filter((issue) => issue.kind === "invalid-duration").length,
    lowConfidenceCount,
    speakerLabelCount: speakers.size,
    timingIssues: issues,
    privacy: "Processed locally in memory; transcript text is never included in this result.",
  };
}

function lcsPairs(left: readonly TranscriptTokenInput[], right: readonly TranscriptTokenInput[]): Array<[number, number]> {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const table = Array.from({ length: rows }, () => new Uint32Array(columns));
  for (let leftIndex = 1; leftIndex < rows; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex < columns; rightIndex += 1) {
      if (normalizedText(left[leftIndex - 1]?.text ?? "") === normalizedText(right[rightIndex - 1]?.text ?? "")) {
        table[leftIndex]![rightIndex] = (table[leftIndex - 1]?.[rightIndex - 1] ?? 0) + 1;
      } else {
        table[leftIndex]![rightIndex] = Math.max(table[leftIndex - 1]?.[rightIndex] ?? 0, table[leftIndex]?.[rightIndex - 1] ?? 0);
      }
    }
  }
  const pairs: Array<[number, number]> = [];
  let leftIndex = left.length;
  let rightIndex = right.length;
  while (leftIndex > 0 && rightIndex > 0) {
    if (normalizedText(left[leftIndex - 1]?.text ?? "") === normalizedText(right[rightIndex - 1]?.text ?? "")) {
      pairs.push([leftIndex - 1, rightIndex - 1]);
      leftIndex -= 1;
      rightIndex -= 1;
    } else if ((table[leftIndex - 1]?.[rightIndex] ?? 0) >= (table[leftIndex]?.[rightIndex - 1] ?? 0)) {
      leftIndex -= 1;
    } else {
      rightIndex -= 1;
    }
  }
  return pairs.reverse();
}

export function compareTranscriptRevisions(
  baseline: TranscriptRevisionInput,
  candidate: TranscriptRevisionInput,
  options: TranscriptQcOptions = {},
): TranscriptRevisionComparison {
  const baselineQc = inspectTranscriptRevision(baseline, options);
  const candidateQc = inspectTranscriptRevision(candidate, options);
  const maxCells = options.maxComparisonCells ?? DEFAULT_MAX_COMPARISON_CELLS;
  if (!Number.isSafeInteger(maxCells) || maxCells < 1) {
    throw new AvidMcpError("TRANSCRIPT_COMPARISON_LIMIT_INVALID", "maxComparisonCells must be a positive integer");
  }
  if ((baseline.tokens.length + 1) * (candidate.tokens.length + 1) > maxCells) {
    throw new AvidMcpError("TRANSCRIPT_COMPARISON_LIMIT_EXCEEDED", "Transcript comparison exceeds the configured bounded-work limit", {
      baselineTokens: baseline.tokens.length,
      candidateTokens: candidate.tokens.length,
      maxComparisonCells: maxCells,
    });
  }
  const matches = lcsPairs(baseline.tokens, candidate.tokens);
  let timingChangedTokenCount = 0;
  let speakerChangedTokenCount = 0;
  for (const [baselineIndex, candidateIndex] of matches) {
    const before = baseline.tokens[baselineIndex];
    const after = candidate.tokens[candidateIndex];
    if (!before || !after) continue;
    if (before.startSeconds !== after.startSeconds || before.endSeconds !== after.endSeconds) timingChangedTokenCount += 1;
    if ((before.speaker?.trim() ?? "") !== (after.speaker?.trim() ?? "")) speakerChangedTokenCount += 1;
  }
  return {
    baseline: baselineQc,
    candidate: candidateQc,
    commonTokenCount: matches.length,
    insertedTokenCount: candidate.tokens.length - matches.length,
    removedTokenCount: baseline.tokens.length - matches.length,
    timingChangedTokenCount,
    speakerChangedTokenCount,
    privacy: "Compared locally in memory; results contain aggregate counts and timing diagnostics, never transcript text.",
  };
}
