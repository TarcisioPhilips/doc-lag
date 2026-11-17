export { scan } from "./core/scan.js";
export { ScanError } from "./errors.js";
export { formatJson } from "./reporters/json.js";
export { formatSarif } from "./reporters/sarif.js";
export { formatText } from "./reporters/text.js";
export { exitCodeFor } from "./reporters/exit-code.js";
export { formatCommentBody, STICKY_COMMENT_MARKER } from "./action/comment.js";
export { formatJobSummary } from "./action/summary.js";
export { parseActionInputs, formatGithubOutputs } from "./action/inputs.js";
export { runAction } from "./action/run.js";
export { createDocLagMcpServer } from "./mcp/server.js";
export { runMcpStdio } from "./mcp/stdio.js";
export {
  handleScanDiff,
  handleExplainFinding,
  handleListRules,
} from "./mcp/handlers.js";
export { listRules } from "./mcp/rules.js";
export { SCHEMA_VERSION, TOOL_NAME } from "./types.js";
export type {
  FailOn,
  Finding,
  OutputFormat,
  ScanOptions,
  ScanReport,
} from "./types.js";
export type { RuleInfo } from "./mcp/rules.js";
export type { McpHandlerContext } from "./mcp/handlers.js";
