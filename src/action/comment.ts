import type { EvidenceItem, Finding, ScanReport } from "../types.js";

/** Hidden HTML marker used to find and update the sticky PR comment. */
export const STICKY_COMMENT_MARKER = "<!-- doc-lag-sticky -->";

function formatEvidenceMarkdown(item: EvidenceItem): string[] {
  if (item.pointer === "deleted") {
    return [`- Evidence: \`${item.path}\` (deleted in this diff)`];
  }
  if (item.pointer.startsWith("renamed → ")) {
    const newPath = item.pointer.slice("renamed → ".length);
    return [`- Evidence: \`${item.path}\` renamed → \`${newPath}\``];
  }
  if (item.pointer.startsWith("/scripts/")) {
    const name = item.pointer
      .slice("/scripts/".length)
      .replaceAll("~1", "/")
      .replaceAll("~0", "~");
    const base = item.base === undefined || item.base === null ? "absent" : "present";
    const head = item.head === undefined || item.head === null ? "absent" : "present";
    return [
      `- Evidence: \`${item.path}#scripts\` (\`${name}\`: base ${base}, head ${head})`,
    ];
  }
  if (item.pointer.startsWith("/env/")) {
    const name = item.pointer.slice("/env/".length);
    return [`- Evidence: \`${item.path}\` key \`${name}\``];
  }
  return [`- Evidence: \`${item.path}${item.pointer}\``];
}

function formatFindingMarkdown(finding: Finding): string {
  const location = `${finding.documentation.path}:${finding.documentation.line}`;
  const status = finding.status.toUpperCase();
  const lines = [
    `#### \`${location}\` — \`${finding.ruleId}\` (${status})`,
    "",
    finding.message,
    "",
    ...finding.evidence.flatMap(formatEvidenceMarkdown),
    `- Suggested fix: ${finding.suggestion}`,
  ];
  return lines.join("\n");
}

function section(title: string, findings: Finding[]): string[] {
  if (findings.length === 0) {
    return [];
  }
  return [`### ${title}`, "", ...findings.flatMap((f, i) => [formatFindingMarkdown(f), ...(i < findings.length - 1 ? [""] : [])]), ""];
}

/**
 * Render the sticky PR comment body (includes the marker as the first line).
 */
export function formatCommentBody(report: ScanReport): string {
  const confirmed = report.findings.filter((f) => f.status === "confirmed");
  const needsReview = report.findings.filter((f) => f.status === "needs-review");
  const unknown = report.findings.filter((f) => f.status === "unknown");
  const range = `\`${report.base}..${report.head}\``;

  const lines: string[] = [
    STICKY_COMMENT_MARKER,
    "## doc-lag report",
    "",
    `Scanned ${range} — **${confirmed.length}** confirmed, **${needsReview.length}** needs-review` +
      (unknown.length > 0 ? `, **${unknown.length}** unknown` : "") +
      ".",
    "",
  ];

  if (report.findings.length === 0) {
    lines.push("No documentation drift findings for this range.", "");
  } else {
    lines.push(...section("Confirmed", confirmed));
    lines.push(...section("Needs review", needsReview));
    lines.push(...section("Unknown", unknown));
  }

  lines.push("---");
  lines.push("_Posted by [doc-lag](https://github.com/TarcisioPhilips/doc-lag). Scan is local and read-only; it never executes commands found in docs._");
  lines.push("");
  return lines.join("\n");
}

/** True when an existing issue/PR comment body is our sticky report. */
export function isStickyComment(body: string | null | undefined): boolean {
  return typeof body === "string" && body.includes(STICKY_COMMENT_MARKER);
}
