import { readFileAt } from "../core/git.js";
import type { ChangeKind, EnvChange, EnvSnapshot } from "../types.js";

const ENV_KEY_PATTERN = /^([A-Z][A-Z0-9_]*)\s*=/;
const ENV_EXAMPLE_FILES = [
  ".env.example",
  ".env.sample",
  ".env.template",
  ".env.local.example",
  ".env.development.example",
  ".env.production.example",
];

export function isEnvExampleFile(filePath: string): boolean {
  const fileName = filePath.split("/").pop() ?? "";
  return ENV_EXAMPLE_FILES.some(
    (pattern) =>
      fileName === pattern || fileName.toLowerCase() === pattern.toLowerCase(),
  );
}

export function listEnvExampleFiles(files: string[]): string[] {
  return files.filter(isEnvExampleFile).sort();
}

/** Parse `KEY=value` assignments from an env-example file body (comments skipped). */
export function parseEnvKeys(content: string): Set<string> {
  const keys = new Set<string>();
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = ENV_KEY_PATTERN.exec(trimmed);
    if (match) {
      keys.add(match[1]!);
    }
  }

  return keys;
}

/** First 1-based line of each env key in content (stable first-seen order). */
export function parseEnvKeysWithLines(
  content: string,
): Array<{ key: string; line: number; literal: string }> {
  const seen = new Set<string>();
  const out: Array<{ key: string; line: number; literal: string }> = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i]!;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = ENV_KEY_PATTERN.exec(trimmed);
    if (!match) {
      continue;
    }
    const key = match[1]!;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({ key, line: i + 1, literal: trimmed });
  }

  return out;
}

export function extractEnvSnapshot(
  cwd: string,
  ref: string,
  envPath: string,
): EnvSnapshot | null {
  const content = readFileAt(cwd, ref, envPath);
  if (content === null) {
    return null;
  }

  return {
    path: envPath,
    keys: parseEnvKeys(content),
  };
}

export function diffEnvExamples(
  cwd: string,
  base: string,
  head: string,
  envPaths: string[],
): EnvChange[] {
  const changes: EnvChange[] = [];

  for (const envPath of envPaths) {
    const baseSnapshot = extractEnvSnapshot(cwd, base, envPath);
    const headSnapshot = extractEnvSnapshot(cwd, head, envPath);

    const baseKeys = baseSnapshot?.keys ?? new Set<string>();
    const headKeys = headSnapshot?.keys ?? new Set<string>();

    const removed: string[] = [];
    const added: string[] = [];

    for (const key of baseKeys) {
      if (!headKeys.has(key)) {
        removed.push(key);
      }
    }

    for (const key of headKeys) {
      if (!baseKeys.has(key)) {
        added.push(key);
      }
    }

    if (removed.length === 0 && added.length === 0) {
      continue;
    }

    let kind: ChangeKind;
    if (baseSnapshot === null) {
      kind = "added";
    } else if (headSnapshot === null) {
      kind = "deleted";
    } else {
      kind = "modified";
    }

    changes.push({
      path: envPath,
      kind,
      baseKeys,
      headKeys,
      removed: removed.sort(),
      added: added.sort(),
    });
  }

  return changes;
}
