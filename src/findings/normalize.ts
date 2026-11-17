import type { Finding, FindingStatus, ScanSummary } from "../types.js";

export function makeFindingId(parts: {
  ruleId: string;
  path: string;
  line: number;
  name: string;
}): string {
  return `${parts.ruleId}:${parts.path}:${parts.line}:${parts.name}`;
}

export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareFindings(a: Finding, b: Finding): number {
  return (
    compareStrings(a.documentation.path, b.documentation.path) ||
    a.documentation.line - b.documentation.line ||
    compareStrings(a.ruleId, b.ruleId) ||
    compareStrings(a.id, b.id)
  );
}

export function normalizeFindings(findings: Finding[]): Finding[] {
  const unique = new Map<string, Finding>();
  for (const finding of findings) {
    if (!unique.has(finding.id)) {
      unique.set(finding.id, finding);
    }
  }
  return [...unique.values()].sort(compareFindings);
}

export function summarize(findings: Finding[]): ScanSummary {
  const counts: Record<FindingStatus, number> = {
    confirmed: 0,
    "needs-review": 0,
    unknown: 0,
  };
  for (const finding of findings) {
    counts[finding.status] += 1;
  }
  return {
    confirmed: counts.confirmed,
    needsReview: counts["needs-review"],
    unknown: counts.unknown,
  };
}
