import { KIND_LABELS } from "../docs-sync/detectors/types.js";
import type { SurfaceKind } from "../core/docs-sync-config.js";
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
    ...(finding.ranking
      ? [
          `- Jev relevance: score=${finding.ranking.score.toFixed(2)}, confidence=${finding.ranking.confidence.toFixed(2)} (ordering only; does not change status)`,
        ]
      : []),
    `- Suggested fix: ${finding.suggestion}`,
  ];
  return lines.join("\n");
}

function kindLabel(kind: string | undefined): string {
  if (!kind) {
    return "surface";
  }
  if (kind in KIND_LABELS) {
    return KIND_LABELS[kind as SurfaceKind];
  }
  return kind;
}

function formatDocsMissingMarkdown(finding: Finding): string {
  const location = `${finding.documentation.path}:${finding.documentation.line}`;
  const status = finding.status.toUpperCase();
  const surface = finding.surface;
  let title: string;
  if (surface?.trigger === "rule") {
    const ruleName = surface.rule ?? "unknown";
    title = `#### \`${location}\` — rule \`${ruleName}\` (${status})`;
  } else {
    const name = surface?.name ?? finding.id;
    const label = kindLabel(surface?.kind);
    title = `#### \`${location}\` — \`${name}\` (${label}, ${status})`;
  }

  const lines = [title, "", finding.message, ""];
  if (surface?.trigger === "detector" && surface.source) {
    lines.push(`- Declared at: \`${surface.source.path}:${surface.source.line}\``);
  }
  lines.push(`- Suggested fix: ${finding.suggestion}`);
  return lines.join("\n");
}

function section(title: string, findings: Finding[]): string[] {
  if (findings.length === 0) {
    return [];
  }
  return [
    `### ${title}`,
    "",
    ...findings.flatMap((f, i) => [
      formatFindingMarkdown(f),
      ...(i < findings.length - 1 ? [""] : []),
    ]),
    "",
  ];
}

function docsMissingSection(findings: Finding[], enforced: boolean): string[] {
  if (findings.length === 0) {
    return [];
  }
  const title = enforced
    ? "Missing documentation (enforced — fails this check)"
    : "Missing documentation";
  return [
    `### ${title}`,
    "",
    ...findings.flatMap((f, i) => [
      formatDocsMissingMarkdown(f),
      ...(i < findings.length - 1 ? [""] : []),
    ]),
    "",
  ];
}

function formatSkipReasonLine(skipReason: string): string {
  // skipReason is `label:<name>` or `trailer:<value>`
  if (skipReason.startsWith("label:")) {
    const name = skipReason.slice("label:".length);
    return `Docs sync check skipped (label \`${name}\`).`;
  }
  if (skipReason.startsWith("trailer:")) {
    const value = skipReason.slice("trailer:".length);
    return `Docs sync check skipped (trailer \`${value}\`).`;
  }
  return `Docs sync check skipped (${skipReason}).`;
}

/**
 * Render the sticky PR comment body (includes the marker as the first line).
 */
export function formatCommentBody(report: ScanReport): string {
  const docsMissing = report.findings.filter((f) => f.ruleId === "docs.missing");
  const confirmed = report.findings.filter((f) => f.status === "confirmed");
  const needsReview = report.findings.filter(
    (f) => f.status === "needs-review" && f.ruleId !== "docs.missing",
  );
  const unknown = report.findings.filter((f) => f.status === "unknown");
  const range = `\`${report.base}..${report.head}\``;

  let summaryLine =
    `Scanned ${range} — **${confirmed.length}** confirmed, **${needsReview.length}** needs-review`;
  if (unknown.length > 0) {
    summaryLine += `, **${unknown.length}** unknown`;
  }
  if (report.docsSync) {
    summaryLine += `, **${docsMissing.length}** missing docs`;
  }
  summaryLine += ".";

  const lines: string[] = [
    STICKY_COMMENT_MARKER,
    "## doc-lag report",
    "",
    summaryLine,
    "",
  ];

  if (report.docsSync?.status === "skipped" && report.docsSync.skipReason) {
    lines.push(formatSkipReasonLine(report.docsSync.skipReason), "");
  }

  const hasDriftSections =
    confirmed.length > 0 || needsReview.length > 0 || unknown.length > 0;
  const hasDocsMissing = docsMissing.length > 0;

  if (!hasDriftSections && !hasDocsMissing && report.docsSync?.status !== "skipped") {
    lines.push("No documentation drift findings for this range.", "");
  } else {
    lines.push(...section("Confirmed", confirmed));
    // Missing documentation sits between Confirmed and Needs review.
    lines.push(
      ...docsMissingSection(docsMissing, report.docsSync?.enforced === true),
    );
    lines.push(...section("Needs review", needsReview));
    lines.push(...section("Unknown", unknown));
  }

  if (report.docsSync && (hasDocsMissing || report.docsSync.status === "skipped")) {
    const skipLabel = "no-docs-needed";
    lines.push(
      `> No docs needed? Add the \`${skipLabel}\` label (re-runs on \`labeled\`) or a \`Docs-Not-Needed: <reason>\` commit trailer.`,
      "",
    );
  }

  if (report.ranking) {
    const r = report.ranking;
    lines.push("### Semantic ranking (Jev)", "");
    lines.push(
      r.applied
        ? `Reordered ${r.candidatesScored} needs-review/unknown candidate(s) with \`${r.model}\` ` +
            `(input_tokens=${r.inputTokens}, estimated_cost_usd=${r.estimatedCostUsd.toFixed(6)}). ` +
            `Statuses are unchanged — ranking is review order only.`
        : `Jev ranking was requested but not applied` +
            (r.warning ? ` (${r.warning})` : "") +
            `. Findings stay in deterministic order.`,
    );
    lines.push("");
    lines.push(`_${r.privacyNotice}_`);
    lines.push("");
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
