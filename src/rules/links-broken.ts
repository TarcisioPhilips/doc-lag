import { buildPathChangeMap } from "../extractors/path-changes.js";
import { makeFindingId } from "../findings/normalize.js";
import type {
  Finding,
  FindingStatus,
  LocalLinkReference,
  PathChange,
} from "../types.js";

export const LINKS_BROKEN_RULE_ID = "links.broken";

function statusForKind(kind: LocalLinkReference["kind"]): FindingStatus {
  return kind === "inline-code" ? "needs-review" : "confirmed";
}

function messageForLink(
  reference: LocalLinkReference,
  change: PathChange,
): string {
  const displayLink =
    reference.kind === "inline-code"
      ? `\`${reference.targetPath}\``
      : `\`${reference.rawLink}\``;

  if (change.status === "renamed") {
    return `${displayLink} references a file that was renamed in this diff.`;
  }
  return `${displayLink} references a file that was deleted in this diff.`;
}

function suggestionForChange(change: PathChange): string {
  if (change.status === "renamed" && change.newPath) {
    return `The file was renamed to \`${change.newPath}\`. Update the link to point to the new path.`;
  }
  return "Remove the broken link or restore the referenced file.";
}

function normalizePathForLookup(targetPath: string): string {
  let normalized = targetPath;
  if (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function findMatchingChange(
  targetPath: string,
  changeMap: Map<string, PathChange>,
  baseFileSet: Set<string>,
): PathChange | null {
  const normalized = normalizePathForLookup(targetPath);

  const directChange = changeMap.get(normalized);
  if (directChange) {
    return directChange;
  }

  for (const [oldPath, change] of changeMap) {
    if (normalized.startsWith(oldPath + "/")) {
      return change;
    }
  }

  return null;
}

export function evaluateLinksBroken(
  references: LocalLinkReference[],
  changes: PathChange[],
  baseFiles: string[],
  headFiles: string[],
): Finding[] {
  const findings: Finding[] = [];
  const changeMap = buildPathChangeMap(changes);
  const baseFileSet = new Set(baseFiles);
  const headFileSet = new Set(headFiles);

  for (const reference of references) {
    const targetPath = normalizePathForLookup(reference.targetPath);

    const existedAtBase = baseFileSet.has(targetPath) ||
      [...baseFileSet].some((f) => f.startsWith(targetPath + "/"));
    if (!existedAtBase) {
      continue;
    }

    const existsAtHead = headFileSet.has(targetPath) ||
      [...headFileSet].some((f) => f.startsWith(targetPath + "/"));
    if (existsAtHead) {
      continue;
    }

    const change = findMatchingChange(targetPath, changeMap, baseFileSet);
    if (!change) {
      continue;
    }

    findings.push({
      id: makeFindingId({
        ruleId: LINKS_BROKEN_RULE_ID,
        path: reference.docPath,
        line: reference.line,
        name: reference.targetPath,
      }),
      ruleId: LINKS_BROKEN_RULE_ID,
      status: statusForKind(reference.kind),
      severity: "warning",
      message: messageForLink(reference, change),
      documentation: {
        path: reference.docPath,
        line: reference.line,
      },
      evidence: [
        {
          path: change.oldPath,
          pointer: change.newPath ? `renamed → ${change.newPath}` : "deleted",
          base: change.oldPath,
          head: change.newPath ?? null,
        },
      ],
      change: {
        path: change.oldPath,
        kind: change.status === "renamed" ? "renamed" : "deleted",
      },
      suggestion: suggestionForChange(change),
    });
  }

  return findings;
}
