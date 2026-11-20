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
const IMPORT_CLICK = /(?:import\s+click\b|from\s+click\s+import|import\s+.*\bclick\b)/;

/** Match a string literal; backticks with `${` are rejected in unwrap. */
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
  // Unescape simple sequences enough for flag text.
  return raw.slice(1, -1).replace(/\\(['"`\\])/g, "$1");
}

/**
 * Extract the canonical long flag name from an option string.
 * Returns null for short-only flags.
 */
export function parseLongFlagName(
  optionString: string,
  options: { clickSlashPair?: boolean } = {},
): { name: string; mentionNames: string[]; literal: string } | null {
  let text = optionString.trim();
  if (!text) {
    return null;
  }

  // Click `--shout/--no-shout` form.
  const slashPair = text.match(/^(--[a-zA-Z0-9][\w-]*)\/(--no-[a-zA-Z0-9][\w-]*)$/);
  if (slashPair || options.clickSlashPair) {
    const pair = slashPair ?? text.match(/^(--[a-zA-Z0-9][\w-]*)\/(--[a-zA-Z0-9][\w-]*)$/);
    if (pair) {
      const left = pair[1]!;
      const right = pair[2]!;
      const positive = left.startsWith("--no-") ? right : left;
      const negative = left.startsWith("--no-") ? left : right;
      return {
        name: positive,
        mentionNames: [positive, negative],
        literal: text,
      };
    }
  }

  // Strip value placeholders: <path>, [n], etc.
  text = text.replace(/\s+[<\[][^>\]]+[>\]]/g, "").trim();

  // Prefer the long flag when both short and long are present: `-v, --verbose`
  const longMatch = text.match(/--[a-zA-Z0-9][\w-]*/);
  if (!longMatch) {
    return null; // short-only
  }
  const name = longMatch[0]!;
  const mentionNames = [name];
  if (name.startsWith("--no-") && name.length > 5) {
    mentionNames.push(`--${name.slice(5)}`);
  }
  return { name, mentionNames, literal: optionString.trim() };
}

/**
 * Capture only the same statement's chained methods after a call's closing `)`,
 * e.g. `.option("--x").hideHelp();` — stops at `;` or a non-chained newline.
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

function isCommanderFlagHidden(afterCall: string): boolean {
  // Look through the chained call / options object for hide markers.
  if (/\.hideHelp\s*\(/.test(afterCall)) {
    return true;
  }
  if (/\bhidden\s*:\s*true\b/.test(afterCall)) {
    return true;
  }
  return false;
}

function isArgparseSuppressed(callArgs: string): boolean {
  return /help\s*=\s*argparse\.SUPPRESS/.test(callArgs);
}

function isClickHidden(callArgs: string): boolean {
  return /\bhidden\s*=\s*True\b/.test(callArgs);
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
      if (ch === "\\" ) {
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

function allStringLiterals(args: string): string[] {
  const out: string[] = [];
  const re = new RegExp(STRING_LITERAL.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(args)) !== null) {
    out.push(match[0]!);
  }
  return out;
}

function detectCommanderFlags(filePath: string, stripped: string): SurfaceDecl[] {
  if (!IMPORT_COMMANDER.test(stripped)) {
    return [];
  }
  const results: SurfaceDecl[] = [];
  const seen = new Set<string>();
  const callRe = /\.(?:option|requiredOption)\s*\(|\bnew\s+Option\s*\(/g;
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
    const value = unwrapStringLiteral(first.raw);
    if (value === null) {
      continue;
    }
    const parsed = parseLongFlagName(value);
    if (!parsed) {
      continue;
    }
    const after = chainAfterCall(stripped, openIdx + args.length + 1);
    // Also inspect the args object itself for hidden: true
    if (isCommanderFlagHidden(args) || isCommanderFlagHidden(after)) {
      continue;
    }
    if (seen.has(parsed.name)) {
      continue;
    }
    seen.add(parsed.name);
    const absIndex = openIdx + 1 + first.index;
    results.push({
      kind: "cli.flag",
      name: parsed.name,
      path: filePath,
      line: lineAtOffset(stripped, absIndex),
      pointer: `#L${lineAtOffset(stripped, absIndex)}`,
      literal: first.raw,
      mentionNames: parsed.mentionNames,
    });
  }
  return results;
}

function detectArgparseFlags(filePath: string, stripped: string): SurfaceDecl[] {
  if (!IMPORT_ARGPARSE.test(stripped)) {
    return [];
  }
  const results: SurfaceDecl[] = [];
  const seen = new Set<string>();
  const callRe = /\.add_argument\s*\(/g;
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
    if (isArgparseSuppressed(args)) {
      continue;
    }
    for (const raw of allStringLiterals(args)) {
      const value = unwrapStringLiteral(raw);
      if (value === null || !value.startsWith("--")) {
        continue;
      }
      const parsed = parseLongFlagName(value);
      if (!parsed || seen.has(parsed.name)) {
        continue;
      }
      seen.add(parsed.name);
      const absIndex = openIdx + 1 + args.indexOf(raw);
      results.push({
        kind: "cli.flag",
        name: parsed.name,
        path: filePath,
        line: lineAtOffset(stripped, absIndex),
        pointer: `#L${lineAtOffset(stripped, absIndex)}`,
        literal: raw,
        mentionNames: parsed.mentionNames,
      });
    }
  }
  return results;
}

function detectClickFlags(filePath: string, stripped: string): SurfaceDecl[] {
  if (!IMPORT_CLICK.test(stripped)) {
    return [];
  }
  const results: SurfaceDecl[] = [];
  const seen = new Set<string>();
  // @click.option( or @something.option(
  const callRe = /@\w+\.option\s*\(/g;
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
    if (isClickHidden(args)) {
      continue;
    }
    for (const raw of allStringLiterals(args)) {
      const value = unwrapStringLiteral(raw);
      if (value === null) {
        continue;
      }
      if (!value.includes("--")) {
        continue;
      }
      const parsed = parseLongFlagName(value, {
        clickSlashPair: value.includes("/"),
      });
      if (!parsed || seen.has(parsed.name)) {
        continue;
      }
      seen.add(parsed.name);
      const absIndex = openIdx + 1 + args.indexOf(raw);
      results.push({
        kind: "cli.flag",
        name: parsed.name,
        path: filePath,
        line: lineAtOffset(stripped, absIndex),
        pointer: `#L${lineAtOffset(stripped, absIndex)}`,
        literal: raw,
        mentionNames: parsed.mentionNames,
      });
      break; // first string arg is the flag definition
    }
  }
  return results;
}

/**
 * Detect CLI flags (commander / argparse / click) in a source file.
 */
export function detectCliFlags(filePath: string, content: string): SurfaceDecl[] {
  if (!isJsTsPath(filePath) && !isPythonPath(filePath)) {
    return [];
  }
  const stripped = stripCommentsForPath(filePath, content);
  if (isPythonPath(filePath)) {
    return [
      ...detectArgparseFlags(filePath, stripped),
      ...detectClickFlags(filePath, stripped),
    ];
  }
  return detectCommanderFlags(filePath, stripped);
}
