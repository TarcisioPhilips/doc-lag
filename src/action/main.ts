#!/usr/bin/env node
/**
 * GitHub Action entrypoint. Invoked by action.yml after building from source.
 * Network use is limited to the GitHub API for sticky PR comments.
 */
import { ScanError } from "../errors.js";
import { runAction } from "./run.js";

async function main(): Promise<void> {
  try {
    const result = await runAction();
    process.exitCode = result.exitCode;
  } catch (error) {
    if (error instanceof ScanError) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = error.exitCode;
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 2;
  }
}

void main();
