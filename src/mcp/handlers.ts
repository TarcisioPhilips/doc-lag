import { resolveDefaultBase } from "../core/default-base.js";
import { constrainToRoot } from "../core/paths.js";
import { scan } from "../core/scan.js";
import { scanWithRanking } from "../core/scan-with-ranking.js";
import { KIND_LABELS } from "../docs-sync/detectors/types.js";
import type { SurfaceKind } from "../core/docs-sync-config.js";
import { ScanError } from "../errors.js";
import { parseRankProvider } from "../ranking/jev-rank.js";
import { formatText } from "../reporters/text.js";
import type { Finding, RankProvider, ScanReport } from "../types.js";
import {
  listDetectors,
  listRules,
  type DetectorInfo,
  type RuleInfo,
} from "./rules.js";

export interface McpHandlerContext {
  /** Workspace root used to constrain `cwd` arguments. */
  workspaceRoot: string;
  env?: NodeJS.ProcessEnv;
  warn?: (message: string) => void;
}

export interface ScanDiffInput {
  base?: string;
  head?: string;
  include_working_tree?: boolean;
  cwd?: string;
  /**
   * Optional semantic ranking. `jev` reorders needs-review/unknown findings
   * via TypeSafe AI (requires TYPESAFE_API_KEY). Default `none` is offline.
   */
  rank?: RankProvider | string;
  /** Optional path to doc-lag.config.json (relative to cwd / workspace). */
  config?: string;
  /** Optional docs include globs (replaces defaults/config when set). */
  docs_include?: string[];
  /** Optional docs exclude globs (replaces defaults/config when set). */
  docs_exclude?: string[];
  /**
   * Force-enable/disable docs-sync (overrides config / DOC_LAG_DOCS_SYNC).
   * When omitted, config/env decide.
   */
  docs_sync?: boolean;
  /**
   * Force docs-sync enforce for this run (implies enable when docs_sync omitted).
   */
  docs_sync_enforce?: boolean;
}

export interface ExplainFindingInput {
  finding_id: string;
  base?: string;
  head?: string;
  include_working_tree?: boolean;
  cwd?: string;
  config?: string;
  docs_include?: string[];
  docs_exclude?: string[];
  docs_sync?: boolean;
  docs_sync_enforce?: boolean;
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

function resolveDocsOverrides(input: {
  config?: string;
  docs_include?: string[];
  docs_exclude?: string[];
}): { configPath?: string; docs?: { include?: string[]; exclude?: string[] } } {
  const configPath = input.config?.trim() || undefined;
  const include =
    input.docs_include && input.docs_include.length > 0 ? input.docs_include : undefined;
  const exclude =
    input.docs_exclude && input.docs_exclude.length > 0 ? input.docs_exclude : undefined;
  return {
    configPath,
    docs: include !== undefined || exclude !== undefined ? { include, exclude } : undefined,
  };
}

function resolveDocsSyncFlags(input: {
  docs_sync?: boolean;
  docs_sync_enforce?: boolean;
}): { docsSyncEnabled?: boolean; docsSyncEnforce?: boolean } {
  let docsSyncEnabled = input.docs_sync;
  const docsSyncEnforce = input.docs_sync_enforce;
  if (docsSyncEnforce === true && docsSyncEnabled === undefined) {
    docsSyncEnabled = true;
  }
  return { docsSyncEnabled, docsSyncEnforce };
}

function resolveScanOptions(
  ctx: McpHandlerContext,
  input: {
    base?: string;
    head?: string;
    include_working_tree?: boolean;
    cwd?: string;
    config?: string;
    docs_include?: string[];
    docs_exclude?: string[];
    docs_sync?: boolean;
    docs_sync_enforce?: boolean;
  },
): {
  cwd: string;
  base: string;
  head: string;
  includeWorkingTree: boolean;
  configPath?: string;
  docs?: { include?: string[]; exclude?: string[] };
  docsSyncEnabled?: boolean;
  docsSyncEnforce?: boolean;
} {
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
  const docsOverrides = resolveDocsOverrides(input);
  const docsSyncFlags = resolveDocsSyncFlags(input);
  return {
    cwd,
    base,
    head,
    includeWorkingTree,
    ...docsOverrides,
    ...docsSyncFlags,
  };
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

/**
 * One actionable line per docs.missing finding for coding agents.
 */
export function formatDocsMissingActionItems(findings: Finding[]): string[] {
  const missing = findings.filter((f) => f.ruleId === "docs.missing");
  if (missing.length === 0) {
    return [];
  }
  const lines: string[] = ["", "Action items for the agent:"];
  for (const finding of missing) {
    const surface = finding.surface;
    const docPath = finding.documentation.path;
    const docLine = finding.documentation.line;
    if (surface?.trigger === "detector") {
      const label = kindLabel(surface.kind);
      const name = surface.name ?? finding.id;
      const source = surface.source
        ? `${surface.source.path}:${surface.source.line}`
        : finding.change.path;
      lines.push(
        `- You added ${label} \`${name}\` in ${source}. Update ${docPath} near line ${docLine} before finishing.`,
      );
    } else if (surface?.trigger === "rule") {
      const ruleName = surface.rule ?? "unknown";
      const matched =
        surface.matchedFiles?.[0] ?? finding.change.path;
      lines.push(
        `- You changed files under rule "${ruleName}" (${matched}). Update ${docPath}.`,
      );
    } else {
      lines.push(`- ${finding.suggestion}`);
    }
  }
  return lines;
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
  lines.push(...formatDocsMissingActionItems(report.findings));
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
 * Optional `rank: "jev"` may call the TypeSafe API (opt-in network).
 */
export async function handleScanDiff(
  ctx: McpHandlerContext,
  input: ScanDiffInput = {},
): Promise<ToolResult<ScanReport>> {
  try {
    const options = resolveScanOptions(ctx, input);
    const rank = parseRankProvider(input.rank);
    const report = await scanWithRanking({
      cwd: options.cwd,
      base: options.base,
      head: options.head,
      includeWorkingTree: options.includeWorkingTree,
      rank,
      env: ctx.env,
      warn: ctx.warn,
      configPath: options.configPath,
      docs: options.docs,
      docsSyncEnabled: options.docsSyncEnabled,
      docsSyncEnforce: options.docsSyncEnforce,
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
      configPath: options.configPath,
      docs: options.docs,
      docsSyncEnabled: options.docsSyncEnabled,
      docsSyncEnforce: options.docsSyncEnforce,
      env: ctx.env,
      warn: ctx.warn,
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
  detectors: DetectorInfo[];
}

/** List deterministic rules and docs-sync detectors available in the scan pipeline. */
export function handleListRules(): ToolResult<ListRulesData> {
  const rules = listRules();
  const detectors = listDetectors();
  const text = [
    `doc-lag rules (${rules.length}):`,
    ...rules.map((rule) => `- ${rule.id}: ${rule.description}`),
    "",
    `docs-sync detectors (${detectors.length}; opt-in via docsSync / docs_sync):`,
    ...detectors.map(
      (detector) =>
        `- ${detector.id}: ${detector.title} (default ${detector.defaultEnabled ? "on" : "off"}; ${detector.languages.join(", ")})`,
    ),
  ].join("\n");
  return { ok: true, text, data: { rules, detectors } };
}
