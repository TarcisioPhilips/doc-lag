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
