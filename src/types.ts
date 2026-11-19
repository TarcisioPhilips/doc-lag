export const SCHEMA_VERSION = "1.0" as const;
export const TOOL_NAME = "doc-lag" as const;

export type FindingStatus = "confirmed" | "needs-review" | "unknown";
export type FindingSeverity = "warning" | "info";
export type ChangeKind = "added" | "modified" | "deleted" | "renamed";
export type OutputFormat = "text" | "json" | "sarif";
export type FailOn = "confirmed" | "none";

export interface DocumentationLocation {
  path: string;
  line: number;
}

export interface EvidenceItem {
  path: string;
  pointer: string;
  base?: unknown;
  head?: unknown;
}

export interface ChangeInfo {
  path: string;
  kind: ChangeKind;
}

export interface FindingRanking {
  provider: "jev";
  score: number;
  confidence: number;
}

export interface Finding {
  id: string;
  ruleId: string;
  status: FindingStatus;
  severity: FindingSeverity;
  message: string;
  documentation: DocumentationLocation;
  evidence: EvidenceItem[];
  change: ChangeInfo;
  suggestion: string;
  /**
   * Optional semantic-ranking signals. Present only when `--rank jev` (or
   * equivalent) successfully scored this finding. Never changes `status`.
   */
  ranking?: FindingRanking;
}

export interface ScanSummary {
  confirmed: number;
  needsReview: number;
  unknown: number;
}

/**
 * Opt-in ranking metadata. Absent when ranking is disabled so default reports
 * stay byte-compatible with schema 1.0 consumers that ignore unknown fields —
 * and identical when ranking is off.
 */
export interface RankingInfo {
  provider: "jev";
  model: string;
  /** True when at least one candidate was scored (or there were none to score). */
  applied: boolean;
  privacyNotice: string;
  candidatesScored: number;
  /** Rankable findings left in deterministic order because of the candidate cap. */
  candidatesSkipped: number;
  inputTokens: number;
  estimatedCostUsd: number;
  /** Set when ranking was requested but degraded to deterministic order. */
  warning?: string;
}

export interface ScanReport {
  schemaVersion: typeof SCHEMA_VERSION;
  tool: typeof TOOL_NAME;
  mode: "diff";
  base: string;
  head: string;
  findings: Finding[];
  summary: ScanSummary;
  /** Present only when semantic ranking was requested (`--rank jev`, etc.). */
  ranking?: RankingInfo;
}

export type RankProvider = "none" | "jev";

export interface DocsDiscoveryOptions {
  include: string[];
  exclude: string[];
}

export interface ScanOptions {
  cwd: string;
  base: string;
  head: string;
  /**
   * When true, compare against an ephemeral snapshot of the current working
   * tree (including uncommitted and untracked files) instead of `head`.
   * The report's `head` field is then `"WORKING_TREE"`.
   */
  includeWorkingTree?: boolean;
  /**
   * Optional docs discovery overrides (include/exclude globs). When omitted,
   * values are loaded from `doc-lag.config.json` / `.doc-lag.json` or built-in defaults.
   */
  docs?: Partial<DocsDiscoveryOptions>;
  /** Explicit config file path (relative to cwd or absolute). */
  configPath?: string;
}

export interface ScriptInvocation {
  path: string;
  line: number;
  manager: "npm" | "pnpm" | "yarn" | "bun";
  form: "run" | "short";
  script: string;
  raw: string;
}

export interface ScriptSnapshot {
  path: string;
  scripts: Record<string, string>;
}

export interface ScriptChange {
  path: string;
  kind: ChangeKind;
  baseScripts: Record<string, string>;
  headScripts: Record<string, string>;
  removed: string[];
  added: string[];
}

export type LinkKind = "markdown" | "image" | "inline-code";

export interface LocalLinkReference {
  docPath: string;
  line: number;
  targetPath: string;
  rawLink: string;
  kind: LinkKind;
  anchor?: string;
}

export interface PathChange {
  oldPath: string;
  newPath?: string;
  status: "deleted" | "renamed";
}

export interface EnvSnapshot {
  path: string;
  keys: Set<string>;
}

export interface EnvChange {
  path: string;
  kind: ChangeKind;
  baseKeys: Set<string>;
  headKeys: Set<string>;
  removed: string[];
  added: string[];
}

export type EnvReferenceKind = "assignment" | "inline-code" | "table-cell";

export interface EnvReference {
  docPath: string;
  line: number;
  key: string;
  raw: string;
  kind: EnvReferenceKind;
}
