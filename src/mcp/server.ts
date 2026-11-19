import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  handleExplainFinding,
  handleListRules,
  handleScanDiff,
  type McpHandlerContext,
  type ToolResult,
} from "./handlers.js";

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  // Default scan is offline; optional rank=jev calls TypeSafe AI.
  openWorldHint: true,
} as const;

const LOCAL_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const scanDiffInputSchema = {
  base: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Base git ref. Defaults to merge-base of HEAD with origin/main, main, origin/master, or master.",
    ),
  head: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Head git ref when include_working_tree is false. Defaults to "HEAD". Also used as the merge-base tip when base is omitted.',
    ),
  include_working_tree: z
    .boolean()
    .optional()
    .describe(
      'When true, use an ephemeral snapshot of the current working tree (tracked + untracked) as the scan head; report head is "WORKING_TREE". Useful before committing.',
    ),
  cwd: z
    .string()
    .optional()
    .describe(
      "Repository path relative to the MCP workspace root (default: \".\"). Must stay inside the workspace; path traversal is rejected.",
    ),
  rank: z
    .enum(["none", "jev"])
    .optional()
    .describe(
      'Optional semantic ranking. Default "none" is offline and deterministic. "jev" reorders needs-review/unknown findings via TypeSafe AI (requires TYPESAFE_API_KEY); sends diff summaries and doc excerpts to a third party; never changes finding status.',
    ),
  config: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional path to doc-lag.config.json (relative to cwd). When omitted, auto-discovers doc-lag.config.json or .doc-lag.json under the scan cwd.",
    ),
  docs_include: z
    .array(z.string().min(1))
    .optional()
    .describe(
      "Optional documentation include globs. When set, replaces built-in/config include patterns.",
    ),
  docs_exclude: z
    .array(z.string().min(1))
    .optional()
    .describe(
      "Optional documentation exclude globs. When set, replaces built-in/config exclude patterns.",
    ),
};

const explainFindingInputSchema = {
  finding_id: z
    .string()
    .min(1)
    .describe(
      "Stable finding id from scan_diff (e.g. scripts.missing:README.md:1:deploy:preview).",
    ),
  ...scanDiffInputSchema,
};

function packageVersion(): string {
  const packageJsonUrl = new URL("../../package.json", import.meta.url);
  const raw = readFileSync(packageJsonUrl, "utf8");
  return (JSON.parse(raw) as { version: string }).version;
}

function toCallToolResult<T>(result: ToolResult<T>): {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Record<string, unknown>;
  isError?: boolean;
} {
  // MCP structuredContent requires an indexable object; JSON round-trip
  // also strips non-JSON values (e.g. accidental Sets) for transport safety.
  const structuredContent = JSON.parse(JSON.stringify(result.data)) as Record<
    string,
    unknown
  >;
  return {
    content: [{ type: "text", text: result.text }],
    structuredContent,
    ...(result.ok ? {} : { isError: true }),
  };
}

export interface CreateDocLagMcpServerOptions {
  workspaceRoot: string;
  version?: string;
}

/**
 * Build a read-only MCP server that exposes doc-lag scan tools.
 * Callers connect a transport (stdio or in-memory) separately.
 */
export function createDocLagMcpServer(options: CreateDocLagMcpServerOptions): McpServer {
  const ctx: McpHandlerContext = { workspaceRoot: options.workspaceRoot };
  const server = new McpServer({
    name: "doc-lag",
    version: options.version ?? packageVersion(),
  });

  server.registerTool(
    "scan_diff",
    {
      title: "Scan documentation drift",
      description:
        "Scan a git range for documentation made stale by the change (scripts.missing, links.broken, env.stale). " +
        "Read-only: never executes commands from docs and never writes to the repo. " +
        "Default is offline and deterministic. Optional rank=jev reorders needs-review findings via TypeSafe AI " +
        "(requires TYPESAFE_API_KEY; privacy: diff + doc text leave the machine). " +
        "Defaults base to merge-base with main and head to HEAD; set include_working_tree to include uncommitted edits.",
      inputSchema: scanDiffInputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args) => toCallToolResult(await handleScanDiff(ctx, args)),
  );

  server.registerTool(
    "explain_finding",
    {
      title: "Explain a finding",
      description:
        "Re-scan the same range and return one finding by stable id with full evidence and suggested action. Read-only and offline.",
      inputSchema: explainFindingInputSchema,
      annotations: LOCAL_ONLY_ANNOTATIONS,
    },
    async (args) => toCallToolResult(handleExplainFinding(ctx, args)),
  );

  server.registerTool(
    "list_rules",
    {
      title: "List doc-lag rules",
      description:
        "List deterministic documentation-drift rules available in the scan pipeline.",
      inputSchema: {},
      annotations: LOCAL_ONLY_ANNOTATIONS,
    },
    async () => toCallToolResult(handleListRules()),
  );

  return server;
}
