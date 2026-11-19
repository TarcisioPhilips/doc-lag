import type { SurfaceKind } from "../../core/docs-sync-config.js";

/** One public surface declaration extracted from a source file. */
export interface SurfaceDecl {
  kind: SurfaceKind;
  name: string;
  path: string;
  /** 1-based line of the declaration at this side. */
  line: number;
  /** Evidence pointer (`#L12` or JSON pointer). */
  pointer: string;
  /** Short declaration literal for evidence `head`. */
  literal: string;
}

export type DetectorFn = (path: string, content: string) => SurfaceDecl[];

export interface DetectorRegistration {
  kind: SurfaceKind;
  detect: DetectorFn;
}

export const KIND_LABELS: Record<SurfaceKind, string> = {
  "action.input": "GitHub Action input",
  "action.output": "GitHub Action output",
  "package.bin": "package bin",
  "package.exports": "package export",
  "cli.flag": "CLI flag",
  "cli.command": "CLI command",
  "mcp.tool": "MCP tool",
  "env.added": "environment variable",
};

/** Mentions contexts used by the mention index. */
export type MentionContext =
  | "inlineCode"
  | "fencedCode"
  | "tableCell"
  | "heading"
  | "text";

export const DETECTOR_ALLOWED_CONTEXTS: Record<SurfaceKind, readonly MentionContext[]> = {
  "cli.flag": ["inlineCode", "fencedCode", "tableCell", "heading", "text"],
  "cli.command": ["inlineCode", "fencedCode", "tableCell", "heading"],
  "action.input": ["inlineCode", "fencedCode", "tableCell", "heading"],
  "action.output": ["inlineCode", "fencedCode", "tableCell", "heading"],
  "package.bin": ["inlineCode", "fencedCode", "tableCell", "heading"],
  "package.exports": ["inlineCode", "fencedCode"],
  "mcp.tool": ["inlineCode", "fencedCode", "tableCell", "heading"],
  "env.added": ["inlineCode", "fencedCode", "tableCell", "heading", "text"],
};
