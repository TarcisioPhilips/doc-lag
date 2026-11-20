import { describe, expect, it } from "vitest";
import {
  formatCommentBody,
  isStickyComment,
  STICKY_COMMENT_MARKER,
} from "../src/action/comment.js";
import { formatJobSummary } from "../src/action/summary.js";
import { upsertStickyComment, type GithubApiClient, type IssueComment } from "../src/action/github.js";
import type { ScanReport } from "../src/types.js";
import { SCHEMA_VERSION, TOOL_NAME } from "../src/types.js";

function reportWithFindings(): ScanReport {
  return {
    schemaVersion: SCHEMA_VERSION,
    tool: TOOL_NAME,
    mode: "diff",
    base: "aaa111",
    head: "bbb222",
    findings: [
      {
        id: "scripts.missing:README.md:1:deploy:preview",
        ruleId: "scripts.missing",
        status: "confirmed",
        severity: "warning",
        message: "`npm run deploy:preview` is documented but no longer exists in package.json scripts.",
        documentation: { path: "README.md", line: 1 },
        evidence: [
          {
            path: "package.json",
            pointer: "/scripts/deploy:preview",
            base: "vite preview",
            head: undefined,
          },
        ],
        change: { path: "package.json", kind: "modified" },
        suggestion: "Update the documented command or restore the script",
      },
      {
        id: "links.broken:docs/guide.md:4:src/old.ts",
        ruleId: "links.broken",
        status: "needs-review",
        severity: "info",
        message: "`src/old.ts` may reference a deleted path.",
        documentation: { path: "docs/guide.md", line: 4 },
        evidence: [{ path: "src/old.ts", pointer: "deleted" }],
        change: { path: "src/old.ts", kind: "deleted" },
        suggestion: "Confirm the inline path and update docs if needed.",
      },
    ],
    summary: { confirmed: 1, needsReview: 1, unknown: 0 },
  };
}

function reportWithDocsMissing(enforced = false): ScanReport {
  return {
    schemaVersion: SCHEMA_VERSION,
    tool: TOOL_NAME,
    mode: "diff",
    base: "aaa111",
    head: "bbb222",
    findings: [
      {
        id: "scripts.missing:README.md:1:deploy:preview",
        ruleId: "scripts.missing",
        status: "confirmed",
        severity: "warning",
        message: "`npm run deploy:preview` is documented but no longer exists.",
        documentation: { path: "README.md", line: 1 },
        evidence: [
          {
            path: "package.json",
            pointer: "/scripts/deploy:preview",
            base: "vite preview",
            head: undefined,
          },
        ],
        change: { path: "package.json", kind: "modified" },
        suggestion: "Update the documented command or restore the script",
      },
      {
        id: "docs.missing:cli.flag:--docs-sync@src/cli.ts",
        ruleId: "docs.missing",
        status: "needs-review",
        severity: "warning",
        message:
          "New CLI flag `--docs-sync` (src/cli.ts:131) is not mentioned in any documentation.",
        documentation: { path: "README.md", line: 88 },
        evidence: [
          {
            path: "src/cli.ts",
            pointer: "#L131",
            base: null,
            head: '".option(\\"--docs-sync\\")"',
          },
        ],
        change: { path: "src/cli.ts", kind: "modified" },
        suggestion:
          "Document `--docs-sync` in README.md near line 88, next to `--fail-on`, `--rank`, `--config`.",
        enforced: enforced || undefined,
        surface: {
          trigger: "detector",
          kind: "cli.flag",
          name: "--docs-sync",
          source: { path: "src/cli.ts", line: 131 },
          expectedDocs: ["**"],
        },
      },
      {
        id: "docs.missing:rule:mcp",
        ruleId: "docs.missing",
        status: "needs-review",
        severity: "warning",
        message:
          'Files matching rule "mcp" changed (1 file(s)) but no documentation matching docs/AGENT_SETUP.md was updated.',
        documentation: { path: "docs/AGENT_SETUP.md", line: 1 },
        evidence: [{ path: "src/mcp/server.ts", pointer: "changed", head: "modified" }],
        change: { path: "src/mcp/server.ts", kind: "modified" },
        suggestion: "Update docs/AGENT_SETUP.md to reflect the change.",
        enforced: enforced || undefined,
        surface: {
          trigger: "rule",
          rule: "mcp",
          matchedFiles: ["src/mcp/server.ts"],
          matchedFilesTotal: 1,
          expectedDocs: ["docs/AGENT_SETUP.md"],
        },
      },
      {
        id: "links.broken:docs/guide.md:4:src/old.ts",
        ruleId: "links.broken",
        status: "needs-review",
        severity: "info",
        message: "`src/old.ts` may reference a deleted path.",
        documentation: { path: "docs/guide.md", line: 4 },
        evidence: [{ path: "src/old.ts", pointer: "deleted" }],
        change: { path: "src/old.ts", kind: "deleted" },
        suggestion: "Confirm the inline path and update docs if needed.",
      },
    ],
    summary: { confirmed: 1, needsReview: 3, unknown: 0 },
    docsSync: {
      status: "ran",
      enforced,
      effectiveBase: "aaa111",
      detectors: ["cli.flag"],
      rulesEvaluated: 1,
      candidateFiles: 2,
      newSurfaces: 1,
      findings: 2,
      omitted: 0,
      warnings: [],
    },
  };
}

describe("sticky comment rendering", () => {
  it("includes marker, confirmed vs needs-review sections, evidence, and suggested fix", () => {
    const body = formatCommentBody(reportWithFindings());
    expect(body.startsWith(STICKY_COMMENT_MARKER)).toBe(true);
    expect(body).toContain("## doc-lag report");
    expect(body).toContain("**1** confirmed, **1** needs-review");
    expect(body).toContain("### Confirmed");
    expect(body).toContain("### Needs review");
    expect(body).toContain("`README.md:1` — `scripts.missing` (CONFIRMED)");
    expect(body).toContain("Suggested fix: Update the documented command or restore the script");
    expect(body).toContain("package.json#scripts");
    expect(body).toContain("`docs/guide.md:4`");
    expect(isStickyComment(body)).toBe(true);
  });

  it("renders a clean empty report", () => {
    const body = formatCommentBody({
      ...reportWithFindings(),
      findings: [],
      summary: { confirmed: 0, needsReview: 0, unknown: 0 },
    });
    expect(body).toContain("No documentation drift findings");
    expect(body).not.toContain("### Confirmed");
  });

  it("job summary matches comment content without the HTML marker", () => {
    const report = reportWithFindings();
    const summary = formatJobSummary(report);
    expect(summary).not.toContain(STICKY_COMMENT_MARKER);
    expect(summary).toContain("## doc-lag report");
    expect(summary).toContain("### Confirmed");
  });

  it("Missing documentation section sits between Confirmed and Needs review", () => {
    const body = formatCommentBody(reportWithDocsMissing());
    expect(body).toContain("**1** confirmed, **1** needs-review, **2** missing docs");
    expect(body).toContain("### Missing documentation");
    expect(body).toContain("`README.md:88` — `--docs-sync` (CLI flag, NEEDS-REVIEW)");
    expect(body).toContain("Declared at: `src/cli.ts:131`");
    expect(body).toContain("`docs/AGENT_SETUP.md:1` — rule `mcp` (NEEDS-REVIEW)");
    expect(body).toContain("No docs needed? Add the `no-docs-needed` label");
    // docs.missing must not also appear under Needs review
    const needsIdx = body.indexOf("### Needs review");
    const missingIdx = body.indexOf("### Missing documentation");
    const confirmedIdx = body.indexOf("### Confirmed");
    expect(confirmedIdx).toBeGreaterThan(-1);
    expect(missingIdx).toBeGreaterThan(confirmedIdx);
    expect(needsIdx).toBeGreaterThan(missingIdx);
    const needsSection = body.slice(needsIdx);
    expect(needsSection).toContain("links.broken");
    expect(needsSection).not.toContain("docs.missing");
    expect(needsSection).not.toContain("--docs-sync");
  });

  it("enforced Missing documentation title and skip line", () => {
    const enforced = formatCommentBody(reportWithDocsMissing(true));
    expect(enforced).toContain("### Missing documentation (enforced — fails this check)");

    const skipped = formatCommentBody({
      ...reportWithFindings(),
      findings: reportWithFindings().findings.filter((f) => f.status === "confirmed"),
      summary: { confirmed: 1, needsReview: 0, unknown: 0 },
      docsSync: {
        status: "skipped",
        skipReason: "label:no-docs-needed",
        enforced: false,
        effectiveBase: "aaa111",
        detectors: [],
        rulesEvaluated: 0,
        candidateFiles: 0,
        newSurfaces: 0,
        findings: 0,
        omitted: 0,
        warnings: [],
      },
    });
    expect(skipped).toContain("Docs sync check skipped (label `no-docs-needed`).");
    expect(skipped).not.toContain("### Missing documentation");
  });
});

describe("upsertStickyComment", () => {
  it("creates a comment when none exists", async () => {
    const created: IssueComment[] = [];
    const client: GithubApiClient = {
      listIssueComments: async () => [],
      createIssueComment: async (_o, _r, _n, body) => {
        const comment = { id: 42, body };
        created.push(comment);
        return comment;
      },
      updateIssueComment: async () => {
        throw new Error("should not update");
      },
    };
    const result = await upsertStickyComment({
      owner: "acme",
      repo: "app",
      issueNumber: 7,
      body: formatCommentBody(reportWithFindings()),
      client,
    });
    expect(result).toEqual({ ok: true, commentId: 42, updated: false });
    expect(created).toHaveLength(1);
    expect(isStickyComment(created[0]?.body)).toBe(true);
  });

  it("updates an existing sticky comment", async () => {
    const client: GithubApiClient = {
      listIssueComments: async () => [
        { id: 1, body: "unrelated" },
        { id: 9, body: `${STICKY_COMMENT_MARKER}\nold` },
      ],
      createIssueComment: async () => {
        throw new Error("should not create");
      },
      updateIssueComment: async (_o, _r, commentId, body) => ({ id: commentId, body }),
    };
    const result = await upsertStickyComment({
      owner: "acme",
      repo: "app",
      issueNumber: 7,
      body: `${STICKY_COMMENT_MARKER}\nnew`,
      client,
    });
    expect(result).toEqual({ ok: true, commentId: 9, updated: true });
  });

  it("treats 403 as a non-fatal permission failure", async () => {
    const client: GithubApiClient = {
      listIssueComments: async () => {
        const error = new Error("Forbidden");
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
    const result = await upsertStickyComment({
      owner: "acme",
      repo: "app",
      issueNumber: 7,
      body: "x",
      client,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("permission");
    }
  });
});
