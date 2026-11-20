import type { Finding, ScanReport } from "../types.js";

/** Minimal SARIF 2.1.0 document shape used for GitHub code scanning. */
export interface SarifLog {
  $schema: string;
  version: "2.1.0";
  runs: Array<{
    tool: {
      driver: {
        name: string;
        informationUri?: string;
        rules: Array<{
          id: string;
          shortDescription: { text: string };
          helpUri?: string;
        }>;
      };
    };
    results: Array<{
      ruleId: string;
      level: "error" | "warning" | "note" | "none";
      message: { text: string };
      locations: Array<{
        physicalLocation: {
          artifactLocation: { uri: string };
          region: { startLine: number };
        };
      }>;
      properties?: Record<string, unknown>;
    }>;
  }>;
}

function levelFor(finding: Finding): "error" | "warning" | "note" {
  if (finding.ruleId === "docs.missing") {
    return finding.enforced === true ? "warning" : "note";
  }
  if (finding.status === "confirmed") {
    return finding.severity === "warning" ? "warning" : "note";
  }
  return "note";
}

function ruleShortDescription(ruleId: string): string {
  switch (ruleId) {
    case "scripts.missing":
      return "Documented package script missing after the diff";
    case "links.broken":
      return "Local documentation link broken by the diff";
    case "env.stale":
      return "Documented env var removed from example files";
    case "docs.missing":
      return "Public surface changed without documentation";
    default:
      return ruleId;
  }
}

function locationFor(finding: Finding): { uri: string; startLine: number } {
  if (finding.ruleId === "docs.missing" && finding.surface) {
    if (finding.surface.trigger === "detector" && finding.surface.source) {
      return {
        uri: finding.surface.source.path.replaceAll("\\", "/"),
        startLine: Math.max(1, finding.surface.source.line),
      };
    }
    if (finding.surface.trigger === "rule") {
      const first =
        finding.surface.matchedFiles?.[0] ?? finding.change.path ?? finding.documentation.path;
      return {
        uri: first.replaceAll("\\", "/"),
        startLine: 1,
      };
    }
  }
  return {
    uri: finding.documentation.path.replaceAll("\\", "/"),
    startLine: Math.max(1, finding.documentation.line),
  };
}

/**
 * Convert a scan report into a SARIF 2.1.0 log for GitHub code scanning.
 * Paths are repository-relative (forward slashes) so upload-sarif can resolve them.
 */
export function formatSarif(report: ScanReport): string {
  const ruleIds = [...new Set(report.findings.map((f) => f.ruleId))].sort();
  const log: SarifLog = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: report.tool,
            informationUri: "https://github.com/TarcisioPhilips/doc-lag",
            rules: ruleIds.map((id) => ({
              id,
              shortDescription: { text: ruleShortDescription(id) },
            })),
          },
        },
        results: report.findings.map((finding) => {
          const loc = locationFor(finding);
          return {
            ruleId: finding.ruleId,
            level: levelFor(finding),
            message: {
              text: [
                finding.message,
                `Status: ${finding.status}`,
                `Suggested action: ${finding.suggestion}`,
              ].join("\n"),
            },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: {
                    uri: loc.uri,
                  },
                  region: { startLine: loc.startLine },
                },
              },
            ],
            properties: {
              docLagFindingId: finding.id,
              docLagStatus: finding.status,
              docLagChangePath: finding.change.path,
              docLagChangeKind: finding.change.kind,
              ...(finding.enforced === true ? { docLagEnforced: true } : {}),
              ...(finding.ranking
                ? {
                    docLagJevScore: finding.ranking.score,
                    docLagJevConfidence: finding.ranking.confidence,
                  }
                : {}),
            },
          };
        }),
      },
    ],
  };
  return `${JSON.stringify(log, null, 2)}\n`;
}
