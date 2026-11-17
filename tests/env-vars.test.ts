import { afterEach, describe, expect, it } from "vitest";
import { scan } from "../src/core/scan.js";
import { extractEnvReferences } from "../src/extractors/markdown-env.js";
import { exitCodeFor } from "../src/reporters/exit-code.js";
import { formatJson } from "../src/reporters/json.js";
import { formatText } from "../src/reporters/text.js";
import type { ScanReport } from "../src/types.js";
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

function envExample(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n") + "\n";
}

describe("extractEnvReferences", () => {
  it("extracts assignments in code blocks", () => {
    const markdown = `
# Setup

Configure these vars:

\`\`\`bash
DATABASE_URL=postgres://localhost/db
API_KEY=your-key-here
\`\`\`
`;
    const refs = extractEnvReferences(markdown, "README.md");
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({
      docPath: "README.md",
      line: 7,
      key: "DATABASE_URL",
      kind: "assignment",
    });
    expect(refs[1]).toMatchObject({
      docPath: "README.md",
      line: 8,
      key: "API_KEY",
      kind: "assignment",
    });
  });

  it("extracts env keys in inline code", () => {
    const markdown = `
Set the \`DATABASE_URL\` variable before running.
You also need \`API_KEY\` configured.
`;
    const refs = extractEnvReferences(markdown, "README.md");
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({
      key: "DATABASE_URL",
      kind: "inline-code",
    });
    expect(refs[1]).toMatchObject({
      key: "API_KEY",
      kind: "inline-code",
    });
  });

  it("extracts assignments in inline code", () => {
    const markdown = `Set \`DATABASE_URL=postgres://localhost\` in your env.`;
    const refs = extractEnvReferences(markdown, "README.md");
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      key: "DATABASE_URL",
      kind: "assignment",
    });
  });

  it("extracts env vars from table cells", () => {
    const markdown = `
| Variable | Description |
|----------|-------------|
| DATABASE_URL | Database connection |
| API_KEY | Your API key |
`;
    const refs = extractEnvReferences(markdown, "README.md");
    expect(refs).toHaveLength(2);
    expect(refs.map((r) => r.key)).toEqual(["DATABASE_URL", "API_KEY"]);
    expect(refs.every((r) => r.kind === "table-cell")).toBe(true);
  });

  it("ignores common words that look like env vars", () => {
    const markdown = `
Check the README for the API docs.
Use HTTP or HTTPS for the URL.
`;
    const refs = extractEnvReferences(markdown, "docs/guide.md");
    expect(refs).toHaveLength(0);
  });

  it("ignores env vars inside non-env code blocks", () => {
    const markdown = `
\`\`\`javascript
const DATABASE_URL = process.env.DATABASE_URL;
\`\`\`
`;
    const refs = extractEnvReferences(markdown, "README.md");
    expect(refs).toHaveLength(0);
  });

  it("extracts from env-specific code blocks", () => {
    const markdown = `
\`\`\`env
DATABASE_URL=postgres://localhost/db
\`\`\`

\`\`\`dotenv
API_KEY=secret
\`\`\`
`;
    const refs = extractEnvReferences(markdown, "README.md");
    expect(refs).toHaveLength(2);
    expect(refs.map((r) => r.key)).toEqual(["DATABASE_URL", "API_KEY"]);
  });
});

describe("scan: env.stale", () => {
  it("reports a confirmed finding when a removed env key is still documented", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          ".env.example": envExample({
            DATABASE_URL: "postgres://localhost/db",
            API_KEY: "your-key",
          }),
          "README.md": "Set `DATABASE_URL` before running.\n",
        },
        headFiles: {
          ".env.example": envExample({
            API_KEY: "your-key",
          }),
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.summary.confirmed).toBe(1);
    expect(report.findings).toHaveLength(1);

    const finding = report.findings[0];
    expect(finding.ruleId).toBe("env.stale");
    expect(finding.status).toBe("confirmed");
    expect(finding.severity).toBe("warning");
    expect(finding.documentation).toEqual({ path: "README.md", line: 1 });
    expect(finding.id).toBe("env.stale:README.md:1:DATABASE_URL");
    expect(finding.message).toContain("DATABASE_URL");
    expect(finding.message).toContain("removed");
    expect(finding.evidence).toEqual([
      {
        path: ".env.example",
        pointer: "/env/DATABASE_URL",
        base: "DATABASE_URL",
        head: null,
      },
    ]);
    expect(finding.change).toEqual({ path: ".env.example", kind: "modified" });
    expect(finding.suggestion).toContain("Update the documentation");
  });

  it("reports a finding with rename hint when env key is renamed", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          ".env.example": envExample({
            DB_URL: "postgres://localhost/db",
          }),
          "README.md": "Configure `DB_URL` for the database.\n",
        },
        headFiles: {
          ".env.example": envExample({
            DATABASE_URL: "postgres://localhost/db",
          }),
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.summary.confirmed).toBe(1);

    const finding = report.findings[0];
    expect(finding.ruleId).toBe("env.stale");
    expect(finding.message).toContain("renamed to `DATABASE_URL`");
    expect(finding.suggestion).toContain("renamed to `DATABASE_URL`");
  });

  it("does not report pre-existing stale references that were not changed in the diff", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          ".env.example": envExample({
            API_KEY: "your-key",
          }),
          "README.md": "Set `NONEXISTENT_VAR` and `API_KEY`.\n",
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
  });

  it("ignores real .env files (only scans committed example files)", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          ".env.example": envExample({
            DATABASE_URL: "postgres://localhost/db",
            SECRET_KEY: "placeholder",
          }),
          "README.md": "Set `DATABASE_URL` and `SECRET_KEY`.\n",
        },
        headFiles: {
          ".env.example": envExample({
            DATABASE_URL: "postgres://localhost/db",
          }),
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.summary.confirmed).toBe(1);
    expect(report.findings[0].evidence[0].path).toBe(".env.example");
  });

  it("reports table-cell references as needs-review status", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          ".env.example": envExample({
            DATABASE_URL: "postgres://localhost/db",
            API_KEY: "your-key",
          }),
          "README.md": `
| Variable | Description |
|----------|-------------|
| DATABASE_URL | Database connection |
`,
        },
        headFiles: {
          ".env.example": envExample({
            API_KEY: "your-key",
          }),
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.summary.needsReview).toBe(1);
    expect(report.summary.confirmed).toBe(0);

    const finding = report.findings[0];
    expect(finding.status).toBe("needs-review");
  });

  it("reports multiple env findings from different docs", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          ".env.example": envExample({
            DATABASE_URL: "postgres://localhost/db",
            API_KEY: "your-key",
          }),
          "README.md": "Set `DATABASE_URL` to connect.\n",
          "docs/setup.md": "Also configure `DATABASE_URL`.\n",
          "AGENTS.md": "The `DATABASE_URL` is required.\n",
        },
        headFiles: {
          ".env.example": envExample({
            API_KEY: "your-key",
          }),
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.findings).toHaveLength(3);
    expect(report.findings.every((f) => f.ruleId === "env.stale")).toBe(true);
    expect(report.findings.every((f) => f.status === "confirmed")).toBe(true);
  });

  it("supports .env.sample and .env.template files", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          ".env.sample": envExample({
            SAMPLE_VAR: "value",
          }),
          ".env.template": envExample({
            TEMPLATE_VAR: "value",
          }),
          "README.md": "Set `SAMPLE_VAR` and `TEMPLATE_VAR`.\n",
        },
        headFiles: {
          ".env.sample": envExample({}),
          ".env.template": envExample({}),
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.summary.confirmed).toBe(2);
    expect(report.findings.map((f) => f.evidence[0].path).sort()).toEqual([
      ".env.sample",
      ".env.template",
    ]);
  });

  it("produces correct JSON structure for env findings", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          ".env.example": envExample({
            DATABASE_URL: "postgres://localhost/db",
          }),
          "README.md": "Set `DATABASE_URL`.\n",
        },
        headFiles: {
          ".env.example": envExample({}),
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    const json = JSON.parse(formatJson(report)) as ScanReport;

    expect(json.schemaVersion).toBe("1.0");
    expect(json.tool).toBe("doc-lag");
    expect(json.findings).toHaveLength(1);
    expect(json.findings[0]).toMatchObject({
      id: expect.stringContaining("env.stale"),
      ruleId: "env.stale",
      status: "confirmed",
      severity: "warning",
      message: expect.any(String),
      documentation: { path: "README.md", line: 1 },
      evidence: expect.any(Array),
      change: { path: ".env.example", kind: "modified" },
      suggestion: expect.any(String),
    });
  });

  it("includes env findings in text output", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          ".env.example": envExample({
            DATABASE_URL: "postgres://localhost/db",
          }),
          "README.md": "Set `DATABASE_URL`.\n",
        },
        headFiles: {
          ".env.example": envExample({}),
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    const text = formatText(report);

    expect(text).toContain("CONFIRMED");
    expect(text).toContain("README.md:1");
    expect(text).toContain("DATABASE_URL");
    expect(text).toContain(".env.example");
  });

  it("exit code 1 for confirmed env findings with --fail-on confirmed", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          ".env.example": envExample({
            DATABASE_URL: "postgres://localhost/db",
          }),
          "README.md": "Set `DATABASE_URL`.\n",
        },
        headFiles: {
          ".env.example": envExample({}),
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(exitCodeFor(report, "confirmed")).toBe(1);
    expect(exitCodeFor(report, "none")).toBe(0);
  });

  it("exit code 0 for needs-review only findings with --fail-on confirmed", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          ".env.example": envExample({
            DATABASE_URL: "postgres://localhost/db",
          }),
          "README.md": `
| Variable | Description |
|----------|-------------|
| DATABASE_URL | Database connection |
`,
        },
        headFiles: {
          ".env.example": envExample({}),
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.summary.confirmed).toBe(0);
    expect(report.summary.needsReview).toBe(1);
    expect(exitCodeFor(report, "confirmed")).toBe(0);
  });

  it("handles code block assignments as confirmed status", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          ".env.example": envExample({
            DATABASE_URL: "postgres://localhost/db",
          }),
          "README.md": `
# Setup

\`\`\`bash
DATABASE_URL=your-connection-string
\`\`\`
`,
        },
        headFiles: {
          ".env.example": envExample({}),
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.summary.confirmed).toBe(1);
    expect(report.findings[0].status).toBe("confirmed");
  });

  it("handles deleted .env.example file", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          ".env.example": envExample({
            DATABASE_URL: "postgres://localhost/db",
          }),
          "README.md": "Set `DATABASE_URL`.\n",
        },
        headFiles: {
          ".env.example": null,
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.summary.confirmed).toBe(1);
    expect(report.findings[0].change.kind).toBe("deleted");
  });

  it("does not report when env file is added with new keys", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          "README.md": "Set `DATABASE_URL`.\n",
        },
        headFiles: {
          ".env.example": envExample({
            DATABASE_URL: "postgres://localhost/db",
          }),
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.findings).toEqual([]);
  });
});
