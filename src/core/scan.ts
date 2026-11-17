import { extractLocalLinks } from "../extractors/markdown-links.js";
import { extractScriptInvocations } from "../extractors/markdown-scripts.js";
import { diffPackageScripts } from "../extractors/package-scripts.js";
import { extractPathChanges } from "../extractors/path-changes.js";
import { normalizeFindings, summarize } from "../findings/normalize.js";
import { evaluateLinksBroken } from "../rules/links-broken.js";
import { evaluateScriptsMissing } from "../rules/scripts-missing.js";
import type { Finding, LocalLinkReference, ScanOptions, ScanReport, ScriptInvocation } from "../types.js";
import { SCHEMA_VERSION, TOOL_NAME } from "../types.js";
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
 * Pipeline: resolve refs → extract path changes and package.json scripts →
 * discover Markdown docs at head → extract script invocations and local links →
 * evaluate rules → normalize findings.
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

  const pathChanges = extractPathChanges(cwd, base, head);

  const docPaths = listDocumentationFiles(headFiles);
  const invocations: ScriptInvocation[] = [];
  const linkReferences: LocalLinkReference[] = [];

  for (const docPath of docPaths) {
    const content = readFileAt(cwd, head, docPath);
    if (content === null) {
      continue;
    }
    invocations.push(...extractScriptInvocations(content, docPath));
    linkReferences.push(...extractLocalLinks(content, docPath));
  }

  const allFindings: Finding[] = [
    ...evaluateScriptsMissing(scriptChanges, invocations),
    ...evaluateLinksBroken(linkReferences, pathChanges, baseFiles, headFiles),
  ];

  const findings = normalizeFindings(allFindings);

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
