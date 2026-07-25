import { AvidMcpError } from "../errors.js";
import { decodeTextFile } from "./text.js";

export interface AleAnalysis {
  path: string;
  encoding: string;
  headings: Record<string, string>;
  columns: string[];
  rows: Record<string, string>[];
  rowCount: number;
  warnings: string[];
  sourceTruncated: boolean;
}

function splitTabs(line: string): string[] {
  return line.split("\t").map((value) => value.trim());
}

export async function analyzeAle(filePath: string, maxBytes = 16 * 1024 * 1024): Promise<AleAnalysis> {
  const decoded = await decodeTextFile(filePath, maxBytes);
  if (decoded.text === undefined) {
    throw new AvidMcpError("ALE_NOT_TEXT", "ALE file could not be decoded as text", {
      path: filePath,
      encoding: decoded.encoding,
    });
  }

  const headings: Record<string, string> = {};
  const columns: string[] = [];
  const rows: Record<string, string>[] = [];
  const warnings: string[] = [];
  let section: "none" | "heading" | "column" | "data" = "none";

  for (const rawLine of decoded.text.split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, "");
    const marker = line.trim().toLowerCase();
    if (marker === "heading") {
      section = "heading";
      continue;
    }
    if (marker === "column") {
      section = "column";
      continue;
    }
    if (marker === "data") {
      section = "data";
      continue;
    }
    if (!line.trim()) continue;

    if (section === "heading") {
      const [key, ...rest] = splitTabs(line);
      if (!key) continue;
      if (Object.hasOwn(headings, key)) warnings.push(`Duplicate heading: ${key}`);
      headings[key] = rest.join("\t");
      continue;
    }
    if (section === "column") {
      if (columns.length === 0) {
        columns.push(...splitTabs(line));
      } else {
        warnings.push(`Ignored additional Column line: ${line}`);
      }
      continue;
    }
    if (section === "data") {
      if (columns.length === 0) {
        throw new AvidMcpError("ALE_COLUMNS_MISSING", "ALE Data section appeared before columns", {
          path: filePath,
        });
      }
      const values = splitTabs(line);
      const row: Record<string, string> = {};
      for (let index = 0; index < columns.length; index += 1) {
        const column = columns[index];
        if (column) row[column] = values[index] ?? "";
      }
      if (values.length > columns.length) {
        row.__extra = values.slice(columns.length).join("\t");
        warnings.push(`Row ${rows.length + 1} has ${values.length - columns.length} extra value(s)`);
      }
      rows.push(row);
    }
  }

  if (columns.length === 0) {
    throw new AvidMcpError("ALE_COLUMNS_MISSING", "No ALE Column section was found", {
      path: filePath,
    });
  }
  if (!headings.FIELD_DELIM) {
    warnings.push("FIELD_DELIM heading is absent");
  } else if (headings.FIELD_DELIM.toUpperCase() !== "TABS") {
    warnings.push(`FIELD_DELIM '${headings.FIELD_DELIM}' is not fully supported; parsed as tabs`);
  }

  return {
    path: filePath,
    encoding: decoded.encoding,
    headings,
    columns,
    rows,
    rowCount: rows.length,
    warnings,
    sourceTruncated: decoded.truncated,
  };
}
