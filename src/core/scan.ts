import { extractScriptInvocations } from "../extractors/markdown-scripts.js";
import { diffPackageScripts } from "../extractors/package-scripts.js";
import { normalizeFindings, summarize } from "../findings/normalize.js";
import { evaluateScriptsMissing } from "../rules/scripts-missing.js";
import { SCHEMA_VERSION, TOOL_NAME, type ScanOptions, type ScanReport, type ScriptInvocation } from "../types.js";
import { listDocumentationFiles } from "./docs.js";
import {
  assertGitRepository,
  listFiles,
  readFileAt,
  resolveRef,
} from "./git.js";

function isPackageJson(filePath: string): boolean {
  return filePath === "package.json" || filePath.endsWith("/package.json");
}

/**
 * Scan a git range and return a versioned report.
 *
 * Pipeline: resolve refs → extract changed package.json scripts → discover
 * Markdown docs at head → extract script invocations → evaluate rules →
 * normalize findings. Later rules should hook in next to the scripts rule.
 */
export function scan(options: ScanOptions): ScanReport {
  const cwd = options.cwd;
  assertGitRepository(cwd);
  const base = resolveRef(cwd, options.base);
  const head = resolveRef(cwd, options.head);

  const baseFiles = listFiles(cwd, base);
  const headFiles = listFiles(cwd, head);
  const packageJsonPaths = [...new Set([...baseFiles, ...headFiles].filter(isPackageJson))];
  const scriptChanges = diffPackageScripts(cwd, base, head, packageJsonPaths);

  const docPaths = listDocumentationFiles(headFiles);
  const invocations: ScriptInvocation[] = [];
  for (const docPath of docPaths) {
    const content = readFileAt(cwd, head, docPath);
    if (content === null) {
      continue;
    }
    invocations.push(...extractScriptInvocations(content, docPath));
  }

  const findings = normalizeFindings(evaluateScriptsMissing(scriptChanges, invocations));

  return {
    schemaVersion: SCHEMA_VERSION,
    tool: TOOL_NAME,
    mode: "diff",
    base: options.base,
    head: options.head,
    findings,
    summary: summarize(findings),
  };
}
