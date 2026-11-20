/**
 * Blank comments in source so regex detectors ignore them while preserving
 * offsets and newlines (line numbers stay aligned with the original file).
 */

function blankRange(chars: string[], start: number, end: number): void {
  for (let i = start; i < end && i < chars.length; i += 1) {
    if (chars[i] !== "\n" && chars[i] !== "\r") {
      chars[i] = " ";
    }
  }
}

/** Strip JS/TS line (//) and block comments. */
export function stripJsStyleComments(content: string): string {
  const BACKTICK = "`";
  const chars = [...content];
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (i < chars.length) {
    const ch = chars[i]!;
    const next = chars[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
      } else {
        chars[i] = " ";
      }
      i += 1;
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        chars[i] = " ";
        chars[i + 1] = " ";
        inBlockComment = false;
        i += 2;
        continue;
      }
      if (ch !== "\n" && ch !== "\r") {
        chars[i] = " ";
      }
      i += 1;
      continue;
    }

    if (inSingle) {
      if (ch === "\\" && i + 1 < chars.length) {
        i += 2;
        continue;
      }
      if (ch === "'") {
        inSingle = false;
      }
      i += 1;
      continue;
    }

    if (inDouble) {
      if (ch === "\\" && i + 1 < chars.length) {
        i += 2;
        continue;
      }
      if (ch === '"') {
        inDouble = false;
      }
      i += 1;
      continue;
    }

    if (inTemplate) {
      if (ch === "\\" && i + 1 < chars.length) {
        i += 2;
        continue;
      }
      if (ch === BACKTICK) {
        inTemplate = false;
        i += 1;
        continue;
      }
      // Nested template expressions — keep scanning; comments inside are rare.
      i += 1;
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      i += 1;
      continue;
    }
    if (ch === BACKTICK) {
      inTemplate = true;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "/") {
      chars[i] = " ";
      chars[i + 1] = " ";
      inLineComment = true;
      i += 2;
      continue;
    }
    if (ch === "/" && next === "*") {
      chars[i] = " ";
      chars[i + 1] = " ";
      inBlockComment = true;
      i += 2;
      continue;
    }
    i += 1;
  }

  return chars.join("");
}

/** Strip Python `#` comments (not inside strings). */
export function stripPythonComments(content: string): string {
  const chars = [...content];
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inTripleSingle = false;
  let inTripleDouble = false;

  while (i < chars.length) {
    const ch = chars[i]!;
    const next = chars[i + 1];
    const next2 = chars[i + 2];

    if (inTripleSingle) {
      if (ch === "'" && next === "'" && next2 === "'") {
        inTripleSingle = false;
        i += 3;
        continue;
      }
      i += 1;
      continue;
    }
    if (inTripleDouble) {
      if (ch === '"' && next === '"' && next2 === '"') {
        inTripleDouble = false;
        i += 3;
        continue;
      }
      i += 1;
      continue;
    }
    if (inSingle) {
      if (ch === "\\" && i + 1 < chars.length) {
        i += 2;
        continue;
      }
      if (ch === "'") {
        inSingle = false;
      }
      i += 1;
      continue;
    }
    if (inDouble) {
      if (ch === "\\" && i + 1 < chars.length) {
        i += 2;
        continue;
      }
      if (ch === '"') {
        inDouble = false;
      }
      i += 1;
      continue;
    }

    if (ch === "'" && next === "'" && next2 === "'") {
      inTripleSingle = true;
      i += 3;
      continue;
    }
    if (ch === '"' && next === '"' && next2 === '"') {
      inTripleDouble = true;
      i += 3;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      i += 1;
      continue;
    }
    if (ch === "#") {
      const start = i;
      while (i < chars.length && chars[i] !== "\n") {
        i += 1;
      }
      blankRange(chars, start, i);
      continue;
    }
    i += 1;
  }

  return chars.join("");
}

export function isPythonPath(filePath: string): boolean {
  return filePath.endsWith(".py");
}

export function isJsTsPath(filePath: string): boolean {
  return /\.(?:[cm]?js|tsx?)$/.test(filePath);
}

export function stripCommentsForPath(filePath: string, content: string): string {
  if (isPythonPath(filePath)) {
    return stripPythonComments(content);
  }
  if (isJsTsPath(filePath)) {
    return stripJsStyleComments(content);
  }
  return content;
}

export function lineAtOffset(content: string, offset: number): number {
  let line = 1;
  const end = Math.min(offset, content.length);
  for (let i = 0; i < end; i += 1) {
    if (content[i] === "\n") {
      line += 1;
    }
  }
  return line;
}
