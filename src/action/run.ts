import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { scan } from "../core/scan.js";
import { ScanError } from "../errors.js";
import { exitCodeFor } from "../reporters/exit-code.js";
import { formatJson } from "../reporters/json.js";
import { formatSarif } from "../reporters/sarif.js";
import type { ScanReport } from "../types.js";
import { formatCommentBody } from "./comment.js";
import {
  formatGithubOutputs,
  parseActionInputs,
  parseGithubEvent,
  resolveScanRange,
  type ActionInputs,
  type ActionOutputs,
  type GithubEventContext,
} from "./inputs.js";
import { FetchGithubApiClient, upsertStickyComment, type GithubApiClient } from "./github.js";
import { formatJobSummary } from "./summary.js";

export interface ActionRuntimeEnv {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  githubClient?: GithubApiClient;
  readEventPayload?: (eventPath: string) => unknown;
  appendStepSummary?: (markdown: string) => void;
  writeOutputFile?: (filePath: string, contents: string) => void;
  log?: (message: string) => void;
  warn?: (message: string) => void;
}

export interface ActionRunResult {
  report: ScanReport;
  outputs: ActionOutputs;
  exitCode: number;
  comment: { attempted: boolean; posted: boolean; skippedReason?: string };
}

function defaultReadEventPayload(eventPath: string): unknown {
  return JSON.parse(readFileSync(eventPath, "utf8")) as unknown;
}

function appendToGithubFile(filePath: string | undefined, contents: string): void {
  if (!filePath) {
    return;
  }
  writeFileSync(filePath, contents, { encoding: "utf8", flag: "a" });
}

/**
 * Core GitHub Action runner: scan PR range, write report/summary, optional sticky comment + SARIF.
 * Comment permission failures are non-fatal (fork PRs).
 */
export async function runAction(runtime: ActionRuntimeEnv = {}): Promise<ActionRunResult> {
  const env = runtime.env ?? process.env;
  const log = runtime.log ?? ((message: string) => process.stdout.write(`${message}\n`));
  const warn = runtime.warn ?? ((message: string) => process.stderr.write(`${message}\n`));
  const inputs = parseActionInputs(env);
  const workspace = runtime.cwd ?? env.GITHUB_WORKSPACE ?? process.cwd();
  const workingDirectory = path.resolve(workspace, inputs.workingDirectory);

  const eventName = env.GITHUB_EVENT_NAME ?? "";
  const eventPath = env.GITHUB_EVENT_PATH;
  const payload =
    eventPath !== undefined
      ? (runtime.readEventPayload ?? defaultReadEventPayload)(eventPath)
      : {};
  const github = parseGithubEvent(eventName, env.GITHUB_REPOSITORY, payload);
  const range = resolveScanRange(inputs, github);

  let report: ScanReport;
  try {
    report = scan({
      cwd: workingDirectory,
      base: range.base,
      head: range.head,
    });
  } catch (error) {
    if (error instanceof ScanError) {
      throw error;
    }
    throw error;
  }

  const tempRoot = env.RUNNER_TEMP ?? env.TMPDIR ?? "/tmp";
  mkdirSync(tempRoot, { recursive: true });
  const reportPath = path.join(tempRoot, "doc-lag-report.json");
  const writeFile =
    runtime.writeOutputFile ?? ((filePath: string, contents: string) => writeFileSync(filePath, contents, "utf8"));
  writeFile(reportPath, formatJson(report));

  let sarifPath = "";
  if (inputs.sarif) {
    sarifPath = path.join(tempRoot, "doc-lag.sarif");
    writeFile(sarifPath, formatSarif(report));
    log(`Wrote SARIF report to ${sarifPath}`);
  }

  const summaryMarkdown = formatJobSummary(report);
  if (runtime.appendStepSummary) {
    runtime.appendStepSummary(summaryMarkdown);
  } else {
    appendToGithubFile(env.GITHUB_STEP_SUMMARY, summaryMarkdown);
  }
  log(
    `doc-lag: ${report.findings.length} finding(s) (${report.summary.confirmed} confirmed, ${report.summary.needsReview} needs-review)`,
  );

  const commentResult = await maybePostComment({
    inputs,
    github,
    report,
    env,
    client: runtime.githubClient,
    log,
    warn,
  });

  const outputs: ActionOutputs = {
    findingsCount: report.findings.length,
    confirmedCount: report.summary.confirmed,
    needsReviewCount: report.summary.needsReview,
    reportPath,
    sarifPath,
  };

  const outputText = `${formatGithubOutputs(outputs)}\n`;
  if (env.GITHUB_OUTPUT) {
    appendToGithubFile(env.GITHUB_OUTPUT, outputText);
  }

  return {
    report,
    outputs,
    exitCode: exitCodeFor(report, inputs.failOn),
    comment: commentResult,
  };
}

async function maybePostComment(options: {
  inputs: ActionInputs;
  github: GithubEventContext;
  report: ScanReport;
  env: NodeJS.ProcessEnv;
  client?: GithubApiClient;
  log: (message: string) => void;
  warn: (message: string) => void;
}): Promise<ActionRunResult["comment"]> {
  if (!options.inputs.comment) {
    return { attempted: false, posted: false, skippedReason: "comment input is false" };
  }
  const pr = options.github.pullRequest;
  if (!pr) {
    return { attempted: false, posted: false, skippedReason: "not a pull_request event" };
  }

  const token = options.env.GITHUB_TOKEN ?? options.env.GH_TOKEN;
  if (!token && !options.client) {
    options.warn("doc-lag: GITHUB_TOKEN missing; skipping sticky PR comment (job summary still written).");
    return { attempted: true, posted: false, skippedReason: "missing token" };
  }

  const client =
    options.client ??
    new FetchGithubApiClient({
      token: token as string,
      apiUrl: options.env.GITHUB_API_URL ?? "https://api.github.com",
    });

  const body = formatCommentBody(options.report);
  const result = await upsertStickyComment({
    owner: pr.owner,
    repo: pr.repo,
    issueNumber: pr.number,
    body,
    client,
  });

  if (result.ok) {
    options.log(
      `doc-lag: ${result.updated ? "updated" : "created"} sticky PR comment (id=${result.commentId})`,
    );
    return { attempted: true, posted: true };
  }

  if (result.reason === "permission") {
    options.warn(
      `doc-lag: could not post sticky PR comment (${result.message}). Continuing with job summary only (common on fork PRs).`,
    );
    return { attempted: true, posted: false, skippedReason: "permission" };
  }

  options.warn(`doc-lag: sticky PR comment failed: ${result.message}. Continuing with job summary only.`);
  return { attempted: true, posted: false, skippedReason: "error" };
}
