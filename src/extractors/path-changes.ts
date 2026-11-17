import { diffNameStatus, type DiffEntry } from "../core/git.js";
import type { PathChange } from "../types.js";

export function extractPathChanges(
  cwd: string,
  base: string,
  head: string,
): PathChange[] {
  const entries = diffNameStatus(cwd, base, head);
  const changes: PathChange[] = [];

  for (const entry of entries) {
    if (entry.status === "deleted") {
      changes.push({
        oldPath: entry.path,
        status: "deleted",
      });
    } else if (entry.status === "renamed" && entry.previousPath) {
      changes.push({
        oldPath: entry.previousPath,
        newPath: entry.path,
        status: "renamed",
      });
    }
  }

  return changes;
}

export function buildPathChangeMap(changes: PathChange[]): Map<string, PathChange> {
  const map = new Map<string, PathChange>();
  for (const change of changes) {
    map.set(change.oldPath, change);
  }
  return map;
}
