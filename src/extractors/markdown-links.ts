import path from "node:path";
import type { LinkKind, LocalLinkReference } from "../types.js";

const MARKDOWN_LINK = /!?\[(?:[^\]\\]|\\.)*\]\(([^)]+)\)/g;
const INLINE_CODE = /`([^`]+)`/g;
const EXTERNAL_URL = /^(?:https?:|mailto:|ftp:|tel:|#)/i;

const REPO_PATH_PATTERN = /^(?:\.{0,2}\/)?(?:(?:src|lib|test|tests|docs|scripts|bin|packages|apps|modules|config|public|static|assets|images|img)\/[^\s]+|[a-zA-Z0-9_-]+\/[^\s]*\.[a-zA-Z]{1,5})$/;

function isExternalUrl(target: string): boolean {
  return EXTERNAL_URL.test(target.trim());
}

function looksLikeRepoPath(candidate: string): boolean {
  const trimmed = candidate.trim();
  if (!trimmed || trimmed.length < 3 || trimmed.length > 200) {
    return false;
  }
  if (isExternalUrl(trimmed)) {
    return false;
  }
  if (trimmed.includes(" ") || trimmed.includes("\t") || trimmed.includes("\n")) {
    return false;
  }
  if (/^-/.test(trimmed) || /^[A-Z_]+$/.test(trimmed)) {
    return false;
  }
  return REPO_PATH_PATTERN.test(trimmed);
}

function parseAnchor(target: string): { path: string; anchor?: string } {
  const hashIndex = target.indexOf("#");
  if (hashIndex === -1) {
    return { path: target };
  }
  return {
    path: target.slice(0, hashIndex),
    anchor: target.slice(hashIndex + 1),
  };
}

function resolveToRepoPath(linkPath: string, docPath: string): string {
  if (linkPath.startsWith("/")) {
    return linkPath.slice(1);
  }
  const docDir = path.dirname(docPath);
  const resolved = path.posix.normalize(path.posix.join(docDir, linkPath));
  if (resolved.startsWith("../") || resolved.startsWith("/")) {
    return "";
  }
  return resolved;
}

function extractMarkdownLinks(
  line: string,
  lineNumber: number,
  docPath: string,
): LocalLinkReference[] {
  const results: LocalLinkReference[] = [];
  MARKDOWN_LINK.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = MARKDOWN_LINK.exec(line)) !== null) {
    const rawLink = match[0];
    const target = match[1].trim();

    if (isExternalUrl(target)) {
      continue;
    }

    const { path: linkPath, anchor } = parseAnchor(target);
    if (!linkPath) {
      continue;
    }

    const targetPath = resolveToRepoPath(linkPath, docPath);
    if (!targetPath) {
      continue;
    }

    const kind: LinkKind = rawLink.startsWith("!") ? "image" : "markdown";
    results.push({
      docPath,
      line: lineNumber,
      targetPath,
      rawLink,
      kind,
      anchor,
    });
  }

  return results;
}

function extractInlineCodePaths(
  line: string,
  lineNumber: number,
  docPath: string,
): LocalLinkReference[] {
  const results: LocalLinkReference[] = [];
  INLINE_CODE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = INLINE_CODE.exec(line)) !== null) {
    const rawLink = match[0];
    const candidate = match[1].trim();

    if (!looksLikeRepoPath(candidate)) {
      continue;
    }

    let targetPath: string;
    if (candidate.startsWith("./") || candidate.startsWith("../")) {
      targetPath = resolveToRepoPath(candidate, docPath);
      if (!targetPath) {
        continue;
      }
    } else {
      targetPath = candidate.startsWith("/") ? candidate.slice(1) : candidate;
    }

    results.push({
      docPath,
      line: lineNumber,
      targetPath,
      rawLink,
      kind: "inline-code",
    });
  }

  return results;
}

export function extractLocalLinks(
  markdown: string,
  docPath: string,
): LocalLinkReference[] {
  const references: LocalLinkReference[] = [];
  const lines = markdown.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;

    references.push(...extractMarkdownLinks(line, lineNumber, docPath));
    references.push(...extractInlineCodePaths(line, lineNumber, docPath));
  }

  return references;
}
