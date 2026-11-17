import { execFileSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { ScanError } from "../errors.js";

function isExecError(error: unknown): error is SpawnSyncReturns<string> {
  return Boolean(error && typeof error === "object" && "status" in error);
}

export function git(
  cwd: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv } = {},
): string {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      env: options.env,
    });
  } catch (error) {
    const stderr = isExecError(error) ? String(error.stderr ?? "").trim() : "";
    const suffix = stderr ? `: ${stderr}` : "";
    throw new ScanError(`git ${args.join(" ")} failed${suffix}`);
  }
}

export function assertGitRepository(cwd: string): void {
  const resolved = path.resolve(cwd);
  if (!existsSync(resolved)) {
    throw new ScanError(`Repository path does not exist: ${resolved}`);
  }
  try {
    const toplevel = git(resolved, ["rev-parse", "--show-toplevel"]).trim();
    if (path.resolve(toplevel) !== resolved) {
      // Scanning a subdirectory is allowed; we still operate via -C on the given path.
    }
  } catch (error) {
    if (error instanceof ScanError) {
      throw new ScanError(
        `Not a git repository: ${resolved}. ${error.message}`,
      );
    }
    throw error;
  }
}

export function resolveRef(cwd: string, ref: string): string {
  try {
    return git(cwd, ["rev-parse", "--verify", `${ref}^{commit}`]).trim();
  } catch {
    throw new ScanError(`Invalid git ref: ${ref}`);
  }
}

export function listFiles(cwd: string, ref: string): string[] {
  const output = git(cwd, ["ls-tree", "-r", "--name-only", "-z", ref]);
  return output
    .split("\0")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function readFileAt(
  cwd: string,
  ref: string,
  filePath: string,
): string | null {
  try {
    return git(cwd, ["show", `${ref}:${filePath}`]);
  } catch {
    return null;
  }
}

export type DiffEntry = {
  status: "added" | "modified" | "deleted" | "renamed" | "copied" | "other";
  path: string;
  previousPath?: string;
};

export function diffNameStatus(
  cwd: string,
  base: string,
  head: string,
): DiffEntry[] {
  const output = git(cwd, [
    "diff",
    "--name-status",
    "--find-renames",
    "-z",
    base,
    head,
  ]);
  const tokens = output.split("\0").filter(Boolean);
  const entries: DiffEntry[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const code = token[0];
    if (code === "R" || code === "C") {
      const previousPath = tokens[i + 1];
      const nextPath = tokens[i + 2];
      i += 2;
      entries.push({
        status: code === "R" ? "renamed" : "copied",
        path: nextPath,
        previousPath,
      });
      continue;
    }
    const filePath = tokens[i + 1];
    i += 1;
    const status =
      code === "A"
        ? "added"
        : code === "M"
          ? "modified"
          : code === "D"
            ? "deleted"
            : "other";
    entries.push({ status, path: filePath });
  }
  return entries;
}
