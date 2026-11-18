import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function resolveReal(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/**
 * True when the module at `moduleUrl` is the script Node was started with.
 * Resolves symlinks so it also works when launched through npm/npx bin links
 * (node_modules/.bin/doc-lag -> ../doc-lag/dist/cli.js).
 */
export function isEntryPoint(argv1: string | undefined, moduleUrl: string): boolean {
  if (argv1 === undefined) return false;
  return resolveReal(argv1) === resolveReal(fileURLToPath(moduleUrl));
}
