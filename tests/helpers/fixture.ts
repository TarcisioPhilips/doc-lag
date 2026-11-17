import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export interface FixtureRepo {
  repo: string;
  base: string;
  head: string;
}

export function git(repo: string, args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function writeFiles(repo: string, files: Record<string, string>): void {
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(repo, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
}

export function createFixtureRepo(options: {
  baseFiles: Record<string, string>;
  headFiles?: Record<string, string | null>;
}): FixtureRepo {
  const repo = mkdtempSync(path.join(tmpdir(), "repodocpulse-"));
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "test@repodocpulse.local"]);
  git(repo, ["config", "user.name", "RepoDocPulse Tests"]);
  git(repo, ["config", "commit.gpgsign", "false"]);

  writeFiles(repo, options.baseFiles);
  git(repo, ["add", "-A"]);
  git(repo, ["-c", "commit.gpgsign=false", "commit", "-m", "base"]);
  const base = git(repo, ["rev-parse", "HEAD"]).trim();

  if (options.headFiles) {
    for (const [relative, content] of Object.entries(options.headFiles)) {
      if (content === null) {
        git(repo, ["rm", "-f", "--", relative]);
      } else {
        writeFiles(repo, { [relative]: content });
      }
    }
    git(repo, ["add", "-A"]);
    git(repo, ["-c", "commit.gpgsign=false", "commit", "-m", "head"]);
  }

  const head = git(repo, ["rev-parse", "HEAD"]).trim();
  return { repo, base, head };
}

export function packageJson(scripts: Record<string, string>, extra: Record<string, unknown> = {}): string {
  return `${JSON.stringify({ name: "fixture", private: true, ...extra, scripts }, null, 2)}\n`;
}

export function cleanupFixture(repo: string): void {
  rmSync(repo, { recursive: true, force: true });
}
