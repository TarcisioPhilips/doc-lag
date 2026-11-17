import { afterEach, describe, expect, it } from "vitest";
import { scan } from "../src/core/scan.js";
import { ScanError } from "../src/errors.js";
import { exitCodeFor } from "../src/reporters/exit-code.js";
import { formatJson } from "../src/reporters/json.js";
import { formatText } from "../src/reporters/text.js";
import { SCHEMA_VERSION, TOOL_NAME, type ScanReport } from "../src/types.js";
import {
  cleanupFixture,
  createFixtureRepo,
  packageJson,
  type FixtureRepo,
} from "./helpers/fixture.js";

const fixtures: string[] = [];

afterEach(() => {
  while (fixtures.length > 0) {
    const repo = fixtures.pop();
    if (repo) cleanupFixture(repo);
  }
});

function track(fixture: FixtureRepo): FixtureRepo {
  fixtures.push(fixture.repo);
  return fixture;
}

const basePackage = packageJson({
  dev: "vite",
  build: "tsc",
  "deploy:preview": "vite preview",
});

const readmeWithPreviewAndBuild = `# Fixture

Start with \`npm run dev\`.

Deploy with \`npm run deploy:preview\`.

Also documented, but already stale before this change: \`npm run leftover\`.

Build with \`npm run build\`.
`;

function parseJsonReport(output: string): ScanReport {
  return JSON.parse(output) as ScanReport;
}

describe("scan: scripts.missing", () => {
  it("reports a confirmed finding when a removed script is still documented", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": basePackage,
          "README.md": readmeWithPreviewAndBuild,
        },
        headFiles: {
          "package.json": packageJson({ dev: "vite", build: "tsc" }),
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.summary.confirmed).toBe(1);
    expect(report.findings).toHaveLength(1);
    const finding = report.findings[0];
    expect(finding.ruleId).toBe("scripts.missing");
    expect(finding.status).toBe("confirmed");
    expect(finding.severity).toBe("warning");
    expect(finding.documentation).toEqual({ path: "README.md", line: 5 });
    expect(finding.id).toBe("scripts.missing:README.md:5:deploy:preview");
    expect(finding.message).toContain("npm run deploy:preview");
    expect(finding.message).toContain("no longer exists");
    expect(finding.evidence).toEqual([
      {
        path: "package.json",
        pointer: "/scripts/deploy:preview",
        base: "vite preview",
        head: null,
      },
    ]);
    expect(finding.change).toEqual({ path: "package.json", kind: "modified" });
    expect(finding.suggestion).toBe(
      "Update the documented command or restore the script.",
    );

    const text = formatText(report);
    expect(text).toContain("CONFIRMED  README.md:5");
    expect(text).toContain('base: "deploy:preview" was present');
    expect(text).toContain('head: "deploy:preview" is absent');
    expect(text).toContain("Evidence: package.json#scripts");
  });

  it("does not report an untouched stale reference that was not changed in the diff", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": basePackage,
          "README.md": readmeWithPreviewAndBuild,
          "src/index.ts": "export const value = 1;\n",
        },
        headFiles: {
          "src/index.ts": "export const value = 2;\n",
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.findings).toEqual([]);
    expect(report.summary).toEqual({ confirmed: 0, needsReview: 0, unknown: 0 });
    expect(formatText(report)).toContain("0 findings");
  });

  it("does not report leftover docs when package.json changed but not the scripts map", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({ build: "tsc" }, { version: "1.0.0" }),
          "README.md": "Run `npm run leftover` and `npm run build`.\n",
        },
        headFiles: {
          "package.json": packageJson({ build: "tsc" }, { version: "1.0.1" }),
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.findings).toEqual([]);
  });

  it("reports a finding when a script is renamed and docs still use the old name", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": basePackage,
          "docs/setup.md": "Publish a preview:\n\n```bash\npnpm deploy:preview\n```\n",
          "AGENTS.md": "Prefer `yarn deploy:preview` or `bun run deploy:preview`.\n",
          "CLAUDE.md": "Do not invent scripts.\n",
          "CONTRIBUTING.md": "Thanks.\n",
        },
        headFiles: {
          "package.json": packageJson({
            dev: "vite",
            build: "tsc",
            "deploy:staging": "vite preview --mode staging",
          }),
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.findings.map((item) => item.id)).toEqual([
      "scripts.missing:AGENTS.md:1:deploy:preview",
      "scripts.missing:docs/setup.md:4:deploy:preview",
    ]);
    expect(report.summary.confirmed).toBe(2);
    expect(report.findings.every((item) => item.status === "confirmed")).toBe(true);
    for (const finding of report.findings) {
      expect(finding.suggestion).toContain("may have been renamed to `deploy:staging`");
      expect(finding.evidence[0]).toMatchObject({
        path: "package.json",
        pointer: "/scripts/deploy:preview",
        base: "vite preview",
        head: null,
      });
    }
  });

  it("emits a versioned JSON report with a stable shape and deterministic order", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": basePackage,
          "README.md": "A `npm run deploy:preview`\nB `npm run build`\n",
          "docs/a.md": "`npm run deploy:preview`\n",
        },
        headFiles: {
          "package.json": packageJson({ dev: "vite" }),
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: "HEAD~1", head: "HEAD" });
    const parsed = parseJsonReport(formatJson(report));
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.tool).toBe(TOOL_NAME);
    expect(parsed.mode).toBe("diff");
    expect(parsed.base).toBe("HEAD~1");
    expect(parsed.head).toBe("HEAD");
    expect(parsed.findings.map((item) => item.id)).toEqual([
      "scripts.missing:README.md:1:deploy:preview",
      "scripts.missing:README.md:2:build",
      "scripts.missing:docs/a.md:1:deploy:preview",
    ]);
    expect(parsed.summary).toEqual({ confirmed: 3, needsReview: 0, unknown: 0 });
    for (const finding of parsed.findings) {
      expect(finding).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          ruleId: "scripts.missing",
          status: "confirmed",
          severity: "warning",
          message: expect.any(String),
          documentation: expect.objectContaining({
            path: expect.any(String),
            line: expect.any(Number),
          }),
          evidence: [
            expect.objectContaining({
              path: "package.json",
              pointer: expect.stringMatching(/^\/scripts\//),
              base: expect.any(String),
              head: null,
            }),
          ],
          change: { path: "package.json", kind: "modified" },
          suggestion: expect.any(String),
        }),
      );
    }
  });

  it("uses documented exit codes for confirmed findings and errors", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": basePackage,
          "README.md": "Use `npm run deploy:preview`.\n",
        },
        headFiles: {
          "package.json": packageJson({ dev: "vite", build: "tsc" }),
        },
      }),
    );

    const withFinding = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(exitCodeFor(withFinding, "confirmed")).toBe(1);
    expect(exitCodeFor(withFinding, "none")).toBe(0);

    const clean = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({ build: "tsc" }),
          "README.md": "Use `npm run build`.\n",
        },
        headFiles: {
          "README.md": "Use `npm run build` still.\n",
        },
      }),
    );
    const noFinding = scan({ cwd: clean.repo, base: clean.base, head: clean.head });
    expect(exitCodeFor(noFinding, "confirmed")).toBe(0);

    expect(() => scan({ cwd: fixture.repo, base: "definitely-not-a-ref", head: "HEAD" })).toThrow(
      ScanError,
    );
    try {
      scan({ cwd: fixture.repo, base: "definitely-not-a-ref", head: "HEAD" });
    } catch (error) {
      expect(error).toBeInstanceOf(ScanError);
      expect((error as ScanError).exitCode).toBe(2);
      expect((error as ScanError).message).toContain("Invalid git ref");
    }
  });
});
