import type { Finding, FindingSeverity, ScanReport } from "../types.js";

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

function levelFor(severity: FindingSeverity, status: Finding["status"]): "error" | "warning" | "note" {
  if (status === "confirmed") {
    return severity === "warning" ? "warning" : "note";
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
    default:
      return ruleId;
  }
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
        results: report.findings.map((finding) => ({
          ruleId: finding.ruleId,
          level: levelFor(finding.severity, finding.status),
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
                  uri: finding.documentation.path.replaceAll("\\", "/"),
                },
                region: { startLine: Math.max(1, finding.documentation.line) },
              },
            },
          ],
          properties: {
            docLagFindingId: finding.id,
            docLagStatus: finding.status,
            docLagChangePath: finding.change.path,
            docLagChangeKind: finding.change.kind,
            ...(finding.ranking
              ? {
                  docLagJevScore: finding.ranking.score,
                  docLagJevConfidence: finding.ranking.confidence,
                }
              : {}),
          },
        })),
      },
    ],
  };
  return `${JSON.stringify(log, null, 2)}\n`;
}
