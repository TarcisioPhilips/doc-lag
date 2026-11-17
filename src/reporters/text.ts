import type { EvidenceItem, ScanReport } from "../types.js";

function formatEvidence(item: EvidenceItem): string[] {
  const lines = [`Evidence: ${item.path}${pointerToHash(item.pointer)}`];
  const scriptName = scriptNameFromPointer(item.pointer);
  if (scriptName) {
    lines.push(`  base: ${describePresence(scriptName, item.base)}`);
    lines.push(`  head: ${describePresence(scriptName, item.head)}`);
  }
  return lines;
}

function pointerToHash(pointer: string): string {
  if (pointer === "/scripts" || pointer.startsWith("/scripts/")) {
    return "#scripts";
  }
  return pointer;
}

function scriptNameFromPointer(pointer: string): string | null {
  if (!pointer.startsWith("/scripts/")) {
    return null;
  }
  return pointer
    .slice("/scripts/".length)
    .replaceAll("~1", "/")
    .replaceAll("~0", "~");
}

function describePresence(name: string, value: unknown): string {
  if (value === undefined || value === null) {
    return `"${name}" is absent`;
  }
  if (typeof value === "string") {
    return `"${name}" was present`;
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
    return `${header}\n`;
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
  return `${header}\n\n${blocks.join("\n\n")}\n`;
}
