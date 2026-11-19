import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scan } from "../src/core/scan.js";
import { exitCodeFor } from "../src/reporters/exit-code.js";
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

describe("exitCodeFor + docsSync enforce", () => {
  it("FR-38: fail-on none → always 0", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({ lint: "eslint" }),
          "README.md": "`npm run lint`\n",
          "src/cli/main.ts": "export {};\n",
        },
        headFiles: {
          "package.json": packageJson({}),
          "src/cli/main.ts": "export const x = 1;\n",
        },
      }),
    );
    writeFileSync(
      path.join(fixture.repo, "doc-lag.config.json"),
      JSON.stringify({
        docsSync: {
          enforce: true,
          rules: [{ name: "cli", code: ["src/cli/**"], docs: ["README.md"] }],
        },
      }),
    );
    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.summary.confirmed).toBeGreaterThan(0);
    expect(report.findings.some((f) => f.ruleId === "docs.missing")).toBe(true);
    expect(exitCodeFor(report, "none")).toBe(0);
  });

  it("FR-39: fail-on confirmed without enforce → docs.missing does not fail", () => {
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
    writeFileSync(
      path.join(fixture.repo, "doc-lag.config.json"),
      JSON.stringify({
        docsSync: {
          enforce: false,
          rules: [{ name: "cli", code: ["src/cli/**"], docs: ["README.md"] }],
        },
      }),
    );
    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.summary.confirmed).toBe(0);
    expect(report.findings.some((f) => f.ruleId === "docs.missing")).toBe(true);
    expect(report.docsSync?.enforced).toBe(false);
    expect(exitCodeFor(report, "confirmed")).toBe(0);
  });

  it("FR-40: enforce + docs.missing → exit 1 and Finding.enforced", () => {
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
    writeFileSync(
      path.join(fixture.repo, "doc-lag.config.json"),
      JSON.stringify({
        docsSync: {
          enforce: true,
          rules: [{ name: "cli", code: ["src/cli/**"], docs: ["README.md"] }],
        },
      }),
    );
    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    const missing = report.findings.filter((f) => f.ruleId === "docs.missing");
    expect(missing).toHaveLength(1);
    expect(missing[0]?.enforced).toBe(true);
    expect(exitCodeFor(report, "confirmed")).toBe(1);
  });

  it("FR-41: skipped → never fails due to docs.missing", () => {
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
    writeFileSync(
      path.join(fixture.repo, "doc-lag.config.json"),
      JSON.stringify({
        docsSync: {
          enforce: true,
          rules: [{ name: "cli", code: ["src/cli/**"], docs: ["README.md"] }],
        },
      }),
    );
    const report = scan({
      cwd: fixture.repo,
      base: fixture.base,
      head: fixture.head,
      prLabels: ["no-docs-needed"],
    });
    expect(report.docsSync?.status).toBe("skipped");
    expect(report.findings.filter((f) => f.ruleId === "docs.missing")).toHaveLength(0);
    expect(exitCodeFor(report, "confirmed")).toBe(0);
  });
});
