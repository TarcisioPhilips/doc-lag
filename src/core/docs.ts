import picomatch from "picomatch";
import type { DocsDiscoveryOptions } from "../types.js";
import { DEFAULT_DOCS_EXCLUDE, DEFAULT_DOCS_INCLUDE } from "./docs-config.js";

const ROOT_DOC = /^(README|AGENTS|CLAUDE|CONTRIBUTING)\.md$/i;
const ROOT_DOC_PATTERN = /^(README|AGENTS|CLAUDE|CONTRIBUTING)\.md$/i;

export type { DocsDiscoveryOptions };

function normalizeRepoPath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

function isUnsafePath(normalized: string): boolean {
  if (!normalized || normalized.startsWith("/") || normalized.includes("://")) {
    return true;
  }
  const parts = normalized.split("/");
  return parts.includes("node_modules") || parts.includes(".git") || parts.includes("..");
}

function matchesAny(normalized: string, patterns: string[]): boolean {
  if (patterns.length === 0) {
    return false;
  }
  return picomatch.isMatch(normalized, patterns, {
    dot: true,
    nocase: false,
    bash: true,
  });
}

/**
 * Historical compatibility: when an include pattern is exactly one of the four
 * root canonical basenames, match that basename case-insensitively at repo root.
 */
function matchesLegacyRootDoc(normalized: string, include: string[]): boolean {
  const parts = normalized.split("/");
  if (parts.length !== 1 || !ROOT_DOC.test(parts[0])) {
    return false;
  }
  return include.some((pattern) => ROOT_DOC_PATTERN.test(pattern));
}

/**
 * True when `filePath` is in the documentation discovery set.
 * Hard safety denies always apply; then include (globs + legacy root basenames), then exclude.
 */
export function isDocumentationPath(
  filePath: string,
  options?: Partial<DocsDiscoveryOptions>,
): boolean {
  const normalized = normalizeRepoPath(filePath);
  if (isUnsafePath(normalized)) {
    return false;
  }

  const include = options?.include ?? [...DEFAULT_DOCS_INCLUDE];
  const exclude = options?.exclude ?? [...DEFAULT_DOCS_EXCLUDE];

  const included =
    matchesAny(normalized, include) || matchesLegacyRootDoc(normalized, include);
  if (!included) {
    return false;
  }
  if (matchesAny(normalized, exclude)) {
    return false;
  }
  return true;
}

export function listDocumentationFiles(
  files: string[],
  options?: Partial<DocsDiscoveryOptions>,
): string[] {
  return files
    .filter((filePath) => isDocumentationPath(filePath, options))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
