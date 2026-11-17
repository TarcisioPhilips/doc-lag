import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDocLagMcpServer } from "./server.js";

export interface RunMcpStdioOptions {
  workspaceRoot: string;
}

/**
 * Start the MCP server on stdio. Must not write non-protocol data to stdout.
 */
export async function runMcpStdio(options: RunMcpStdioOptions): Promise<void> {
  const server = createDocLagMcpServer({ workspaceRoot: options.workspaceRoot });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
