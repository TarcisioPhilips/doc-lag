#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command, Option } from "commander";
import { scan } from "./core/scan.js";
import { ScanError } from "./errors.js";
import { exitCodeFor } from "./reporters/exit-code.js";
import { formatJson } from "./reporters/json.js";
import { formatText } from "./reporters/text.js";
import type { FailOn, OutputFormat } from "./types.js";

function packageVersion(): string {
  const packageJsonUrl = new URL("../package.json", import.meta.url);
  const raw = readFileSync(packageJsonUrl, "utf8");
  return (JSON.parse(raw) as { version: string }).version;
}

export interface CliScanOptions {
  base: string;
  head: string;
  format: OutputFormat;
  failOn: FailOn;
  cwd: string;
}

export function runScanCommand(options: CliScanOptions): { output: string; exitCode: number } {
  const report = scan({
    cwd: path.resolve(options.cwd),
    base: options.base,
    head: options.head,
  });
  const output = options.format === "json" ? formatJson(report) : formatText(report);
  return { output, exitCode: exitCodeFor(report, options.failOn) };
}

export function createProgram(): Command {
  const program = new Command();
  // Apply before subcommands are added so they inherit the callback.
  program.exitOverride();
  program
    .name("repodocpulse")
    .description(
      "Detect documentation that may be stale after a code change. Local, read-only, and deterministic. Never executes commands found in docs.",
    )
    .version(packageVersion());

  program
    .command("scan")
    .description("Scan a git range for documentation made stale by the change")
    .requiredOption("--base <ref>", "Base git ref to compare from")
    .option("--head <ref>", "Head git ref to compare to", "HEAD")
    .addOption(
      new Option("--format <format>", "Output format")
        .choices(["text", "json"])
        .default("text"),
    )
    .addOption(
      new Option("--fail-on <threshold>", "Exit 1 when findings match this threshold")
        .choices(["confirmed", "none"])
        .default("confirmed"),
    )
    .option("--cwd <path>", "Repository path (defaults to the current directory)")
    .addHelpText(
      "after",
      `
Exit codes:
  0  no blocking findings (or --fail-on none)
  1  at least one finding at the configured threshold
  2  usage, configuration, or execution error

Examples:
  repodocpulse scan --base main --head HEAD
  repodocpulse scan --base origin/main --head HEAD --format json --fail-on confirmed
`,
    )
    .action((opts: { base: string; head: string; format: OutputFormat; failOn: FailOn; cwd?: string }) => {
      const result = runScanCommand({
        base: opts.base,
        head: opts.head,
        format: opts.format,
        failOn: opts.failOn,
        cwd: opts.cwd ?? process.cwd(),
      });
      process.stdout.write(result.output);
      process.exitCode = result.exitCode;
    });

  return program;
}

export function runCli(argv: string[]): void {
  const program = createProgram();
  program.configureOutput({
    writeOut: (str) => process.stdout.write(str),
    writeErr: (str) => process.stderr.write(str),
  });
  try {
    program.parse(argv);
  } catch (error) {
    if (error instanceof ScanError) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = error.exitCode;
      return;
    }
    if (isCommanderError(error)) {
      if (error.code === "commander.helpDisplayed" || error.code === "commander.version") {
        process.exitCode = 0;
        return;
      }
      process.exitCode = 2;
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 2;
  }
}

function isCommanderError(error: unknown): error is { code: string; message: string } {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      typeof (error as { code: unknown }).code === "string",
  );
}

const isEntry =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntry) {
  runCli(process.argv);
}
