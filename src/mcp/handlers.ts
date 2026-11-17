import { resolveDefaultBase } from "../core/default-base.js";
import { constrainToRoot } from "../core/paths.js";
import { scan } from "../core/scan.js";
import { ScanError } from "../errors.js";
import { formatText } from "../reporters/text.js";
import type { Finding, ScanReport } from "../types.js";
import { listRules, type RuleInfo } from "./rules.js";

export interface McpHandlerContext {
  /** Workspace root used to constrain `cwd` arguments. */
  workspaceRoot: string;
}

export interface ScanDiffInput {
  base?: string;
  head?: string;
  include_working_tree?: boolean;
  cwd?: string;
}

export interface ExplainFindingInput {
  finding_id: string;
  base?: string;
  head?: string;
  include_working_tree?: boolean;
  cwd?: string;
}

export interface ToolSuccess<T> {
  ok: true;
  text: string;
  data: T;
}

export interface ToolFailure {
  ok: false;
  text: string;
  data: { error: string };
}

export type ToolResult<T> = ToolSuccess<T> | ToolFailure;

function fail(message: string): ToolFailure {
  return { ok: false, text: message, data: { error: message } };
}

function resolveScanCwd(ctx: McpHandlerContext, cwd: string | undefined): string {
  return constrainToRoot(cwd ?? ".", ctx.workspaceRoot);
}

function resolveScanOptions(
  ctx: McpHandlerContext,
  input: {
    base?: string;
    head?: string;
    include_working_tree?: boolean;
    cwd?: string;
  },
): { cwd: string; base: string; head: string; includeWorkingTree: boolean } {
  const cwd = resolveScanCwd(ctx, input.cwd);
  const includeWorkingTree = Boolean(input.include_working_tree);
  const head = input.head?.trim() || "HEAD";
  if (input.head !== undefined && input.head.trim() === "") {
    throw new ScanError("Invalid head: must be a non-empty git ref");
  }
  if (input.base !== undefined && input.base.trim() === "") {
    throw new ScanError("Invalid base: must be a non-empty git ref");
  }
  const base = input.base?.trim() || resolveDefaultBase(cwd, head);
  return { cwd, base, head, includeWorkingTree };
}

function conciseScanText(report: ScanReport): string {
  const { summary } = report;
  const total = report.findings.length;
  const lines = [
    `doc-lag scan ${report.base}..${report.head}: ${total} finding(s) ` +
      `(${summary.confirmed} confirmed, ${summary.needsReview} needs-review, ${summary.unknown} unknown).`,
  ];
  for (const finding of report.findings.slice(0, 10)) {
    lines.push(
      `- [${finding.status}] ${finding.id} — ${finding.message}`,
    );
  }
  if (report.findings.length > 10) {
    lines.push(`… and ${report.findings.length - 10} more. Use explain_finding for details.`);
  }
  return lines.join("\n");
}

function formatFindingExplanation(finding: Finding, report: ScanReport): string {
  return [
    `Finding ${finding.id} (${finding.status.toUpperCase()}) in ${report.base}..${report.head}`,
    finding.message,
    `Documentation: ${finding.documentation.path}:${finding.documentation.line}`,
    `Change: ${finding.change.kind} ${finding.change.path}`,
    ...finding.evidence.map((item) => {
      const parts = [`Evidence: ${item.path}${item.pointer ? ` (${item.pointer})` : ""}`];
      if (item.base !== undefined) parts.push(`  base: ${JSON.stringify(item.base)}`);
      if (item.head !== undefined) parts.push(`  head: ${JSON.stringify(item.head)}`);
      return parts.join("\n");
    }),
    `Suggested action: ${finding.suggestion}`,
  ].join("\n");
}

/**
 * Run a PR-aware documentation drift scan.
 * Read-only: never executes commands from docs, never writes to the repo.
 */
export function handleScanDiff(
  ctx: McpHandlerContext,
  input: ScanDiffInput = {},
): ToolResult<ScanReport> {
  try {
    const options = resolveScanOptions(ctx, input);
    const report = scan({
      cwd: options.cwd,
      base: options.base,
      head: options.head,
      includeWorkingTree: options.includeWorkingTree,
    });
    return {
      ok: true,
      text: conciseScanText(report),
      data: report,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(message);
  }
}

export interface ExplainFindingData {
  finding: Finding;
  report: Pick<ScanReport, "schemaVersion" | "tool" | "mode" | "base" | "head" | "summary">;
  /** Full text report for the single finding (same style as CLI text output). */
  detail: string;
}

/**
 * Re-scan with the same range options and return one finding by stable ID,
 * with full evidence.
 */
export function handleExplainFinding(
  ctx: McpHandlerContext,
  input: ExplainFindingInput,
): ToolResult<ExplainFindingData> {
  try {
    const findingId = input.finding_id?.trim();
    if (!findingId) {
      throw new ScanError("finding_id is required");
    }
    const options = resolveScanOptions(ctx, input);
    const report = scan({
      cwd: options.cwd,
      base: options.base,
      head: options.head,
      includeWorkingTree: options.includeWorkingTree,
    });
    const finding = report.findings.find((item) => item.id === findingId);
    if (!finding) {
      throw new ScanError(
        `Finding not found: ${findingId}. Run scan_diff first and use an id from the report.`,
      );
    }
    const singleReport: ScanReport = {
      ...report,
      findings: [finding],
      summary: {
        confirmed: finding.status === "confirmed" ? 1 : 0,
        needsReview: finding.status === "needs-review" ? 1 : 0,
        unknown: finding.status === "unknown" ? 1 : 0,
      },
    };
    return {
      ok: true,
      text: formatFindingExplanation(finding, report),
      data: {
        finding,
        report: {
          schemaVersion: report.schemaVersion,
          tool: report.tool,
          mode: report.mode,
          base: report.base,
          head: report.head,
          summary: report.summary,
        },
        detail: formatText(singleReport),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(message);
  }
}

export interface ListRulesData {
  rules: RuleInfo[];
}

/** List deterministic rules available in the scan pipeline. */
export function handleListRules(): ToolResult<ListRulesData> {
  const rules = listRules();
  const text = [
    `doc-lag rules (${rules.length}):`,
    ...rules.map((rule) => `- ${rule.id}: ${rule.description}`),
  ].join("\n");
  return { ok: true, text, data: { rules } };
}
