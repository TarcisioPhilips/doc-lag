import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scan } from "../src/core/scan.js";
import { detectEnvAdded } from "../src/docs-sync/detectors/env-added.js";
import {
  cleanupFixture,
  createFixtureRepo,
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

function writeDocsSync(repo: string, docsSync: Record<string, unknown>): void {
  writeFileSync(
    path.join(repo, "doc-lag.config.json"),
    JSON.stringify({ docsSync }, null, 2),
    "utf8",
  );
}

describe("detectEnvAdded unit", () => {
  it("extracts keys from .env.example family files only", () => {
    const content = `# comment
EXISTING=1
NEW_KEY=value
# SKIPPED=1
not_a_key=1
`;
    const names = detectEnvAdded(".env.example", content).map((s) => s.name).sort();
    expect(names).toEqual(["EXISTING", "NEW_KEY"]);
    expect(detectEnvAdded("README.md", content)).toHaveLength(0);
    expect(detectEnvAdded("src/.env.sample", "FOO=1\n")).toEqual([
      expect.objectContaining({ kind: "env.added", name: "FOO", path: "src/.env.sample" }),
    ]);
  });
});

describe("docs-sync env.added scan fixtures", () => {
  it("env-added-opt-in-undocumented → 1 finding when detector enabled", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "README.md": "# setup\n",
          ".env.example": "EXISTING=1\n",
        },
        headFiles: {
          ".env.example": "EXISTING=1\nNEW_API_KEY=secret\n",
        },
      }),
    );
    writeDocsSync(fixture.repo, {
      detectors: { "env.added": true },
    });
    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.docsSync?.status).toBe("ran");
    expect(report.findings.map((f) => f.id)).toContain(
      "docs.missing:env.added:NEW_API_KEY@.env.example",
    );
    expect(report.findings.filter((f) => f.id.includes("EXISTING"))).toHaveLength(0);
  });

  it("env-added-opt-in documented → 0", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "README.md": "Set `NEW_API_KEY` in `.env.example`.\n",
          ".env.example": "EXISTING=1\n",
        },
        headFiles: {
          ".env.example": "EXISTING=1\nNEW_API_KEY=secret\n",
        },
      }),
    );
    writeDocsSync(fixture.repo, {
      detectors: { "env.added": true },
    });
    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.findings.filter((f) => f.id.includes("env.added"))).toHaveLength(0);
  });

  it("env-added-disabled-default → 0 when detector left off", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "README.md": "# setup\n",
          ".env.example": "EXISTING=1\n",
        },
        headFiles: {
          ".env.example": "EXISTING=1\nNEW_API_KEY=secret\n",
        },
      }),
    );
    // docsSync on, but env.added stays at default (false)
    writeDocsSync(fixture.repo, {});
    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.docsSync?.status).toBe("ran");
    expect(report.findings.filter((f) => f.id.includes("env.added"))).toHaveLength(0);
  });

  it("docsSync off → no docs.missing / no docsSync metadata", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "README.md": "# setup\n",
          ".env.example": "EXISTING=1\n",
        },
        headFiles: {
          ".env.example": "EXISTING=1\nNEW_API_KEY=secret\n",
        },
      }),
    );
    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.docsSync).toBeUndefined();
    expect(report.findings.filter((f) => f.ruleId === "docs.missing")).toHaveLength(0);
  });
});
