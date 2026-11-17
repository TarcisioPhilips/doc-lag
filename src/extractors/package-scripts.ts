import { readFileAt } from "../core/git.js";
import { ScanError } from "../errors.js";
import type { ChangeKind, ScriptChange, ScriptSnapshot } from "../types.js";

function parseScripts(raw: string, filePath: string, ref: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ScanError(`Invalid JSON in ${filePath} at ${ref}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  const scripts = (parsed as { scripts?: unknown }).scripts;
  if (scripts === null || typeof scripts !== "object" || Array.isArray(scripts)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(scripts as Record<string, unknown>)) {
    if (typeof value === "string") {
      result[name] = value;
    }
  }
  return result;
}

export function readScriptSnapshot(
  cwd: string,
  ref: string,
  filePath: string,
): ScriptSnapshot | null {
  const raw = readFileAt(cwd, ref, filePath);
  if (raw === null) {
    return null;
  }
  return { path: filePath, scripts: parseScripts(raw, filePath, ref) };
}

function changeKind(
  base: ScriptSnapshot | null,
  head: ScriptSnapshot | null,
): ChangeKind {
  if (base && head) return "modified";
  if (base && !head) return "deleted";
  return "added";
}

export function diffPackageScripts(
  cwd: string,
  baseRef: string,
  headRef: string,
  candidatePaths: string[],
): ScriptChange[] {
  const uniquePaths = [...new Set(candidatePaths)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const changes: ScriptChange[] = [];

  for (const filePath of uniquePaths) {
    const base = readScriptSnapshot(cwd, baseRef, filePath);
    const head = readScriptSnapshot(cwd, headRef, filePath);
    const baseScripts = base?.scripts ?? {};
    const headScripts = head?.scripts ?? {};
    if (!base && !head) {
      continue;
    }
    const removed = Object.keys(baseScripts)
      .filter((name) => !(name in headScripts))
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const added = Object.keys(headScripts)
      .filter((name) => !(name in baseScripts))
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    if (removed.length === 0 && added.length === 0) {
      continue;
    }
    changes.push({
      path: filePath,
      kind: changeKind(base, head),
      baseScripts,
      headScripts,
      removed,
      added,
    });
  }

  return changes;
}

export function jsonPointerForScript(scriptName: string): string {
  const escaped = scriptName.replaceAll("~", "~0").replaceAll("/", "~1");
  return `/scripts/${escaped}`;
}
