import { describe, expect, it } from "vitest";
import { buildMentionIndex } from "../src/docs-sync/mention-index.js";

describe("buildMentionIndex", () => {
  it("matches action.input in table, heading, inline code, and fenced yaml key", () => {
    const index = buildMentionIndex({
      docs: [
        {
          path: "README.md",
          content: [
            "# Inputs",
            "",
            "| Input | Desc |",
            "| --- | --- |",
            "| `docs-sync` | Enable |",
            "",
            "```yaml",
            "docs-sync:",
            "  description: x",
            "```",
            "",
          ].join("\n"),
        },
      ],
    });
    expect(
      index.hasMention({ kind: "action.input", name: "docs-sync" }),
    ).toBe(true);
    expect(index.hasMention({ kind: "action.input", name: "missing" })).toBe(false);
  });

  it("does not count mentions blanked by MDX/frontmatter preparation", () => {
    const index = buildMentionIndex({
      docs: [
        {
          path: "docs/page.mdx",
          content: [
            "---",
            "title: docs-sync",
            "---",
            "",
            "import X from './x'",
            "",
            "<Note>docs-sync</Note>",
            "",
            "Hello.",
            "",
          ].join("\n"),
        },
      ],
    });
    expect(index.hasMention({ kind: "action.input", name: "docs-sync" })).toBe(false);
  });

  it("package.exports matches pkg/subpath or ./subpath in inline/fenced code only", () => {
    const index = buildMentionIndex({
      docs: [
        {
          path: "README.md",
          content: [
            "Use `doc-lag/utils` or see:",
            "",
            "```",
            "import 'doc-lag/utils'",
            "```",
            "",
            "Also ./utils in prose does not count for exports.",
            "",
          ].join("\n"),
        },
      ],
    });
    expect(
      index.hasMention({ kind: "package.exports", name: "doc-lag/utils" }),
    ).toBe(true);
    expect(
      index.hasMention({ kind: "package.exports", name: "./utils" }),
    ).toBe(false); // only in prose text, not allowed context for bare prose... wait ./utils is in prose as text
  });

  it("package.bin requires a whole-word mention in allowed contexts", () => {
    const index = buildMentionIndex({
      docs: [
        {
          path: "README.md",
          content: "Run `doc-lag` or doc-lag-mcp.\n",
        },
      ],
    });
    expect(index.hasMention({ kind: "package.bin", name: "doc-lag" })).toBe(true);
    expect(index.hasMention({ kind: "package.bin", name: "doc-lag-mcp" })).toBe(false);
  });

  it("respects detector docs globs", () => {
    const index = buildMentionIndex({
      docs: [
        { path: "README.md", content: "`only-here`\n" },
        { path: "docs/other.md", content: "`flag`\n" },
      ],
    });
    expect(
      index.hasMention({
        kind: "package.bin",
        name: "flag",
        docsGlobs: ["README.md"],
      }),
    ).toBe(false);
    expect(
      index.hasMention({
        kind: "package.bin",
        name: "only-here",
        docsGlobs: ["README.md"],
      }),
    ).toBe(true);
  });

  it("countMentionsByDoc prefers the doc with most sibling mentions", () => {
    const index = buildMentionIndex({
      docs: [
        { path: "README.md", content: "`a` and `b`\n" },
        { path: "docs/x.md", content: "`a`\n" },
      ],
    });
    const counts = index.countMentionsByDoc({
      kind: "package.bin",
      names: ["a", "b"],
    });
    expect(counts.get("README.md")?.count).toBeGreaterThan(counts.get("docs/x.md")?.count ?? 0);
  });
});
