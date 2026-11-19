import { describe, expect, it } from "vitest";
import {
  neutralizeMdxJsx,
  prepareDocumentationContent,
  stripMdxImportExport,
  stripYamlFrontmatter,
} from "../src/core/doc-content.js";
import { extractEnvReferences } from "../src/extractors/markdown-env.js";
import { extractLocalLinks } from "../src/extractors/markdown-links.js";
import { extractScriptInvocations } from "../src/extractors/markdown-scripts.js";

describe("stripYamlFrontmatter", () => {
  it("blanks opening frontmatter only and preserves line numbers", () => {
    const input = "---\ntitle: Hello\nAPI_KEY: secret\n---\n\nBody `API_KEY`.\n";
    const stripped = stripYamlFrontmatter(input);
    expect(stripped).toContain("Body `API_KEY`.");
    expect(stripped).not.toContain("API_KEY: secret");
    expect(stripped.split("\n").length).toBe(input.split("\n").length);
    expect(stripped.split("\n")[5]).toContain("Body `API_KEY`.");
  });

  it("keeps later horizontal rules", () => {
    const input = "Hello\n\n---\n\nMore\n";
    expect(stripYamlFrontmatter(input)).toBe(input);
  });
});

describe("stripMdxImportExport", () => {
  it("blanks single- and multi-line imports/exports", () => {
    const input = [
      "import Foo from './src/gone.ts'",
      "import {",
      "  Bar,",
      "} from './lib/bar.ts'",
      "export const meta = { title: 'x' }",
      "",
      "Hello",
    ].join("\n");
    const stripped = stripMdxImportExport(input);
    expect(stripped).toContain("Hello");
    expect(stripped).not.toContain("gone.ts");
    expect(stripped).not.toContain("bar.ts");
    expect(stripped.split("\n").length).toBe(input.split("\n").length);
  });
});

describe("neutralizeMdxJsx", () => {
  it("drops tags and brace expressions but keeps markdown claims", () => {
    const input =
      '<Callout path="src/gone.ts" />\n\nUse `npm run deploy:preview`.\n\n{`ignore me`}\n';
    const out = neutralizeMdxJsx(input);
    expect(out).not.toContain("src/gone.ts");
    expect(out).toContain("`npm run deploy:preview`");
  });
});

describe("prepareDocumentationContent", () => {
  it("strips frontmatter for markdown", () => {
    const prepared = prepareDocumentationContent(
      "---\nAPI_KEY: x\n---\n\nSee `API_KEY`.\n",
      "docs/setup.md",
    );
    expect(prepared).not.toMatch(/^API_KEY:/m);
    expect(extractEnvReferences(prepared, "docs/setup.md").map((r) => r.key)).toEqual([
      "API_KEY",
    ]);
  });

  it("prevents import-path false positives on MDX while keeping scripts", () => {
    const raw = [
      "import Gone from './src/gone.ts'",
      "",
      "Run `npm run deploy:preview`.",
      "",
      "[legacy](./src/gone.ts)",
    ].join("\n");
    const prepared = prepareDocumentationContent(raw, "website/docs/guide.mdx");
    expect(extractScriptInvocations(prepared, "website/docs/guide.mdx").map((i) => i.script)).toEqual([
      "deploy:preview",
    ]);
    // Bare import path must not become an inline-code link; markdown link remains.
    const links = extractLocalLinks(prepared, "website/docs/guide.mdx");
    expect(links.some((l) => l.kind === "inline-code" && l.targetPath.includes("gone"))).toBe(
      false,
    );
    expect(links.some((l) => l.kind === "markdown" && l.targetPath.endsWith("src/gone.ts"))).toBe(
      true,
    );
  });

  it("does not treat frontmatter keys as env references in MDX", () => {
    const raw = "---\nAPI_KEY: from-frontmatter\n---\n\nNo env in body.\n";
    const prepared = prepareDocumentationContent(raw, "apps/docs/env.mdx");
    expect(extractEnvReferences(prepared, "apps/docs/env.mdx")).toEqual([]);
  });
});
