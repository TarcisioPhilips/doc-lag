import {
  isJsTsPath,
  isPythonPath,
  lineAtOffset,
  stripCommentsForPath,
} from "./comment-strip.js";
import type { SurfaceDecl } from "./types.js";

const IMPORT_COMMANDER =
  /(?:import\s+.*?from\s+['"]commander['"]|require\s*\(\s*['"]commander['"]\s*\))/s;
const IMPORT_ARGPARSE =
  /(?:import\s+argparse\b|from\s+argparse\s+import|import\s+.*\bargparse\b)/;

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
  return { raw: match[0]!, index: match.index };
}

/**
 * Capture only the same statement's chained methods after a call's closing `)`.
 */
function chainAfterCall(content: string, afterCloseParen: number): string {
  let i = afterCloseParen;
  const end = Math.min(content.length, afterCloseParen + 500);
  let out = "";
  while (i < end) {
    const ch = content[i]!;
    if (ch === ";") {
      break;
    }
    if (ch === "\n" || ch === "\r") {
      let j = i + 1;
      if (ch === "\r" && content[j] === "\n") {
        j += 1;
      }
      while (j < end && (content[j] === " " || content[j] === "\t")) {
        j += 1;
      }
      if (content[j] === ".") {
        out += content.slice(i, j);
        i = j;
        continue;
      }
      break;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function isCommanderCommandHidden(name: string, afterCall: string, args: string): boolean {
  if (name.startsWith("_")) {
    return true;
  }
  if (/\.hideHelp\s*\(/.test(afterCall) || /\.hideHelp\s*\(/.test(args)) {
    return true;
  }
  if (/\bhidden\s*:\s*true\b/.test(afterCall) || /\bhidden\s*:\s*true\b/.test(args)) {
    return true;
  }
  return false;
}

function commandNameFromLiteral(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  // First token: "deploy [env]" → deploy
  const token = trimmed.split(/\s+/)[0];
  if (!token || token.startsWith("<") || token.startsWith("[")) {
    return null;
  }
  return token;
}

function detectCommanderCommands(filePath: string, stripped: string): SurfaceDecl[] {
  if (!IMPORT_COMMANDER.test(stripped)) {
    return [];
  }
  const results: SurfaceDecl[] = [];
  const seen = new Set<string>();
  const callRe = /\.command\s*\(/g;
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
      continue;
    }
    const value = unwrapStringLiteral(first.raw);
    if (value === null) {
      continue;
    }
    const name = commandNameFromLiteral(value);
    if (!name) {
      continue;
    }
    const after = chainAfterCall(stripped, openIdx + args.length + 1);
    if (isCommanderCommandHidden(name, after, args)) {
      continue;
    }
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    const absIndex = openIdx + 1 + first.index;
    const line = lineAtOffset(stripped, absIndex);
    results.push({
      kind: "cli.command",
      name,
      path: filePath,
      line,
      pointer: `#L${line}`,
      literal: first.raw,
    });
  }
  return results;
}

function detectArgparseCommands(filePath: string, stripped: string): SurfaceDecl[] {
  if (!IMPORT_ARGPARSE.test(stripped)) {
    return [];
  }
  const results: SurfaceDecl[] = [];
  const seen = new Set<string>();
  // add_parser("name" or .add_parser("name"
  const callRe = /\.add_parser\s*\(/g;
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
      continue;
    }
    const value = unwrapStringLiteral(first.raw);
    if (value === null || !value.trim()) {
      continue;
    }
    const name = value.trim();
    if (name.startsWith("_") || seen.has(name)) {
      continue;
    }
    seen.add(name);
    const absIndex = openIdx + 1 + first.index;
    const line = lineAtOffset(stripped, absIndex);
    results.push({
      kind: "cli.command",
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
 * Detect CLI commands (commander / argparse subparsers) in a source file.
 */
export function detectCliCommands(filePath: string, content: string): SurfaceDecl[] {
  if (!isJsTsPath(filePath) && !isPythonPath(filePath)) {
    return [];
  }
  if (isJsTsPath(filePath) && !content.includes("commander")) {
    return [];
  }
  if (isPythonPath(filePath) && !content.includes("argparse")) {
    return [];
  }
  const stripped = stripCommentsForPath(filePath, content);
  if (isPythonPath(filePath)) {
    return detectArgparseCommands(filePath, stripped);
  }
  return detectCommanderCommands(filePath, stripped);
}
