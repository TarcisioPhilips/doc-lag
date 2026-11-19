import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scan } from "../src/core/scan.js";
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

describe("Step 1 coverage scans", () => {
  it("mdx-script-stale: website/docs MDX documents a removed script", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({ "deploy:preview": "vite preview" }),
          "website/docs/deploy.mdx":
            "---\ntitle: Deploy\n---\n\nimport Layout from './layout'\n\nUse `npm run deploy:preview`.\n",
        },
        headFiles: {
          "package.json": packageJson({}),
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].ruleId).toBe("scripts.missing");
    expect(report.findings[0].status).toBe("confirmed");
    expect(report.findings[0].documentation.path).toBe("website/docs/deploy.mdx");
  });

  it("mdx-no-import-fp: import-only MDX does not yield links.broken", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          "src/gone.ts": "export {}\n",
          "website/docs/only-import.mdx":
            "import Gone from '../src/gone.ts'\n\n# Hello\n",
        },
        headFiles: {
          "src/gone.ts": null,
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.findings.filter((f) => f.ruleId === "links.broken")).toEqual([]);
  });

  it("mdx-frontmatter-env-fp: frontmatter alone is not env.stale; prose still is", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          ".env.example": "API_KEY=old\n",
          "apps/docs/env.mdx":
            "---\nAPI_KEY: meta\n---\n\nSet `API_KEY` in production.\n",
        },
        headFiles: {
          ".env.example": "OTHER=1\n",
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    const envFindings = report.findings.filter((f) => f.ruleId === "env.stale");
    expect(envFindings).toHaveLength(1);
    expect(envFindings[0].documentation.line).toBeGreaterThan(1);
    expect(envFindings[0].message).toContain("API_KEY");
  });

  it("packages-readme-default: package README is scanned by defaults", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({ build: "tsc" }),
          "packages/api/package.json": packageJson({ "deploy:preview": "echo hi" }),
          "packages/api/README.md": "Run `npm run deploy:preview`.\n",
        },
        headFiles: {
          "packages/api/package.json": packageJson({}),
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(
      report.findings.some(
        (f) =>
          f.ruleId === "scripts.missing" &&
          f.documentation.path === "packages/api/README.md",
      ),
    ).toBe(true);
  });

  it("docs-exclude-changelog: stale script only in CHANGELOG.md is ignored", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({ "deploy:preview": "vite preview" }),
          "CHANGELOG.md": "Removed `npm run deploy:preview`.\n",
          "README.md": "# App\n",
        },
        headFiles: {
          "package.json": packageJson({}),
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.findings).toEqual([]);
  });

  it("respects doc-lag.config.json include overrides", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({ "deploy:preview": "vite preview" }),
          "README.md": "Use `npm run deploy:preview`.\n",
          "notes/run.md": "Use `npm run deploy:preview`.\n",
        },
        headFiles: {
          "package.json": packageJson({}),
        },
      }),
    );
    writeFileSync(
      path.join(fixture.repo, "doc-lag.config.json"),
      JSON.stringify({ docs: { include: ["notes/**/*.md"] } }),
      "utf8",
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    // Config include replaces defaults → only notes/run.md is scanned.
    expect(report.findings.map((f) => f.documentation.path)).toEqual(["notes/run.md"]);
  });

  it("CLI-style docs override can limit scan to docs/**", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({ "deploy:preview": "vite preview" }),
          "README.md": "Use `npm run deploy:preview`.\n",
          "docs/guide.md": "Use `npm run deploy:preview`.\n",
        },
        headFiles: {
          "package.json": packageJson({}),
        },
      }),
    );

    const report = scan({
      cwd: fixture.repo,
      base: fixture.base,
      head: fixture.head,
      docs: {
        include: ["docs/**/*.md"],
      },
    });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].documentation.path).toBe("docs/guide.md");
  });
});
