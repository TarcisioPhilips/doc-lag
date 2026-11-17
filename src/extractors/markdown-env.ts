import type { EnvReference, EnvReferenceKind } from "../types.js";

const ENV_KEY_PATTERN = /[A-Z][A-Z0-9_]{2,}/g;
const ASSIGNMENT_PATTERN = /^([A-Z][A-Z0-9_]{2,})\s*=/;
const INLINE_CODE = /`([^`]+)`/g;
const TABLE_CELL_PATTERN = /\|[^|]*\|/g;

function isLikelyEnvKey(candidate: string): boolean {
  if (candidate.length < 3 || candidate.length > 100) {
    return false;
  }
  if (!/^[A-Z][A-Z0-9_]+$/.test(candidate)) {
    return false;
  }
  const commonNonEnv = new Set([
    "API",
    "URL",
    "SQL",
    "CSS",
    "HTML",
    "JSON",
    "HTTP",
    "HTTPS",
    "POST",
    "GET",
    "PUT",
    "DELETE",
    "README",
    "TODO",
    "NOTE",
    "WARNING",
    "ERROR",
    "INFO",
    "DEBUG",
    "TRUE",
    "FALSE",
    "NULL",
    "AND",
    "OR",
    "NOT",
    "THE",
    "FOR",
  ]);
  if (commonNonEnv.has(candidate)) {
    return false;
  }
  return true;
}

function extractFromCodeBlock(
  line: string,
  lineNumber: number,
  docPath: string,
): EnvReference[] {
  const results: EnvReference[] = [];
  const trimmed = line.trim();

  const assignmentMatch = ASSIGNMENT_PATTERN.exec(trimmed);
  if (assignmentMatch) {
    const key = assignmentMatch[1];
    if (isLikelyEnvKey(key)) {
      results.push({
        docPath,
        line: lineNumber,
        key,
        raw: trimmed,
        kind: "assignment",
      });
    }
  }

  return results;
}

function extractFromInlineCode(
  line: string,
  lineNumber: number,
  docPath: string,
): EnvReference[] {
  const results: EnvReference[] = [];
  INLINE_CODE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = INLINE_CODE.exec(line)) !== null) {
    const content = match[1].trim();

    const assignmentMatch = ASSIGNMENT_PATTERN.exec(content);
    if (assignmentMatch) {
      const key = assignmentMatch[1];
      if (isLikelyEnvKey(key)) {
        results.push({
          docPath,
          line: lineNumber,
          key,
          raw: match[0],
          kind: "assignment",
        });
        continue;
      }
    }

    if (isLikelyEnvKey(content)) {
      results.push({
        docPath,
        line: lineNumber,
        key: content,
        raw: match[0],
        kind: "inline-code",
      });
    }
  }

  return results;
}

function extractFromTableCell(
  line: string,
  lineNumber: number,
  docPath: string,
): EnvReference[] {
  const results: EnvReference[] = [];

  if (!line.includes("|")) {
    return results;
  }

  const separatorPattern = /^\s*\|?\s*[-:]+\s*\|/;
  if (separatorPattern.test(line)) {
    return results;
  }

  TABLE_CELL_PATTERN.lastIndex = 0;
  let cellMatch: RegExpExecArray | null;
  const seenKeys = new Set<string>();

  while ((cellMatch = TABLE_CELL_PATTERN.exec(line)) !== null) {
    const cellContent = cellMatch[0].slice(1, -1).trim();

    if (INLINE_CODE.test(cellContent)) {
      continue;
    }

    ENV_KEY_PATTERN.lastIndex = 0;
    let keyMatch: RegExpExecArray | null;

    while ((keyMatch = ENV_KEY_PATTERN.exec(cellContent)) !== null) {
      const candidate = keyMatch[0];
      if (isLikelyEnvKey(candidate) && !seenKeys.has(candidate)) {
        seenKeys.add(candidate);
        results.push({
          docPath,
          line: lineNumber,
          key: candidate,
          raw: cellContent,
          kind: "table-cell",
        });
      }
    }
  }

  return results;
}

export function extractEnvReferences(
  markdown: string,
  docPath: string,
): EnvReference[] {
  const references: EnvReference[] = [];
  const lines = markdown.split(/\r?\n/);

  let inCodeBlock = false;
  let codeBlockLang = "";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;

    if (/^```/.test(line.trim())) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = line.trim().slice(3).trim().toLowerCase();
      } else {
        inCodeBlock = false;
        codeBlockLang = "";
      }
      continue;
    }

    if (inCodeBlock) {
      const isEnvLikeBlock =
        codeBlockLang === "" ||
        codeBlockLang === "bash" ||
        codeBlockLang === "shell" ||
        codeBlockLang === "sh" ||
        codeBlockLang === "env" ||
        codeBlockLang === "dotenv" ||
        codeBlockLang === "text" ||
        codeBlockLang === "plaintext";

      if (isEnvLikeBlock) {
        references.push(...extractFromCodeBlock(line, lineNumber, docPath));
      }
      continue;
    }

    references.push(...extractFromInlineCode(line, lineNumber, docPath));

    references.push(...extractFromTableCell(line, lineNumber, docPath));
  }

  return references;
}
