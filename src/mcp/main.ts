#!/usr/bin/env node
/**
 * Standalone stdio entry for the doc-lag MCP server.
 * Prefer `doc-lag mcp` from the main CLI; this bin exists for MCP configs
 * that want a direct executable.
 */
import path from "node:path";
import { isEntryPoint } from "../is-entry.js";
import { runMcpStdio } from "./stdio.js";

const isEntry = isEntryPoint(process.argv[1], import.meta.url);

if (isEntry) {
  const cwdFlag = process.argv.indexOf("--cwd");
  const cwd =
    cwdFlag >= 0 && process.argv[cwdFlag + 1]
      ? path.resolve(process.argv[cwdFlag + 1])
      : process.cwd();
  runMcpStdio({ workspaceRoot: cwd }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 2;
  });
}
