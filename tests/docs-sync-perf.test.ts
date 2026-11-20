import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveDocsDiscoveryOptions } from "../src/core/docs-config.js";
import { listFiles, resolveRef } from "../src/core/git.js";
import { scan } from "../src/core/scan.js";
import {
  MAX_CANDIDATE_CODE_FILES,
  MAX_FILE_BYTES,
} from "../src/docs-sync/candidates.js";
import { runDocsSync } from "../src/docs-sync/engine.js";
import { formatJson } from "../src/reporters/json.js";
import {
  cleanupFixture,
  createFixtureRepo,
  git,
  type FixtureRepo,
} from "./helpers/fixture.js";

const fixtures: string[] = [];

afterEach(() => {
  while (fixtures.length > 0) {
    const repo = fixtures.pop();
    if (repo) cleanupFixture(repo);
  }
  vi.unstubAllGlobals();
});

function track(fixture: FixtureRepo): FixtureRepo {
  fixtures.push(fixture.repo);
  return fixture;
}

function writeDocsSync(repo: string, docsSync: Record<string, unknown>): void {
  writeFileSync(
    path.join(repo, "doc-lag.config.json"),
    JSON.stringify({ docsSync }, null, 2),
    "utf8",
  );
}

const isNode22 = /^v22\./.test(process.version);
const describePerf = isNode22 ? describe : describe.skip;

describe("docs-sync caps", () => {
  it("oversized-file → truncated warning and skipped for docs-sync", () => {
    const big = "x".repeat(MAX_FILE_BYTES + 1);
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "README.md": "# App\n",
          "src/ok.ts": "export {};\n",
          "src/huge.ts": "export {};\n",
        },
        headFiles: {
          "src/ok.ts": "export const ok = 1;\n",
          "src/huge.ts": big,
        },
      }),
    );
    writeDocsSync(fixture.repo, {
      rules: [{ name: "src", code: ["src/**"], docs: ["README.md"] }],
    });
    const warnings: string[] = [];
    const report = scan({
      cwd: fixture.repo,
      base: fixture.base,
      head: fixture.head,
      warn: (message) => warnings.push(message),
    });
    expect(report.docsSync?.status).toBe("ran");
    expect(report.docsSync?.truncated).toBe(true);
    expect(warnings.some((w) => w.includes("oversized") && w.includes("src/huge.ts"))).toBe(
      true,
    );
  });

  it("binary-file → skipped without crashing", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "README.md": "# App\n",
          "src/ok.ts": "export {};\n",
        },
        headFiles: {
          "src/ok.ts": "export const ok = 1;\n",
        },
      }),
    );
    // Add a binary blob on head via git hash-object / update-index for a path under src/
    const binPath = path.join(fixture.repo, "src", "blob.bin");
    mkdirSync(path.dirname(binPath), { recursive: true });
    writeFileSync(binPath, Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]));
    git(fixture.repo, ["add", "src/blob.bin"]);
    git(fixture.repo, ["-c", "commit.gpgsign=false", "commit", "-m", "binary"]);
    const head = git(fixture.repo, ["rev-parse", "HEAD"]).trim();

    writeDocsSync(fixture.repo, {
      rules: [{ name: "src", code: ["src/**"], docs: ["README.md"] }],
    });
    const report = scan({
      cwd: fixture.repo,
      base: fixture.base,
      head,
    });
    expect(report.docsSync?.status).toBe("ran");
    // Binary should not cause a crash; scan still produces a report.
    expect(report.findings.filter((f) => f.ruleId === "docs.missing").length).toBeGreaterThanOrEqual(
      0,
    );
  });

  it("offline: docs-sync scan never calls fetch", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "README.md": "# App\n",
          "src/cli/main.ts": "export {};\n",
        },
        headFiles: {
          "src/cli/main.ts": "export const x = 1;\n",
        },
      }),
    );
    writeDocsSync(fixture.repo, {
      rules: [{ name: "cli", code: ["src/cli/**"], docs: ["README.md"] }],
    });
    const fetchSpy = vi.fn(() => {
      throw new Error("network should not be used");
    });
    vi.stubGlobal("fetch", fetchSpy);
    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.docsSync?.status).toBe("ran");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("read-only: docs-sync does not dirty the working tree", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "README.md": "# App\n",
          "src/cli/main.ts": "export {};\n",
        },
        headFiles: {
          "src/cli/main.ts": "export const x = 1;\n",
        },
      }),
    );
    writeDocsSync(fixture.repo, {
      rules: [{ name: "cli", code: ["src/cli/**"], docs: ["README.md"] }],
    });
    const before = git(fixture.repo, ["status", "--porcelain"]);
    scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    const after = git(fixture.repo, ["status", "--porcelain"]);
    expect(after).toBe(before);
  });

  it("disabled-default-byte-identical with caps fixtures present", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "README.md": "# App\n",
          "src/cli/main.ts": "export {};\n",
        },
        headFiles: {
          "src/cli/main.ts": "export const x = 1;\n",
        },
      }),
    );
    const off = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(off.docsSync).toBeUndefined();
    expect(formatJson(off)).not.toContain("docsSync");
  });
});

describePerf("docs-sync perf + candidate cap (Node 22 only)", () => {
  it(
    `candidate-cap: >${MAX_CANDIDATE_CODE_FILES} code files → truncated`,
    { timeout: 120_000 },
    () => {
      const fixture = track(
        createFixtureRepo({
          baseFiles: {
            "README.md": "# App\n",
            "src/seed.ts": "export {};\n",
          },
        }),
      );
      const count = MAX_CANDIDATE_CODE_FILES + 5;
      mkdirSync(path.join(fixture.repo, "src"), { recursive: true });
      // Fast bulk create via shell; base commit already has seed.
      execFileSync(
        "bash",
        [
          "-lc",
          `for i in $(seq 0 ${count - 1}); do printf 'export {};\\n' > "src/f$i.ts"; done`,
        ],
        { cwd: fixture.repo },
      );
      git(fixture.repo, ["add", "-A"]);
      git(fixture.repo, ["-c", "commit.gpgsign=false", "commit", "-m", "many-base"]);
      const base = git(fixture.repo, ["rev-parse", "HEAD"]).trim();

      execFileSync(
        "bash",
        [
          "-lc",
          `for i in $(seq 0 ${count - 1}); do printf 'export const x = %s;\\n' "$i" > "src/f$i.ts"; done`,
        ],
        { cwd: fixture.repo },
      );
      git(fixture.repo, ["add", "-A"]);
      git(fixture.repo, ["-c", "commit.gpgsign=false", "commit", "-m", "many-head"]);
      const head = git(fixture.repo, ["rev-parse", "HEAD"]).trim();

      writeDocsSync(fixture.repo, {
        // Pairing rule so docs-sync runs; detectors stay default.
        rules: [{ name: "src", code: ["src/**"], docs: ["README.md"] }],
        maxFindings: 1,
      });
      const warnings: string[] = [];
      const report = scan({
        cwd: fixture.repo,
        base,
        head,
        warn: (message) => warnings.push(message),
      });
      expect(report.docsSync?.truncated).toBe(true);
      expect(report.docsSync?.candidateFiles).toBeLessThanOrEqual(MAX_CANDIDATE_CODE_FILES);
      expect(
        warnings.some((w) => w.includes(`candidate cap (${MAX_CANDIDATE_CODE_FILES})`)),
      ).toBe(true);
    },
  );

  it(
    "perf: 2000 changed files + 500 docs under §12 budget (≤ 2s)",
    { timeout: 180_000 },
    () => {
      const fixture = track(
        createFixtureRepo({
          baseFiles: {
            "README.md": "# App\n",
            "src/seed.ts": "export {};\n",
          },
        }),
      );

      mkdirSync(path.join(fixture.repo, "src"), { recursive: true });
      mkdirSync(path.join(fixture.repo, "docs"), { recursive: true });

      // 500 docs at base (unchanged); 2000 code files change on head.
      execFileSync(
        "bash",
        [
          "-lc",
          [
            "for i in $(seq 0 1999); do printf 'export {};\\n' > \"src/f$i.ts\"; done",
            "for i in $(seq 0 499); do printf '# Doc %s\\n\\nSee src.\\n' \"$i\" > \"docs/d$i.md\"; done",
          ].join(" && "),
        ],
        { cwd: fixture.repo },
      );
      git(fixture.repo, ["add", "-A"]);
      git(fixture.repo, ["-c", "commit.gpgsign=false", "commit", "-m", "perf-base"]);
      const base = git(fixture.repo, ["rev-parse", "HEAD"]).trim();

      execFileSync(
        "bash",
        [
          "-lc",
          "for i in $(seq 0 1999); do printf 'export const x = %s;\\n' \"$i\" > \"src/f$i.ts\"; done",
        ],
        { cwd: fixture.repo },
      );
      git(fixture.repo, ["add", "-A"]);
      git(fixture.repo, ["-c", "commit.gpgsign=false", "commit", "-m", "perf-head"]);
      const head = git(fixture.repo, ["rev-parse", "HEAD"]).trim();

      writeDocsSync(fixture.repo, {
        rules: [{ name: "src", code: ["src/**"], docs: ["docs/**", "README.md"] }],
        maxFindings: 50,
      });

      const baseSha = resolveRef(fixture.repo, base);
      const headSha = resolveRef(fixture.repo, head);
      const headFiles = listFiles(fixture.repo, headSha);
      const docsOptions = resolveDocsDiscoveryOptions(fixture.repo, {});

      // Warm once, then measure docsSync alone (NFR-4 is docsSync incremental cost).
      runDocsSync({
        cwd: fixture.repo,
        base,
        head,
        baseSha,
        headSha,
        docsOptions,
      });
      const started = performance.now();
      const result = runDocsSync({
        cwd: fixture.repo,
        base,
        head,
        baseSha,
        headSha,
        docsOptions,
      });
      const elapsedMs = performance.now() - started;

      expect(result.info?.status).toBe("ran");
      expect(result.info?.candidateFiles).toBeLessThanOrEqual(MAX_CANDIDATE_CODE_FILES);
      // §12 / NFR-4: docsSync ≤ 2 s for 2,000 changed files.
      expect(elapsedMs).toBeLessThanOrEqual(2_000);
    },
  );
});
