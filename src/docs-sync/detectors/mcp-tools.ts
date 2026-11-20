import {
  isJsTsPath,
  isPythonPath,
  lineAtOffset,
  stripCommentsForPath,
} from "./comment-strip.js";
import type { SurfaceDecl } from "./types.js";

/** Import of `@modelcontextprotocol/sdk` (any subpath) or require thereof. */
const IMPORT_MCP_SDK =
  /(?:import\s+.*?from\s+['"]@modelcontextprotocol\/sdk(?:\/[^'"]*)?['"]|require\s*\(\s*['"]@modelcontextprotocol\/sdk(?:\/[^'"]*)?['"]\s*\))/s;

/** Import of top-level `mcp` or `fastmcp` (incl. `from mcp.server...`). */
const IMPORT_MCP_PY =
  /(?:^|\n)\s*(?:import\s+mcp\b|from\s+mcp(?:\.|\s)|import\s+fastmcp\b|from\s+fastmcp(?:\.|\s))/;

const STRING_LITERAL =
  /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/;

function unwrapStringLiteral(raw: string): string | null {
  if (raw.length < 2) {
    return null;
  }
  const quote = raw[0];
  if (quote !== "'" && quote !== '"' && quote !== "`") {
    return null;
  }
  if (raw[raw.length - 1] !== quote) {
    return null;
  }
  if (quote === "`" && raw.includes("${")) {
    return null;
  }
  return raw.slice(1, -1).replace(/\\(['"`\\])/g, "$1");
}

function isHiddenToolName(name: string): boolean {
  return name.startsWith("_");
}

function extractBalancedCallArgs(content: string, openParenIndex: number): string | null {
  if (content[openParenIndex] !== "(") {
    return null;
  }
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  for (let i = openParenIndex; i < content.length; i += 1) {
    const ch = content[i]!;
    if (inSingle) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === '"') inDouble = false;
      continue;
    }
    if (inTemplate) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === "`") inTemplate = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === "`") {
      inTemplate = true;
      continue;
    }
    if (ch === "(") {
      depth += 1;
      continue;
    }
    if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        return content.slice(openParenIndex + 1, i);
      }
    }
  }
  return null;
}

function firstStringLiteral(args: string): { raw: string; index: number } | null {
  const match = STRING_LITERAL.exec(args);
  if (!match || match.index === undefined) {
    return null;
  }
  // Reject if non-whitespace precedes the first string (e.g. name= comes later).
  const before = args.slice(0, match.index);
  if (before.trim().length > 0) {
    return null;
  }
  return { raw: match[0]!, index: match.index };
}

function detectTsJsMcpTools(filePath: string, stripped: string): SurfaceDecl[] {
  if (!IMPORT_MCP_SDK.test(stripped)) {
    return [];
  }
  const results: SurfaceDecl[] = [];
  const seen = new Set<string>();
  // `.registerTool(` or `.tool(` — first arg must be a string literal.
  const callRe = /\.(?:registerTool|tool)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = callRe.exec(stripped)) !== null) {
    const openIdx = stripped.indexOf("(", match.index);
    if (openIdx === -1) {
      continue;
    }
    const args = extractBalancedCallArgs(stripped, openIdx);
    if (args === null) {
      continue;
    }
    const first = firstStringLiteral(args);
    if (!first) {
      continue; // variable arg — limitation
    }
    const name = unwrapStringLiteral(first.raw);
    if (name === null || name.length === 0 || isHiddenToolName(name)) {
      continue;
    }
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    const absIndex = openIdx + 1 + first.index;
    const line = lineAtOffset(stripped, absIndex);
    results.push({
      kind: "mcp.tool",
      name,
      path: filePath,
      line,
      pointer: `#L${line}`,
      literal: first.raw,
    });
  }
  return results;
}

/**
 * Extract `name=` string kwarg from a Python `@x.tool(...)` call's args.
 */
function pythonToolNameKwarg(args: string): { name: string; raw: string; index: number } | null {
  const re = /\bname\s*=\s*(['"])((?:\\.|(?!\1).)*)\1/;
  const match = re.exec(args);
  if (!match || match.index === undefined) {
    return null;
  }
  const quote = match[1]!;
  const raw = `${quote}${match[2]}${quote}`;
  const name = unwrapStringLiteral(raw);
  if (name === null) {
    return null;
  }
  return { name, raw, index: match.index + match[0]!.indexOf(quote) };
}

/**
 * Find the next `def` / `async def` name after a decorator call closes.
 */
function pythonDefNameAfter(stripped: string, afterCloseParen: number): {
  name: string;
  index: number;
} | null {
  const slice = stripped.slice(afterCloseParen);
  const match = /(?:^|\n)\s*(?:async\s+)?def\s+([A-Za-z_][\w]*)\s*\(/.exec(slice);
  if (!match || match.index === undefined) {
    return null;
  }
  const name = match[1]!;
  const nameOffsetInMatch = match[0]!.lastIndexOf(name);
  return {
    name,
    index: afterCloseParen + match.index + nameOffsetInMatch,
  };
}

function detectPythonMcpTools(filePath: string, stripped: string): SurfaceDecl[] {
  if (!IMPORT_MCP_PY.test(stripped)) {
    return [];
  }
  const results: SurfaceDecl[] = [];
  const seen = new Set<string>();
  // `@<ident>.tool(` — FastMCP / mcp.server.fastmcp style.
  const decoRe = /@([A-Za-z_][\w]*)\.tool\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = decoRe.exec(stripped)) !== null) {
    const openIdx = stripped.indexOf("(", match.index);
    if (openIdx === -1) {
      continue;
    }
    const args = extractBalancedCallArgs(stripped, openIdx);
    if (args === null) {
      continue;
    }
    const closeParen = openIdx + args.length + 1;
    const kwarg = pythonToolNameKwarg(args);
    let name: string;
    let literal: string;
    let nameIndex: number;
    if (kwarg) {
      name = kwarg.name;
      literal = kwarg.raw;
      nameIndex = openIdx + 1 + kwarg.index;
    } else {
      const defName = pythonDefNameAfter(stripped, closeParen);
      if (!defName) {
        continue;
      }
      name = defName.name;
      literal = name;
      nameIndex = defName.index;
    }
    if (name.length === 0 || isHiddenToolName(name)) {
      continue;
    }
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    const line = lineAtOffset(stripped, nameIndex);
    results.push({
      kind: "mcp.tool",
      name,
      path: filePath,
      line,
      pointer: `#L${line}`,
      literal,
    });
  }
  return results;
}

/**
 * Extract MCP tool surfaces from a TS/JS or Python source file.
 * Library-gated: requires `@modelcontextprotocol/sdk` (JS) or `mcp`/`fastmcp` (Python).
 * Skips tools whose names start with `_`.
 */
export function detectMcpTools(filePath: string, content: string): SurfaceDecl[] {
  if (isJsTsPath(filePath)) {
    if (!content.includes("@modelcontextprotocol/sdk")) {
      return [];
    }
    return detectTsJsMcpTools(filePath, stripCommentsForPath(filePath, content));
  }
  if (isPythonPath(filePath)) {
    if (!content.includes("mcp") && !content.includes("fastmcp")) {
      return [];
    }
    return detectPythonMcpTools(filePath, stripCommentsForPath(filePath, content));
  }
  return [];
}
