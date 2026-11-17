const ROOT_DOC = /^(README|AGENTS|CLAUDE|CONTRIBUTING)\.md$/i;

export function isDocumentationPath(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("://")) {
    return false;
  }
  const parts = normalized.split("/");
  if (parts.includes("node_modules") || parts.includes(".git") || parts.includes("..")) {
    return false;
  }
  if (parts.length === 1 && ROOT_DOC.test(parts[0])) {
    return true;
  }
  return parts[0] === "docs" && parts.length > 1 && parts.at(-1)!.toLowerCase().endsWith(".md");
}

export function listDocumentationFiles(files: string[]): string[] {
  return files.filter(isDocumentationPath).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
