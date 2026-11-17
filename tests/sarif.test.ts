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
});
