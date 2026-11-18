import type { EvidenceItem, ScanReport } from "../types.js";

function formatEvidence(item: EvidenceItem): string[] {
  if (item.pointer === "deleted") {
    return [`Evidence: ${item.path}`, `  deleted in this diff`];
  }
  if (item.pointer.startsWith("renamed → ")) {
    const newPath = item.pointer.slice("renamed → ".length);
    return [`Evidence: ${item.path}`, `  renamed → ${newPath}`];
  }
  if (item.path === "jev" && item.pointer === "/relevance") {
    const head = item.head as { score?: number; confidence?: number } | undefined;
    if (head && typeof head.score === "number") {
      return [
        `Evidence: jev#relevance`,
        `  score=${head.score.toFixed(2)} confidence=${Number(head.confidence ?? 0).toFixed(2)}`,
      ];
    }
    return [`Evidence: jev#relevance`];
  }

  const lines = [`Evidence: ${item.path}${pointerToHash(item.pointer)}`];
  const factName = factNameFromPointer(item.pointer);
  if (factName) {
    lines.push(`  base: ${describePresence(factName, item.base)}`);
    lines.push(`  head: ${describePresence(factName, item.head)}`);
  }
  return lines;
}

function pointerToHash(pointer: string): string {
  if (pointer === "/scripts" || pointer.startsWith("/scripts/")) {
    return "#scripts";
  }
  if (pointer.startsWith("/env/")) {
    return "#env";
  }
  return pointer;
}

function factNameFromPointer(pointer: string): string | null {
  if (pointer.startsWith("/scripts/")) {
    return pointer
      .slice("/scripts/".length)
      .replaceAll("~1", "/")
      .replaceAll("~0", "~");
  }
  if (pointer.startsWith("/env/")) {
    return pointer.slice("/env/".length);
  }
  return null;
}

function describePresence(name: string, value: unknown): string {
  if (value === undefined || value === null) {
    return `"${name}" is absent`;
  }
  return `"${name}" was present`;
}

function findingBlock(reportLine: string, rest: string[]): string {
  return [reportLine, ...rest].join("\n");
}

export function formatText(report: ScanReport): string {
  const count = report.findings.length;
  const noun = count === 1 ? "finding" : "findings";
  const header = `doc-lag  ${count} ${noun}  (${report.base}..${report.head})`;
  if (count === 0) {
    return `${header}${formatRankingFooter(report)}\n`;
  }
  const blocks = report.findings.map((finding) => {
    const status = finding.status.toUpperCase();
    const location = `${finding.documentation.path}:${finding.documentation.line}`;
    const evidenceLines = finding.evidence.flatMap(formatEvidence);
    return findingBlock(`${finding.id}  ${status}  ${location}`, [
      finding.message,
      ...evidenceLines,
      `Suggested action: ${finding.suggestion}`,
    ]);
  });
  const rankingFooter = formatRankingFooter(report);
  return `${header}\n\n${blocks.join("\n\n")}${rankingFooter}\n`;
}

function formatRankingFooter(report: ScanReport): string {
  const ranking = report.ranking;
  if (!ranking) {
    return "";
  }
  const parts = [
    `Ranking: ${ranking.provider} (${ranking.model})`,
    ranking.applied ? "applied" : "not applied",
    `scored=${ranking.candidatesScored}`,
    `skipped=${ranking.candidatesSkipped}`,
    `input_tokens=${ranking.inputTokens}`,
    `estimated_cost_usd=${ranking.estimatedCostUsd.toFixed(6)}`,
  ];
  if (ranking.warning) {
    parts.push(`warning=${ranking.warning}`);
  }
  return `\n\n${parts.join(" · ")}`;
}
