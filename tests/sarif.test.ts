import { describe, expect, it } from "vitest";
import { formatSarif } from "../src/reporters/sarif.js";
import type { ScanReport } from "../src/types.js";
import { SCHEMA_VERSION, TOOL_NAME } from "../src/types.js";

describe("formatSarif", () => {
  it("emits SARIF 2.1.0 with finding locations and properties", () => {
    const report: ScanReport = {
      schemaVersion: SCHEMA_VERSION,
      tool: TOOL_NAME,
      mode: "diff",
      base: "a",
      head: "b",
      findings: [
        {
          id: "env.stale:docs/setup.md:8:DATABASE_URL",
          ruleId: "env.stale",
          status: "confirmed",
          severity: "warning",
          message: "`DATABASE_URL` was removed from .env.example.",
          documentation: { path: "docs/setup.md", line: 8 },
          evidence: [{ path: ".env.example", pointer: "/env/DATABASE_URL" }],
          change: { path: ".env.example", kind: "modified" },
          suggestion: "Update docs or restore the env var.",
        },
      ],
      summary: { confirmed: 1, needsReview: 0, unknown: 0 },
    };

    const parsed = JSON.parse(formatSarif(report)) as {
      version: string;
      runs: Array<{
        tool: { driver: { name: string; rules: Array<{ id: string }> } };
        results: Array<{
          ruleId: string;
          level: string;
          locations: Array<{
            physicalLocation: {
              artifactLocation: { uri: string };
              region: { startLine: number };
            };
          }>;
          properties: { docLagFindingId: string; docLagStatus: string };
        }>;
      }>;
    };

    expect(parsed.version).toBe("2.1.0");
    expect(parsed.runs[0]?.tool.driver.name).toBe("doc-lag");
    expect(parsed.runs[0]?.tool.driver.rules.map((r) => r.id)).toEqual(["env.stale"]);
    expect(parsed.runs[0]?.results[0]?.ruleId).toBe("env.stale");
    expect(parsed.runs[0]?.results[0]?.level).toBe("warning");
    expect(parsed.runs[0]?.results[0]?.locations[0]?.physicalLocation.artifactLocation.uri).toBe(
      "docs/setup.md",
    );
    expect(parsed.runs[0]?.results[0]?.locations[0]?.physicalLocation.region.startLine).toBe(8);
    expect(parsed.runs[0]?.results[0]?.properties.docLagFindingId).toContain("DATABASE_URL");
    expect(parsed.runs[0]?.results[0]?.properties.docLagStatus).toBe("confirmed");
  });

  it("docs.missing detector → declaration site; rule → first matched file; enforced → warning", () => {
    const report: ScanReport = {
      schemaVersion: SCHEMA_VERSION,
      tool: TOOL_NAME,
      mode: "diff",
      base: "a",
      head: "b",
      findings: [
        {
          id: "docs.missing:cli.flag:--foo@src/cli.ts",
          ruleId: "docs.missing",
          status: "needs-review",
          severity: "warning",
          message: "New CLI flag `--foo` (src/cli.ts:10) is not mentioned in any documentation.",
          documentation: { path: "README.md", line: 40 },
          evidence: [{ path: "src/cli.ts", pointer: "#L10", base: null, head: '"--foo"' }],
          change: { path: "src/cli.ts", kind: "modified" },
          suggestion: "Document `--foo` in README.md.",
          surface: {
            trigger: "detector",
            kind: "cli.flag",
            name: "--foo",
            source: { path: "src/cli.ts", line: 10 },
            expectedDocs: ["**"],
          },
        },
        {
          id: "docs.missing:rule:cli",
          ruleId: "docs.missing",
          status: "needs-review",
          severity: "warning",
          message: 'Files matching rule "cli" changed (1 file(s)) but no documentation was updated.',
          documentation: { path: "README.md", line: 1 },
          evidence: [{ path: "src/cli/main.ts", pointer: "changed", head: "modified" }],
          change: { path: "src/cli/main.ts", kind: "modified" },
          suggestion: "Update README.md.",
          enforced: true,
          surface: {
            trigger: "rule",
            rule: "cli",
            matchedFiles: ["src/cli/main.ts", "src/cli/other.ts"],
            matchedFilesTotal: 2,
            expectedDocs: ["README.md"],
          },
        },
      ],
      summary: { confirmed: 0, needsReview: 2, unknown: 0 },
      docsSync: {
        status: "ran",
        enforced: true,
        effectiveBase: "a",
        detectors: ["cli.flag"],
        rulesEvaluated: 1,
        candidateFiles: 2,
        newSurfaces: 1,
        findings: 2,
        omitted: 0,
        warnings: [],
      },
    };

    const parsed = JSON.parse(formatSarif(report)) as {
      runs: Array<{
        tool: { driver: { rules: Array<{ id: string; shortDescription: { text: string } }> } };
        results: Array<{
          ruleId: string;
          level: string;
          locations: Array<{
            physicalLocation: {
              artifactLocation: { uri: string };
              region: { startLine: number };
            };
          }>;
        }>;
      }>;
    };

    expect(parsed.runs[0]?.tool.driver.rules).toEqual([
      {
        id: "docs.missing",
        shortDescription: { text: "Public surface changed without documentation" },
      },
    ]);

    const detector = parsed.runs[0]?.results[0];
    expect(detector?.level).toBe("note");
    expect(detector?.locations[0]?.physicalLocation.artifactLocation.uri).toBe("src/cli.ts");
    expect(detector?.locations[0]?.physicalLocation.region.startLine).toBe(10);

    const rule = parsed.runs[0]?.results[1];
    expect(rule?.level).toBe("warning");
    expect(rule?.locations[0]?.physicalLocation.artifactLocation.uri).toBe("src/cli/main.ts");
    expect(rule?.locations[0]?.physicalLocation.region.startLine).toBe(1);
  });
});
