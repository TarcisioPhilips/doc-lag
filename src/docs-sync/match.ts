import picomatch from "picomatch";

const GLOB_META = /[*?[{]/;

export function normalizeRepoPath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

export function isGlobPattern(pattern: string): boolean {
  return GLOB_META.test(pattern);
}

export function matchesGlob(filePath: string, pattern: string): boolean {
  const normalized = normalizeRepoPath(filePath);
  const normalizedPattern = normalizeRepoPath(pattern).replace(/^\//, "");
  return picomatch.isMatch(normalized, normalizedPattern, {
    dot: true,
    nocase: false,
    bash: true,
  });
}

export function matchesAnyGlob(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesGlob(filePath, pattern));
}

/** Resolve a rule.docs pattern relative to a package root (unless `/`-anchored). */
export function resolveDocsPattern(pattern: string, packageRoot?: string): string {
  const normalized = normalizeRepoPath(pattern);
  if (normalized.startsWith("/")) {
    return normalized.slice(1);
  }
  if (!packageRoot) {
    return normalized;
  }
  const root = normalizeRepoPath(packageRoot).replace(/\/$/, "");
  return `${root}/${normalized}`;
}

/**
 * First path prefix of `filePath` that matches any `packages` glob, if any.
 */
export function packageRootFor(
  filePath: string,
  packageGlobs: string[],
): string | undefined {
  if (packageGlobs.length === 0) {
    return undefined;
  }
  const normalized = normalizeRepoPath(filePath);
  const parts = normalized.split("/");
  for (let i = 1; i <= parts.length; i += 1) {
    const candidate = parts.slice(0, i).join("/");
    if (matchesAnyGlob(candidate, packageGlobs)) {
      return candidate;
    }
  }
  return undefined;
}
