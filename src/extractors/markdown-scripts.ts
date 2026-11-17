import type { ScriptInvocation } from "../types.js";

const RUN_INVOCATION =
  /\b(npm|pnpm|yarn|bun)\s+run(?:\s+(?:--silent|-s))*\s+["']?([A-Za-z0-9:_-]+)["']?/g;
const SHORT_INVOCATION = /\b(pnpm|yarn)\s+(?!run\b)["']?([A-Za-z0-9:_-]+)["']?/g;

function collect(
  regex: RegExp,
  line: string,
  path: string,
  lineNumber: number,
  form: ScriptInvocation["form"],
): ScriptInvocation[] {
  const results: ScriptInvocation[] = [];
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(line)) !== null) {
    results.push({
      path,
      line: lineNumber,
      manager: match[1] as ScriptInvocation["manager"],
      form,
      script: match[2],
      raw: match[0].trim(),
    });
  }
  return results;
}

export function extractScriptInvocations(
  markdown: string,
  path: string,
): ScriptInvocation[] {
  const invocations: ScriptInvocation[] = [];
  const lines = markdown.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    invocations.push(...collect(RUN_INVOCATION, line, path, lineNumber, "run"));
    invocations.push(...collect(SHORT_INVOCATION, line, path, lineNumber, "short"));
  }
  return invocations;
}

export function documentedCommand(invocation: ScriptInvocation): string {
  if (invocation.form === "run") {
    return `${invocation.manager} run ${invocation.script}`;
  }
  return `${invocation.manager} ${invocation.script}`;
}
