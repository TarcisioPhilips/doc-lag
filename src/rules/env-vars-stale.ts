import { makeFindingId } from "../findings/normalize.js";
import type {
  EnvChange,
  EnvReference,
  Finding,
  FindingStatus,
} from "../types.js";

export const ENV_VARS_STALE_RULE_ID = "env.stale";

function statusForKind(kind: EnvReference["kind"]): FindingStatus {
  return kind === "assignment" || kind === "inline-code"
    ? "confirmed"
    : "needs-review";
}

function renameHint(change: EnvChange): string | null {
  if (change.removed.length === 1 && change.added.length === 1) {
    return change.added[0];
  }
  return null;
}

function messageForReference(
  reference: EnvReference,
  change: EnvChange,
  possibleRename: string | null,
): string {
  const displayKey = `\`${reference.key}\``;
  const baseDescription =
    reference.kind === "assignment"
      ? `${displayKey} is assigned in documentation`
      : `${displayKey} is referenced in documentation`;

  if (possibleRename) {
    return `${baseDescription} but was renamed to \`${possibleRename}\` in ${change.path}.`;
  }
  return `${baseDescription} but was removed from ${change.path}.`;
}

function suggestionForChange(
  reference: EnvReference,
  possibleRename: string | null,
): string {
  if (possibleRename) {
    return `The env var may have been renamed to \`${possibleRename}\`. Update the documentation or restore the original key.`;
  }
  return "Update the documentation to remove the reference or restore the env var.";
}

export function evaluateEnvVarsStale(
  changes: EnvChange[],
  references: EnvReference[],
): Finding[] {
  const findings: Finding[] = [];

  for (const change of changes) {
    if (change.removed.length === 0) {
      continue;
    }

    const removedSet = new Set(change.removed);
    const possibleRename = renameHint(change);

    for (const reference of references) {
      if (!removedSet.has(reference.key)) {
        continue;
      }

      findings.push({
        id: makeFindingId({
          ruleId: ENV_VARS_STALE_RULE_ID,
          path: reference.docPath,
          line: reference.line,
          name: reference.key,
        }),
        ruleId: ENV_VARS_STALE_RULE_ID,
        status: statusForKind(reference.kind),
        severity: "warning",
        message: messageForReference(reference, change, possibleRename),
        documentation: { path: reference.docPath, line: reference.line },
        evidence: [
          {
            path: change.path,
            pointer: `/env/${reference.key}`,
            base: reference.key,
            head: null,
          },
        ],
        change: { path: change.path, kind: change.kind },
        suggestion: suggestionForChange(reference, possibleRename),
      });
    }
  }

  return findings;
}
