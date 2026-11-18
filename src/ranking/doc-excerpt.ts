import { readFileAt } from "../core/git.js";
import { JEV_MAX_DOC_EXCERPT_CHARS } from "./constants.js";

/**
 * Extract a bounded documentation excerpt around a finding line (1-based).
 * Falls back to the finding message when the file cannot be read.
 */
export function extractDocExcerpt(options: {
  cwd: string;
  head: string;
  docPath: string;
  line: number;
  fallback: string;
  maxChars?: number;
}): string {
  const maxChars = options.maxChars ?? JEV_MAX_DOC_EXCERPT_CHARS;
  const content = readFileAt(options.cwd, options.head, options.docPath);
  if (content === null) {
    return truncate(options.fallback, maxChars);
  }
  const lines = content.split("\n");
  const target = Math.max(1, options.line);
  const radius = 4;
  const start = Math.max(0, target - 1 - radius);
  const end = Math.min(lines.length, target + radius);
  const excerpt = lines.slice(start, end).join("\n").trim();
  if (!excerpt) {
    return truncate(options.fallback, maxChars);
  }
  return truncate(excerpt, maxChars);
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 14))}\n…[truncated]`;
}
