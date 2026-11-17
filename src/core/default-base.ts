import { ScanError } from "../errors.js";
import { git, resolveRef } from "./git.js";

/** Preferred upstream branch names, tried in order. */
const DEFAULT_BASE_CANDIDATES = [
  "origin/main",
  "main",
  "origin/master",
  "master",
] as const;

/**
 * Resolve a sensible default base: merge-base of HEAD (or `head`) with
 * origin/main, main, origin/master, or master — whichever exists first.
 */
export function resolveDefaultBase(cwd: string, head = "HEAD"): string {
  const headSha = resolveRef(cwd, head);
  const tried: string[] = [];

  for (const candidate of DEFAULT_BASE_CANDIDATES) {
    try {
      resolveRef(cwd, candidate);
    } catch {
      tried.push(candidate);
      continue;
    }
    try {
      return git(cwd, ["merge-base", candidate, headSha]).trim();
    } catch {
      tried.push(candidate);
    }
  }

  throw new ScanError(
    `Could not determine a default base ref (tried: ${tried.join(", ") || "none"}). ` +
      `Pass base explicitly (for example, main or origin/main).`,
  );
}
