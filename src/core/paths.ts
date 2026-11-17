import path from "node:path";
import { ScanError } from "../errors.js";

/**
 * Resolve `inputPath` against `root` and reject any result outside `root`.
 * Prevents path traversal (`..`, absolute escapes) beyond the workspace/repo.
 */
export function constrainToRoot(inputPath: string, root: string): string {
  if (inputPath.includes("\0")) {
    throw new ScanError(`Invalid path: contains null byte`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, inputPath);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new ScanError(`Path escapes repository root: ${inputPath}`);
  }
  return resolved;
}

/** True when `candidate` is `root` or a path inside it. */
export function isInsideRoot(candidate: string, root: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolved);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
