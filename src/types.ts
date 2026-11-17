export const SCHEMA_VERSION = "1.0" as const;
export const TOOL_NAME = "doc-lag" as const;

export type FindingStatus = "confirmed" | "needs-review" | "unknown";
export type FindingSeverity = "warning" | "info";
export type ChangeKind = "added" | "modified" | "deleted" | "renamed";
export type OutputFormat = "text" | "json";
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
}

export interface ScanSummary {
  confirmed: number;
  needsReview: number;
  unknown: number;
}

export interface ScanReport {
  schemaVersion: typeof SCHEMA_VERSION;
  tool: typeof TOOL_NAME;
  mode: "diff";
  base: string;
  head: string;
  findings: Finding[];
  summary: ScanSummary;
}

export interface ScanOptions {
  cwd: string;
  base: string;
  head: string;
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
