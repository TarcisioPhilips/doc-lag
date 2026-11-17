import { documentedCommand } from "../extractors/markdown-scripts.js";
import { jsonPointerForScript } from "../extractors/package-scripts.js";
import { makeFindingId } from "../findings/normalize.js";
import type { Finding, ScriptChange, ScriptInvocation } from "../types.js";

export const SCRIPTS_MISSING_RULE_ID = "scripts.missing";

function renameHint(change: ScriptChange): string | null {
  if (change.removed.length === 1 && change.added.length === 1) {
    return change.added[0];
  }
  return null;
}

export function evaluateScriptsMissing(
  changes: ScriptChange[],
  invocations: ScriptInvocation[],
): Finding[] {
  const findings: Finding[] = [];

  for (const change of changes) {
    if (change.removed.length === 0) {
      continue;
    }
    const possibleRename = renameHint(change);
    const removed = new Set(change.removed);

    for (const invocation of invocations) {
      if (!removed.has(invocation.script)) {
        continue;
      }
      const command = documentedCommand(invocation);
      const suggestion = possibleRename
        ? `The script may have been renamed to \`${possibleRename}\`. Update the documented command or restore the script.`
        : "Update the documented command or restore the script.";
      findings.push({
        id: makeFindingId({
          ruleId: SCRIPTS_MISSING_RULE_ID,
          path: invocation.path,
          line: invocation.line,
          name: invocation.script,
        }),
        ruleId: SCRIPTS_MISSING_RULE_ID,
        status: "confirmed",
        severity: "warning",
        message: `\`${command}\` is documented but no longer exists in ${change.path} scripts.`,
        documentation: { path: invocation.path, line: invocation.line },
        evidence: [
          {
            path: change.path,
            pointer: jsonPointerForScript(invocation.script),
            base: change.baseScripts[invocation.script] ?? null,
            head: change.headScripts[invocation.script] ?? null,
          },
        ],
        change: { path: change.path, kind: change.kind },
        suggestion,
      });
    }
  }

  return findings;
}
