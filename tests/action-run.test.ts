import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  extractPullRequestLabels,
  formatGithubOutputs,
  parseActionInputs,
  parseGithubEvent,
  resolveScanRange,
} from "../src/action/inputs.js";
import { runAction } from "../src/action/run.js";
import type { GithubApiClient } from "../src/action/github.js";
import { STICKY_COMMENT_MARKER } from "../src/action/comment.js";
import {
  cleanupFixture,
  createFixtureRepo,
  packageJson,
  type FixtureRepo,
} from "./helpers/fixture.js";

const fixtures: string[] = [];
const temps: string[] = [];

afterEach(() => {
  while (fixtures.length > 0) {
    const repo = fixtures.pop();
    if (repo) cleanupFixture(repo);
  }
  while (temps.length > 0) {
    const dir = temps.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function track(fixture: FixtureRepo): FixtureRepo {
  fixtures.push(fixture.repo);
  return fixture;
}

describe("action inputs and outputs", () => {
  it("parses defaults and explicit values", () => {
    expect(parseActionInputs({})).toEqual({
      failOn: "confirmed",
      comment: true,
      workingDirectory: ".",
      sarif: false,
      rank: "none",
      base: undefined,
      head: undefined,
      config: undefined,
      docsInclude: undefined,
      docsExclude: undefined,
      docsSync: undefined,
      docsSyncEnforce: undefined,
      docsSyncSkipLabels: undefined,
    });
    expect(
      parseActionInputs({
        DOC_LAG_FAIL_ON: "none",
        DOC_LAG_COMMENT: "false",
        DOC_LAG_WORKING_DIRECTORY: "packages/app",
        DOC_LAG_SARIF: "true",
        DOC_LAG_RANK: "jev",
        DOC_LAG_BASE: "abc",
        DOC_LAG_HEAD: "def",
        DOC_LAG_CONFIG: "doc-lag.config.json",
        DOC_LAG_DOCS_INCLUDE: "README.md, docs/**/*.mdx",
        DOC_LAG_DOCS_EXCLUDE: "**/CHANGELOG.md",
        DOC_LAG_DOCS_SYNC: "true",
        DOC_LAG_DOCS_SYNC_ENFORCE: "false",
        DOC_LAG_DOCS_SYNC_SKIP_LABELS: "no-docs-needed, skip-docs",
      }),
    ).toEqual({
      failOn: "none",
      comment: false,
      workingDirectory: "packages/app",
      sarif: true,
      rank: "jev",
      base: "abc",
      head: "def",
      config: "doc-lag.config.json",
      docsInclude: ["README.md", "docs/**/*.mdx"],
      docsExclude: ["**/CHANGELOG.md"],
      docsSync: true,
      docsSyncEnforce: false,
      docsSyncSkipLabels: ["no-docs-needed", "skip-docs"],
    });
  });

  it("treats empty docs-sync inputs as unset (config wins)", () => {
    expect(
      parseActionInputs({
        DOC_LAG_DOCS_SYNC: "",
        DOC_LAG_DOCS_SYNC_ENFORCE: "   ",
        DOC_LAG_DOCS_SYNC_SKIP_LABELS: "",
      }),
    ).toMatchObject({
      docsSync: undefined,
      docsSyncEnforce: undefined,
      docsSyncSkipLabels: undefined,
    });
  });

  it("rejects invalid fail-on", () => {
    expect(() => parseActionInputs({ DOC_LAG_FAIL_ON: "all" })).toThrow(/fail-on/);
  });

  it("resolves PR SHAs from the event payload", () => {
    const github = parseGithubEvent("pull_request", "acme/app", {
      pull_request: {
        number: 12,
        base: { sha: "basesha" },
        head: { sha: "headsha" },
      },
      repository: { name: "app", owner: { login: "acme" } },
    });
    expect(github.pullRequest).toEqual({
      owner: "acme",
      repo: "app",
      number: 12,
      baseSha: "basesha",
      headSha: "headsha",
    });
    expect(
      resolveScanRange(
        parseActionInputs({ DOC_LAG_FAIL_ON: "none" }),
        github,
      ),
    ).toEqual({ base: "basesha", head: "headsha" });
  });

  it("extracts PR labels from the event payload (empty on non-PR)", () => {
    expect(
      extractPullRequestLabels({
        pull_request: {
          labels: [{ name: "bug" }, { name: "no-docs-needed" }, { name: "" }, {}],
        },
      }),
    ).toEqual(["bug", "no-docs-needed"]);
    expect(extractPullRequestLabels({ push: {} })).toEqual([]);
    expect(extractPullRequestLabels(null)).toEqual([]);
  });

  it("formats GitHub Action outputs", () => {
    expect(
      formatGithubOutputs({
        findingsCount: 2,
        confirmedCount: 1,
        needsReviewCount: 1,
        docsMissingCount: 1,
        reportPath: "/tmp/doc-lag-report.json",
        sarifPath: "/tmp/doc-lag.sarif",
      }),
    ).toBe(
      [
        "findings-count=2",
        "confirmed-count=1",
        "needs-review-count=1",
        "docs-missing-count=1",
        "report-path=/tmp/doc-lag-report.json",
        "sarif-path=/tmp/doc-lag.sarif",
      ].join("\n"),
    );
  });
});

describe("runAction", () => {
  it("scans, writes JSON (+ SARIF), summary, outputs, and sticky comment", async () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({ "deploy:preview": "vite preview" }),
          "README.md": "Use `npm run deploy:preview`.\n",
        },
        headFiles: {
          "package.json": packageJson({}),
        },
      }),
    );
    const temp = mkdtempSync(path.join(tmpdir(), "doc-lag-action-"));
    temps.push(temp);
    const written = new Map<string, string>();
    let summary = "";
    let createdBody = "";

    const client: GithubApiClient = {
      listIssueComments: async () => [],
      createIssueComment: async (_o, _r, _n, body) => {
        createdBody = body;
        return { id: 100, body };
      },
      updateIssueComment: async () => {
        throw new Error("unexpected update");
      },
    };

    const result = await runAction({
      cwd: fixture.repo,
      env: {
        DOC_LAG_FAIL_ON: "confirmed",
        DOC_LAG_COMMENT: "true",
        DOC_LAG_WORKING_DIRECTORY: ".",
        DOC_LAG_SARIF: "true",
        DOC_LAG_BASE: fixture.base,
        DOC_LAG_HEAD: fixture.head,
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_REPOSITORY: "acme/app",
        GITHUB_EVENT_PATH: path.join(temp, "event.json"),
        GITHUB_OUTPUT: path.join(temp, "github-output"),
        RUNNER_TEMP: temp,
        GITHUB_TOKEN: "test-token",
      },
      readEventPayload: () => ({
        pull_request: {
          number: 3,
          base: { sha: fixture.base },
          head: { sha: fixture.head },
        },
        repository: { name: "app", owner: { login: "acme" } },
      }),
      githubClient: client,
      writeOutputFile: (filePath, contents) => {
        written.set(filePath, contents);
      },
      appendStepSummary: (markdown) => {
        summary += markdown;
      },
      log: () => undefined,
      warn: () => undefined,
    });

    expect(result.exitCode).toBe(1);
    expect(result.outputs.findingsCount).toBe(1);
    expect(result.outputs.confirmedCount).toBe(1);
    expect(result.comment).toEqual({ attempted: true, posted: true });
    expect(createdBody).toContain(STICKY_COMMENT_MARKER);
    expect(createdBody).toContain("CONFIRMED");
    expect(summary).toContain("## doc-lag report");
    expect(summary).not.toContain(STICKY_COMMENT_MARKER);

    const reportJson = written.get(result.outputs.reportPath);
    expect(reportJson).toBeDefined();
    expect(JSON.parse(reportJson as string).findings).toHaveLength(1);

    const sarifJson = written.get(result.outputs.sarifPath);
    expect(sarifJson).toBeDefined();
    const sarif = JSON.parse(sarifJson as string) as {
      version: string;
      runs: Array<{ results: unknown[] }>;
    };
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0]?.results).toHaveLength(1);

    const outputFile = readFileSync(path.join(temp, "github-output"), "utf8");
    expect(outputFile).toContain("findings-count=1");
    expect(outputFile).toContain("docs-missing-count=0");
    expect(outputFile).toContain(`report-path=${result.outputs.reportPath}`);
  });

  it("label-skip: PR label in skipLabels skips docs-sync; docs-missing-count=0", async () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "README.md": "# App\n",
          "src/cli/main.ts": "console.log('hi');\n",
        },
        headFiles: {
          "src/cli/main.ts": "console.log('hi');\nconsole.log('bye');\n",
        },
      }),
    );
    writeFileSync(
      path.join(fixture.repo, "doc-lag.config.json"),
      JSON.stringify({
        docsSync: {
          rules: [{ name: "cli", code: ["src/cli/**"], docs: ["README.md"] }],
        },
      }),
    );
    const temp = mkdtempSync(path.join(tmpdir(), "doc-lag-action-"));
    temps.push(temp);
    let summary = "";

    const result = await runAction({
      cwd: fixture.repo,
      env: {
        DOC_LAG_FAIL_ON: "none",
        DOC_LAG_COMMENT: "false",
        DOC_LAG_SARIF: "false",
        DOC_LAG_BASE: fixture.base,
        DOC_LAG_HEAD: fixture.head,
        DOC_LAG_DOCS_SYNC: "true",
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_REPOSITORY: "acme/app",
        GITHUB_EVENT_PATH: path.join(temp, "event.json"),
        GITHUB_OUTPUT: path.join(temp, "github-output"),
        RUNNER_TEMP: temp,
      },
      readEventPayload: () => ({
        pull_request: {
          number: 5,
          base: { sha: fixture.base },
          head: { sha: fixture.head },
          labels: [{ name: "no-docs-needed" }],
        },
        repository: { name: "app", owner: { login: "acme" } },
      }),
      writeOutputFile: () => undefined,
      appendStepSummary: (markdown) => {
        summary += markdown;
      },
      log: () => undefined,
      warn: () => undefined,
    });

    expect(result.report.docsSync?.status).toBe("skipped");
    expect(result.report.docsSync?.skipReason).toBe("label:no-docs-needed");
    expect(result.report.findings.filter((f) => f.ruleId === "docs.missing")).toHaveLength(0);
    expect(result.outputs.docsMissingCount).toBe(0);
    expect(summary).toContain("Docs sync check skipped (label `no-docs-needed`).");
    const outputFile = readFileSync(path.join(temp, "github-output"), "utf8");
    expect(outputFile).toContain("docs-missing-count=0");
  });

  it("emits docs-missing-count when docs.missing findings exist", async () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "README.md": "# App\n",
          "src/cli/main.ts": "console.log('hi');\n",
        },
        headFiles: {
          "src/cli/main.ts": "console.log('hi');\nconsole.log('bye');\n",
        },
      }),
    );
    writeFileSync(
      path.join(fixture.repo, "doc-lag.config.json"),
      JSON.stringify({
        docsSync: {
          rules: [{ name: "cli", code: ["src/cli/**"], docs: ["README.md"] }],
        },
      }),
    );
    const temp = mkdtempSync(path.join(tmpdir(), "doc-lag-action-"));
    temps.push(temp);
    let summary = "";

    const result = await runAction({
      cwd: fixture.repo,
      env: {
        DOC_LAG_FAIL_ON: "none",
        DOC_LAG_COMMENT: "false",
        DOC_LAG_SARIF: "false",
        DOC_LAG_BASE: fixture.base,
        DOC_LAG_HEAD: fixture.head,
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_REPOSITORY: "acme/app",
        GITHUB_EVENT_PATH: path.join(temp, "event.json"),
        GITHUB_OUTPUT: path.join(temp, "github-output"),
        RUNNER_TEMP: temp,
      },
      readEventPayload: () => ({
        pull_request: {
          number: 6,
          base: { sha: fixture.base },
          head: { sha: fixture.head },
          labels: [],
        },
        repository: { name: "app", owner: { login: "acme" } },
      }),
      writeOutputFile: () => undefined,
      appendStepSummary: (markdown) => {
        summary += markdown;
      },
      log: () => undefined,
      warn: () => undefined,
    });

    expect(result.outputs.docsMissingCount).toBe(1);
    expect(summary).toContain("### Missing documentation");
    expect(summary).toContain("missing docs");
    const outputFile = readFileSync(path.join(temp, "github-output"), "utf8");
    expect(outputFile).toContain("docs-missing-count=1");
  });

  it("does not fail the run when sticky comment lacks permission", async () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({ build: "tsc" }),
          "README.md": "Hi\n",
        },
      }),
    );
    const temp = mkdtempSync(path.join(tmpdir(), "doc-lag-action-"));
    temps.push(temp);
    const warnings: string[] = [];

    const client: GithubApiClient = {
      listIssueComments: async () => {
        const error = new Error("Resource not accessible by integration");
        (error as Error & { status: number }).status = 403;
        throw error;
      },
      createIssueComment: async () => {
        throw new Error("unused");
      },
      updateIssueComment: async () => {
        throw new Error("unused");
      },
    };

    const result = await runAction({
      cwd: fixture.repo,
      env: {
        DOC_LAG_FAIL_ON: "none",
        DOC_LAG_COMMENT: "true",
        DOC_LAG_SARIF: "false",
        DOC_LAG_BASE: fixture.base,
        DOC_LAG_HEAD: fixture.head,
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_REPOSITORY: "acme/app",
        GITHUB_EVENT_PATH: path.join(temp, "event.json"),
        RUNNER_TEMP: temp,
        GITHUB_TOKEN: "test-token",
      },
      readEventPayload: () => ({
        pull_request: {
          number: 9,
          base: { sha: fixture.base },
          head: { sha: fixture.head },
        },
        repository: { name: "app", owner: { login: "acme" } },
      }),
      githubClient: client,
      writeOutputFile: () => undefined,
      appendStepSummary: () => undefined,
      log: () => undefined,
      warn: (message) => warnings.push(message),
    });

    expect(result.exitCode).toBe(0);
    expect(result.comment).toEqual({
      attempted: true,
      posted: false,
      skippedReason: "permission",
    });
    expect(warnings.some((w) => w.includes("fork PRs") || w.includes("job summary"))).toBe(true);
  });
});
