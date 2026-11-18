import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  handleExplainFinding,
  handleListRules,
  handleScanDiff,
} from "../src/mcp/handlers.js";
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

describe("MCP handlers", () => {
  it("scan_diff reports scripts.missing for a committed range", async () => {
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

    const result = await handleScanDiff(
      { workspaceRoot: fixture.repo },
      { base: fixture.base, head: fixture.head },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.findings).toHaveLength(1);
    expect(result.data.findings[0]?.ruleId).toBe("scripts.missing");
    expect(result.text).toContain("scripts.missing");
    expect(result.data.head).toBe(fixture.head);
  });

  it("scan_diff include_working_tree catches uncommitted script removal", async () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({ "deploy:preview": "vite preview" }),
          "README.md": "Use `npm run deploy:preview`.\n",
        },
      }),
    );

    // Uncommitted change: remove the script from package.json on disk.
    writeFileSync(path.join(fixture.repo, "package.json"), packageJson({}), "utf8");

    const committed = await handleScanDiff(
      { workspaceRoot: fixture.repo },
      { base: fixture.base, head: "HEAD", include_working_tree: false },
    );
    expect(committed.ok).toBe(true);
    if (committed.ok) {
      expect(committed.data.findings).toHaveLength(0);
    }

    const dirty = await handleScanDiff(
      { workspaceRoot: fixture.repo },
      { base: fixture.base, head: "HEAD", include_working_tree: true },
    );
    expect(dirty.ok).toBe(true);
    if (!dirty.ok) return;
    expect(dirty.data.head).toBe("WORKING_TREE");
    expect(dirty.data.findings).toHaveLength(1);
    expect(dirty.data.findings[0]?.id).toContain("scripts.missing");
  });

  it("scan_diff defaults base via merge-base with main", async () => {
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
    // Tip on a feature branch; reset main to the base commit for merge-base defaults.
    git(fixture.repo, ["checkout", "-B", "feature", fixture.head]);
    git(fixture.repo, ["branch", "-f", "main", fixture.base]);

    const result = await handleScanDiff(
      { workspaceRoot: fixture.repo },
      { cwd: "." },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.findings.length).toBeGreaterThanOrEqual(1);
    // Default base should be a commit SHA (merge-base), not the literal "main".
    expect(result.data.base).toMatch(/^[0-9a-f]{40}$/);
    expect(result.data.base).toBe(fixture.base);
  });

  it("explain_finding returns full evidence for a known id", async () => {
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

    const scanned = await handleScanDiff(
      { workspaceRoot: fixture.repo },
      { base: fixture.base, head: fixture.head },
    );
    expect(scanned.ok).toBe(true);
    if (!scanned.ok) return;
    const id = scanned.data.findings[0]?.id;
    expect(id).toBeTruthy();

    const explained = handleExplainFinding(
      { workspaceRoot: fixture.repo },
      { finding_id: id!, base: fixture.base, head: fixture.head },
    );
    expect(explained.ok).toBe(true);
    if (!explained.ok) return;
    expect(explained.data.finding.id).toBe(id);
    expect(explained.data.finding.evidence.length).toBeGreaterThan(0);
    expect(explained.text).toContain("Suggested action:");
    expect(explained.data.detail).toContain("CONFIRMED");
  });

  it("explain_finding fails for unknown id", async () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({ build: "tsc" }),
          "README.md": "Hello\n",
        },
      }),
    );

    const result = handleExplainFinding(
      { workspaceRoot: fixture.repo },
      {
        finding_id: "scripts.missing:README.md:1:missing",
        base: fixture.base,
        head: fixture.head,
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.data.error).toContain("Finding not found");
  });

  it("rejects empty finding_id and empty refs", async () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          "README.md": "x\n",
        },
      }),
    );
    const ctx = { workspaceRoot: fixture.repo };

    expect(handleExplainFinding(ctx, { finding_id: "  " }).ok).toBe(false);
    expect((await handleScanDiff(ctx, { base: "", head: fixture.head })).ok).toBe(false);
    expect((await handleScanDiff(ctx, { base: fixture.base, head: "" })).ok).toBe(false);
  });

  it("rejects cwd path traversal outside the workspace root", async () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          "README.md": "x\n",
        },
      }),
    );

    const result = await handleScanDiff(
      { workspaceRoot: fixture.repo },
      { cwd: "../", base: fixture.base, head: fixture.head },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.data.error).toMatch(/escapes repository root/i);
  });

  it("rejects absolute cwd outside the workspace root", async () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          "README.md": "x\n",
        },
      }),
    );
    const outside = path.resolve(fixture.repo, "..");

    const result = await handleScanDiff(
      { workspaceRoot: fixture.repo },
      { cwd: outside, base: fixture.base, head: fixture.head },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.data.error).toMatch(/escapes repository root/i);
  });

  it("rejects invalid git refs", async () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          "README.md": "x\n",
        },
      }),
    );

    const result = await handleScanDiff(
      { workspaceRoot: fixture.repo },
      { base: "definitely-not-a-ref", head: "HEAD" },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.data.error).toMatch(/Invalid git ref|failed/i);
  });

  it("list_rules returns the three shipped rules", async () => {
    const result = handleListRules();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.data.rules.map((rule) => rule.id);
    expect(ids).toEqual(["scripts.missing", "links.broken", "env.stale"]);
    expect(result.text).toContain("scripts.missing");
  });
});

describe("MCP handlers working-tree untracked docs", () => {
  const fixturesLocal: string[] = [];
  afterEach(() => {
    while (fixturesLocal.length > 0) {
      const repo = fixturesLocal.pop();
      if (repo) cleanupFixture(repo);
    }
  });

  it("picks up untracked markdown that references a removed script", async () => {
    const fixture = createFixtureRepo({
      baseFiles: {
        "package.json": packageJson({ "deploy:preview": "vite preview" }),
        "README.md": "# App\n",
      },
    });
    fixturesLocal.push(fixture.repo);

    writeFileSync(path.join(fixture.repo, "package.json"), packageJson({}), "utf8");
    writeFileSync(path.join(fixture.repo, "AGENTS.md"), "Use `npm run deploy:preview`.\n", "utf8");

    const result = await handleScanDiff(
      { workspaceRoot: fixture.repo },
      { base: fixture.base, include_working_tree: true },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.findings.some((f) => f.documentation.path === "AGENTS.md")).toBe(true);
  });

  it("does not leave the real index dirty after working-tree snapshot", async () => {
    const fixture = createFixtureRepo({
      baseFiles: {
        "package.json": packageJson({ build: "tsc" }),
        "README.md": "ok\n",
      },
    });
    fixturesLocal.push(fixture.repo);

    writeFileSync(path.join(fixture.repo, "README.md"), "changed\n", "utf8");
    const before = git(fixture.repo, ["status", "--porcelain"]);
    await handleScanDiff(
      { workspaceRoot: fixture.repo },
      { base: fixture.base, include_working_tree: true },
    );
    const after = git(fixture.repo, ["status", "--porcelain"]);
    expect(after).toBe(before);
  });
});
