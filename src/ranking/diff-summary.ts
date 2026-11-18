import { diffNameStatus, git } from "../core/git.js";
import { JEV_MAX_DIFF_SUMMARY_CHARS } from "./constants.js";

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 14))}\n…[truncated]`;
}

/**
 * Build a compact PR diff summary for Jev `state.pr_diff_summary`.
 * Prefer name-status + shortstat; fall back to a truncated unified diff.
 */
export function buildPrDiffSummary(
  cwd: string,
  base: string,
  head: string,
  maxChars: number = JEV_MAX_DIFF_SUMMARY_CHARS,
): string {
  const entries = diffNameStatus(cwd, base, head);
  const lines: string[] = [];
  for (const entry of entries) {
    if (entry.previousPath) {
      lines.push(`${entry.status}\t${entry.previousPath} → ${entry.path}`);
    } else {
      lines.push(`${entry.status}\t${entry.path}`);
    }
  }

  let shortstat = "";
  try {
    shortstat = git(cwd, ["diff", "--shortstat", base, head]).trim();
  } catch {
    shortstat = "";
  }

  const header = [
    `Changed paths (${entries.length}):`,
    ...lines,
    shortstat ? `Stats: ${shortstat}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (header.length >= maxChars) {
    return truncate(header, maxChars);
  }

  const remaining = maxChars - header.length - 16;
  if (remaining < 200) {
    return header;
  }

  let unified = "";
  try {
    unified = git(cwd, [
      "diff",
      "--unified=2",
      "--no-color",
      base,
      head,
    ]);
  } catch {
    return header;
  }

  return `${header}\n\nDiff excerpt:\n${truncate(unified, remaining)}`;
}
