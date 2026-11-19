/**
 * Prepare documentation file text for Markdown-oriented extractors.
 * Strips YAML frontmatter for .md and .mdx; for .mdx also strips import/export
 * and neutralizes JSX / MDX expressions so they are not mistaken for claims.
 *
 * Line count is preserved (stripped lines become blank) so finding line numbers
 * still refer to the original file.
 */

const FRONTMATTER_OPEN = /^---\r?\n/;

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

function joinLines(lines: string[]): string {
  return lines.join("\n");
}

/**
 * Remove opening YAML frontmatter when the file starts with `---` and a
 * closing `---` exists on its own line. Later `---` horizontal rules are kept.
 * Frontmatter lines are blanked (not deleted) to preserve line numbers.
 */
export function stripYamlFrontmatter(text: string): string {
  const withoutBom = stripBom(text);
  if (!FRONTMATTER_OPEN.test(withoutBom)) {
    return withoutBom;
  }
  const lines = splitLines(withoutBom);
  if (lines[0] !== "---") {
    return withoutBom;
  }
  let closeIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === "---") {
      closeIndex = i;
      break;
    }
  }
  if (closeIndex === -1) {
    return withoutBom;
  }
  for (let i = 0; i <= closeIndex; i += 1) {
    lines[i] = "";
  }
  return joinLines(lines);
}

function isImportOrExportStart(line: string): boolean {
  const trimmed = line.trim();
  return /^(import|export)\b/.test(trimmed);
}

function countBraces(line: string): number {
  let depth = 0;
  for (const ch of line) {
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
  }
  return depth;
}

/**
 * Drop import/export statements (including multi-line `{ ... }` forms).
 * Heuristic only — does not execute MDX. Lines are blanked to keep line numbers.
 */
export function stripMdxImportExport(text: string): string {
  const lines = splitLines(text);
  let skipping = false;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!skipping && isImportOrExportStart(line)) {
      skipping = true;
      braceDepth = countBraces(line);
      lines[i] = "";
      if (braceDepth <= 0) {
        skipping = false;
      }
      continue;
    }

    if (skipping) {
      braceDepth += countBraces(line);
      lines[i] = "";
      if (braceDepth <= 0) {
        skipping = false;
      }
    }
  }

  return joinLines(lines);
}

/**
 * Replace JSX/HTML-like tags with empty string (children preserved) and
 * neutralize `{...}` MDX expressions so attribute strings and JS snippets
 * are not fed to Markdown extractors.
 */
export function neutralizeMdxJsx(text: string): string {
  let result = text.replace(/<\/?[A-Za-z][A-Za-z0-9._:-]*(?:\s[^<>{}]*)?\/?>/g, "");
  result = stripBalancedExpressions(result);
  return result;
}

function stripBalancedExpressions(text: string): string {
  let out = "";
  let index = 0;
  while (index < text.length) {
    const start = text.indexOf("{", index);
    if (start === -1) {
      out += text.slice(index);
      break;
    }
    out += text.slice(index, start);
    let depth = 0;
    let end = -1;
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) {
      out += text.slice(start);
      break;
    }
    out += " ";
    index = end + 1;
  }
  return out;
}

export function stripMdxNoise(text: string): string {
  return neutralizeMdxJsx(stripMdxImportExport(text));
}

export function isMdxPath(docPath: string): boolean {
  return docPath.replaceAll("\\", "/").toLowerCase().endsWith(".mdx");
}

/**
 * Prepare raw file contents for extractScriptInvocations / extractLocalLinks /
 * extractEnvReferences. Always strips YAML frontmatter; MDX also strips
 * import/export and JSX noise. Line numbers are preserved.
 */
export function prepareDocumentationContent(raw: string, docPath: string): string {
  let text = stripYamlFrontmatter(raw);
  if (isMdxPath(docPath)) {
    text = stripMdxNoise(text);
  }
  return text;
}
