import type { SurfaceDecl } from "./types.js";

function isPackageJsonPath(filePath: string): boolean {
  const base = filePath.split("/").pop() ?? "";
  return base === "package.json";
}

function jsonPointerSegment(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

function unscopedPackageName(name: unknown): string | undefined {
  if (typeof name !== "string" || name.trim() === "") {
    return undefined;
  }
  const trimmed = name.trim();
  if (trimmed.startsWith("@")) {
    const slash = trimmed.indexOf("/");
    if (slash === -1 || slash === trimmed.length - 1) {
      return undefined;
    }
    return trimmed.slice(slash + 1);
  }
  return trimmed;
}

function lineOfKey(content: string, key: string): number {
  const pattern = new RegExp(
    `^\\s*"${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:`,
    "m",
  );
  const match = pattern.exec(content);
  if (!match) {
    return 1;
  }
  return content.slice(0, match.index).split(/\r?\n/).length;
}

/**
 * Extract package.bin and package.exports surfaces from package.json.
 */
export function detectPackageSurfaces(
  filePath: string,
  content: string,
  options: {
    /** When false, skip package.exports (default detector setting). */
    includeExports?: boolean;
    warn?: (message: string) => void;
  } = {},
): SurfaceDecl[] {
  if (!isPackageJsonPath(filePath)) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.warn?.(
      `doc-lag: unable to parse ${filePath} as JSON (${message}); skipping package detectors`,
    );
    return [];
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return [];
  }
  const pkg = parsed as Record<string, unknown>;
  const results: SurfaceDecl[] = [];

  if (pkg.bin !== undefined) {
    if (typeof pkg.bin === "string") {
      const binName = unscopedPackageName(pkg.name);
      if (binName) {
        results.push({
          kind: "package.bin",
          name: binName,
          path: filePath,
          line: lineOfKey(content, "bin"),
          pointer: "/bin",
          literal: `"bin": ${JSON.stringify(pkg.bin)}`,
        });
      }
    } else if (pkg.bin && typeof pkg.bin === "object" && !Array.isArray(pkg.bin)) {
      for (const key of Object.keys(pkg.bin as Record<string, unknown>).sort()) {
        results.push({
          kind: "package.bin",
          name: key,
          path: filePath,
          line: lineOfKey(content, key),
          pointer: `/bin/${jsonPointerSegment(key)}`,
          literal: `"${key}"`,
        });
      }
    }
  }

  if (options.includeExports && pkg.exports !== undefined && pkg.private !== true) {
    const pkgName = typeof pkg.name === "string" ? pkg.name.trim() : "";
    if (pkg.exports && typeof pkg.exports === "object" && !Array.isArray(pkg.exports)) {
      const exportsMap = pkg.exports as Record<string, unknown>;
      for (const key of Object.keys(exportsMap).sort()) {
        if (!key.startsWith(".")) {
          continue;
        }
        if (key === "." || key === "./package.json") {
          continue;
        }
        const subpath = key.slice(2); // strip leading ./
        const name = pkgName ? `${pkgName}/${subpath}` : key;
        results.push({
          kind: "package.exports",
          name,
          path: filePath,
          line: lineOfKey(content, key),
          pointer: `/exports/${jsonPointerSegment(key)}`,
          literal: `"${key}"`,
        });
      }
    }
  }

  return results;
}
