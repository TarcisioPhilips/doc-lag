import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { git, resolveRef } from "./git.js";

/**
 * Build an ephemeral git commit that mirrors the current working tree
 * (tracked modifications + untracked files), without touching the real
 * index, stash, or working tree.
 *
 * Returns HEAD when the working tree is clean.
 */
export function materializeWorkingTreeCommit(cwd: string): string {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "doc-lag-wt-"));
  const indexFile = path.join(tmpDir, "index");
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_INDEX_FILE: indexFile };

  try {
    git(cwd, ["read-tree", "HEAD"], { env });
    // Stage everything visible in the working tree into the temporary index.
    git(cwd, ["add", "-A", "--"], { env });
    const tree = git(cwd, ["write-tree"], { env }).trim();
    const headSha = resolveRef(cwd, "HEAD");
    const headTree = git(cwd, ["rev-parse", "HEAD^{tree}"]).trim();
    if (tree === headTree) {
      return headSha;
    }
    return git(cwd, [
      "commit-tree",
      tree,
      "-p",
      headSha,
      "-m",
      "doc-lag: ephemeral working-tree snapshot",
    ]).trim();
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
