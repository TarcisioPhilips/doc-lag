import { afterEach, describe, expect, it } from "vitest";
import { scan } from "../src/core/scan.js";
import { extractLocalLinks } from "../src/extractors/markdown-links.js";
import { exitCodeFor } from "../src/reporters/exit-code.js";
import { formatJson } from "../src/reporters/json.js";
import { formatText } from "../src/reporters/text.js";
import type { ScanReport } from "../src/types.js";
import {
  cleanupFixture,
  createFixtureRepo,
  git,
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

describe("extractLocalLinks", () => {
  it("extracts markdown links and strips anchors", () => {
    const markdown = `
See [the guide](docs/guide.md) for more info.
Also check [setup](./setup.md#installation) section.
`;
    const links = extractLocalLinks(markdown, "README.md");
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({
      docPath: "README.md",
      line: 2,
      targetPath: "docs/guide.md",
      kind: "markdown",
    });
    expect(links[1]).toMatchObject({
      docPath: "README.md",
      line: 3,
      targetPath: "setup.md",
      kind: "markdown",
      anchor: "installation",
    });
  });

  it("extracts image links", () => {
    const markdown = `
![Architecture](./images/arch.png)
![Logo](docs/assets/logo.svg)
`;
    const links = extractLocalLinks(markdown, "README.md");
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({
      targetPath: "images/arch.png",
      kind: "image",
    });
    expect(links[1]).toMatchObject({
      targetPath: "docs/assets/logo.svg",
      kind: "image",
    });
  });

  it("extracts inline code paths that look like repo paths", () => {
    const markdown = `
See \`src/lib/utils.ts\` for helpers.
The config is at \`config/app.json\`.
`;
    const links = extractLocalLinks(markdown, "docs/guide.md");
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({
      targetPath: "src/lib/utils.ts",
      kind: "inline-code",
    });
    expect(links[1]).toMatchObject({
      targetPath: "config/app.json",
      kind: "inline-code",
    });
  });

  it("ignores external URLs", () => {
    const markdown = `
Check [Google](https://google.com) for more.
See [docs](http://example.com/docs).
Contact us at [email](mailto:test@example.com).
Jump to [section](#local-anchor).
`;
    const links = extractLocalLinks(markdown, "README.md");
    expect(links).toHaveLength(0);
  });

  it("ignores inline code that does not look like repo paths", () => {
    const markdown = `
Run \`npm install\` to start.
Use \`--verbose\` flag.
Set \`NODE_ENV\` to production.
The \`main\` branch is protected.
`;
    const links = extractLocalLinks(markdown, "README.md");
    expect(links).toHaveLength(0);
  });

  it("resolves relative paths from doc directory", () => {
    const markdown = `See [parent](../README.md) and [sibling](./other.md).`;
    const links = extractLocalLinks(markdown, "docs/guide.md");
    expect(links[0].targetPath).toBe("README.md");
    expect(links[1].targetPath).toBe("docs/other.md");
  });
});

describe("scan: links.broken", () => {
  it("reports a confirmed finding when a deleted file is linked from docs", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          "src/lib/utils.ts": "export const helper = () => {};",
          "README.md": "See [utils](src/lib/utils.ts) for helpers.\n",
        },
        headFiles: {
          "src/lib/utils.ts": null,
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.summary.confirmed).toBe(1);
    expect(report.findings).toHaveLength(1);

    const finding = report.findings[0];
    expect(finding.ruleId).toBe("links.broken");
    expect(finding.status).toBe("confirmed");
    expect(finding.severity).toBe("warning");
    expect(finding.documentation).toEqual({ path: "README.md", line: 1 });
    expect(finding.message).toContain("deleted");
    expect(finding.change).toEqual({ path: "src/lib/utils.ts", kind: "deleted" });
    expect(finding.suggestion).toContain("Remove the broken link");
  });

  it("reports a confirmed finding with rename suggestion when file is renamed", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          "src/preview.ts": "export function buildPreview() {}",
          "README.md": "See [preview](src/preview.ts) for the builder.\n",
        },
      }),
    );

    git(fixture.repo, ["mv", "src/preview.ts", "src/preview-engine.ts"]);
    git(fixture.repo, ["add", "-A"]);
    git(fixture.repo, ["-c", "commit.gpgsign=false", "commit", "-m", "head"]);
    fixture.head = git(fixture.repo, ["rev-parse", "HEAD"]).trim();

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.summary.confirmed).toBe(1);

    const finding = report.findings[0];
    expect(finding.ruleId).toBe("links.broken");
    expect(finding.status).toBe("confirmed");
    expect(finding.message).toContain("renamed");
    expect(finding.change).toEqual({ path: "src/preview.ts", kind: "renamed" });
    expect(finding.suggestion).toContain("src/preview-engine.ts");
    expect(finding.evidence[0]).toMatchObject({
      path: "src/preview.ts",
      head: "src/preview-engine.ts",
    });
  });

  it("does not report pre-existing broken links that were not in base", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          "README.md": "See [missing](src/nonexistent.ts) for helpers.\n",
          "src/index.ts": "export const value = 1;",
        },
        headFiles: {
          "src/index.ts": "export const value = 2;",
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.findings).toHaveLength(0);
    expect(report.summary).toEqual({ confirmed: 0, needsReview: 0, unknown: 0 });
  });

  it("ignores external URLs in markdown links", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          "README.md":
            "Check [Google](https://google.com) and [docs](http://example.com).\n",
          "src/index.ts": "export const value = 1;",
        },
        headFiles: {
          "src/index.ts": null,
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.findings).toHaveLength(0);
  });

  it("handles anchors by checking file existence without anchor", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          "docs/guide.md": "# Installation\n\nSome content.",
          "README.md": "See [installation](docs/guide.md#installation) for setup.\n",
        },
        headFiles: {
          "docs/guide.md": null,
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.summary.confirmed).toBe(1);
    expect(report.findings[0].documentation).toEqual({ path: "README.md", line: 1 });
  });

  it("reports inline-code paths as needs-review status", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          "src/lib/utils.ts": "export const helper = () => {};",
          "README.md": "The file `src/lib/utils.ts` contains helpers.\n",
        },
        headFiles: {
          "src/lib/utils.ts": null,
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.summary.needsReview).toBe(1);
    expect(report.summary.confirmed).toBe(0);

    const finding = report.findings[0];
    expect(finding.ruleId).toBe("links.broken");
    expect(finding.status).toBe("needs-review");
  });

  it("reports image links as confirmed when image file is deleted", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          "images/logo.png": "fake image content",
          "README.md": "![Logo](images/logo.png)\n",
        },
        headFiles: {
          "images/logo.png": null,
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.summary.confirmed).toBe(1);
    expect(report.findings[0].status).toBe("confirmed");
  });

  it("reports multiple broken links from different docs", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          "src/utils.ts": "export const util = 1;",
          "README.md": "See [utils](src/utils.ts).\n",
          "docs/guide.md": "Also see [utils](../src/utils.ts).\n",
          "AGENTS.md": "Reference `src/utils.ts` in code.\n",
        },
        headFiles: {
          "src/utils.ts": null,
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.findings).toHaveLength(3);

    const statuses = report.findings.map((f) => f.status);
    expect(statuses.filter((s) => s === "confirmed")).toHaveLength(2);
    expect(statuses.filter((s) => s === "needs-review")).toHaveLength(1);
  });

  it("produces correct JSON structure for broken links", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          "src/index.ts": "export const main = 1;",
          "README.md": "See [main](src/index.ts) module.\n",
        },
        headFiles: {
          "src/index.ts": null,
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    const json = JSON.parse(formatJson(report)) as ScanReport;

    expect(json.schemaVersion).toBe("1.0");
    expect(json.tool).toBe("doc-lag");
    expect(json.findings).toHaveLength(1);
    expect(json.findings[0]).toMatchObject({
      id: expect.stringContaining("links.broken"),
      ruleId: "links.broken",
      status: "confirmed",
      severity: "warning",
      message: expect.any(String),
      documentation: { path: "README.md", line: 1 },
      evidence: expect.any(Array),
      change: { path: "src/index.ts", kind: "deleted" },
      suggestion: expect.any(String),
    });
  });

  it("includes broken links in text output", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          "src/index.ts": "export const main = 1;",
          "README.md": "See [main](src/index.ts) module.\n",
        },
        headFiles: {
          "src/index.ts": null,
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    const text = formatText(report);

    expect(text).toContain("CONFIRMED");
    expect(text).toContain("README.md:1");
    expect(text).toContain("src/index.ts");
    expect(text).toContain("deleted");
  });

  it("exit code 1 for confirmed broken links with --fail-on confirmed", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          "src/index.ts": "export const main = 1;",
          "README.md": "See [main](src/index.ts).\n",
        },
        headFiles: {
          "src/index.ts": null,
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
          "src/lib/utils.ts": "export const util = 1;",
          "README.md": "Reference `src/lib/utils.ts` in code.\n",
        },
        headFiles: {
          "src/lib/utils.ts": null,
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.summary.confirmed).toBe(0);
    expect(report.summary.needsReview).toBe(1);
    expect(exitCodeFor(report, "confirmed")).toBe(0);
  });

  it("handles deleted directories referenced via paths inside them", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          "src/lib/helpers/format.ts": "export const format = () => {};",
          "src/lib/helpers/parse.ts": "export const parse = () => {};",
          "README.md": "See [format](src/lib/helpers/format.ts).\n",
        },
        headFiles: {
          "src/lib/helpers/format.ts": null,
          "src/lib/helpers/parse.ts": null,
        },
      }),
    );

    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.summary.confirmed).toBe(1);
  });
});
