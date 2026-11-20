import {
  isEnvExampleFile,
  parseEnvKeysWithLines,
} from "../../extractors/env-example.js";
import type { SurfaceDecl } from "./types.js";

/**
 * Extract env keys from `.env.example`-family files for the opt-in `env.added`
 * detector. Newness vs base is decided by the shared detector evaluator
 * (same net effect as `diffEnvExamples().added`).
 */
export function detectEnvAdded(filePath: string, content: string): SurfaceDecl[] {
  if (!isEnvExampleFile(filePath)) {
    return [];
  }

  return parseEnvKeysWithLines(content).map(({ key, line, literal }) => ({
    kind: "env.added" as const,
    name: key,
    path: filePath,
    line,
    pointer: `#L${line}`,
    literal,
  }));
}
