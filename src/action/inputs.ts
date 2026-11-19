import { parseGlobList } from "../core/docs-config.js";
import type { FailOn, RankProvider } from "../types.js";

export interface ActionInputs {
  failOn: FailOn;
  comment: boolean;
  workingDirectory: string;
  sarif: boolean;
  /** Optional semantic ranking provider (`none` | `jev`). Default `none`. */
  rank: RankProvider;
  /** Optional explicit base ref/sha; otherwise taken from the pull_request event. */
  base?: string;
  /** Optional explicit head ref/sha; otherwise taken from the pull_request event. */
  head?: string;
  /** Optional path to doc-lag.config.json (relative to working-directory). */
  config?: string;
  /** Optional docs include globs (replaces defaults/config when set). */
  docsInclude?: string[];
  /** Optional docs exclude globs (replaces defaults/config when set). */
  docsExclude?: string[];
}

export interface ActionOutputs {
  findingsCount: number;
  confirmedCount: number;
  needsReviewCount: number;
  reportPath: string;
  sarifPath: string;
}

function readEnv(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env[name];
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function parseBoolean(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined) {
    return defaultValue;
  }
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  throw new Error(`Invalid boolean value "${raw}"`);
}

function parseFailOn(raw: string | undefined): FailOn {
  const value = (raw ?? "confirmed").trim().toLowerCase();
  if (value === "confirmed" || value === "none") {
    return value;
  }
  throw new Error(`Invalid fail-on value "${raw}" (expected confirmed|none)`);
}

function parseRank(raw: string | undefined): RankProvider {
  const value = (raw ?? "none").trim().toLowerCase();
  if (value === "none" || value === "jev") {
    return value;
  }
  throw new Error(`Invalid rank value "${raw}" (expected none|jev)`);
}

/**
 * Parse composite-action inputs from environment variables set in action.yml.
 */
export function parseActionInputs(env: NodeJS.ProcessEnv = process.env): ActionInputs {
  return {
    failOn: parseFailOn(readEnv("DOC_LAG_FAIL_ON", env)),
    comment: parseBoolean(readEnv("DOC_LAG_COMMENT", env), true),
    workingDirectory: readEnv("DOC_LAG_WORKING_DIRECTORY", env) ?? ".",
    sarif: parseBoolean(readEnv("DOC_LAG_SARIF", env), false),
    rank: parseRank(readEnv("DOC_LAG_RANK", env)),
    base: readEnv("DOC_LAG_BASE", env),
    head: readEnv("DOC_LAG_HEAD", env),
    config: readEnv("DOC_LAG_CONFIG", env),
    docsInclude: parseGlobList(readEnv("DOC_LAG_DOCS_INCLUDE", env)),
    docsExclude: parseGlobList(readEnv("DOC_LAG_DOCS_EXCLUDE", env)),
  };
}

export interface PullRequestContext {
  owner: string;
  repo: string;
  number: number;
  baseSha: string;
  headSha: string;
}

export interface GithubEventContext {
  eventName: string;
  repository: string;
  pullRequest?: PullRequestContext;
}

interface PullRequestEventPayload {
  pull_request?: {
    number?: number;
    base?: { sha?: string };
    head?: { sha?: string };
  };
  repository?: {
    name?: string;
    owner?: { login?: string };
  };
}

/**
 * Resolve owner/repo/PR SHAs from the GitHub Actions event payload.
 */
export function parseGithubEvent(
  eventName: string,
  repository: string | undefined,
  payload: unknown,
): GithubEventContext {
  const body = (payload ?? {}) as PullRequestEventPayload;
  const [ownerFromRepo, nameFromRepo] = (repository ?? "").split("/");
  const owner = body.repository?.owner?.login ?? ownerFromRepo;
  const repo = body.repository?.name ?? nameFromRepo;

  const ctx: GithubEventContext = {
    eventName,
    repository: owner && repo ? `${owner}/${repo}` : (repository ?? ""),
  };

  if (eventName === "pull_request" || eventName === "pull_request_target") {
    const pr = body.pull_request;
    if (
      pr &&
      typeof pr.number === "number" &&
      typeof pr.base?.sha === "string" &&
      typeof pr.head?.sha === "string" &&
      owner &&
      repo
    ) {
      ctx.pullRequest = {
        owner,
        repo,
        number: pr.number,
        baseSha: pr.base.sha,
        headSha: pr.head.sha,
      };
    }
  }

  return ctx;
}

export function resolveScanRange(
  inputs: ActionInputs,
  github: GithubEventContext,
): { base: string; head: string } {
  const base = inputs.base ?? github.pullRequest?.baseSha;
  const head = inputs.head ?? github.pullRequest?.headSha;
  if (!base || !head) {
    throw new Error(
      "Unable to resolve git range. On pull_request events base/head SHAs are taken from the event; otherwise set DOC_LAG_BASE and DOC_LAG_HEAD.",
    );
  }
  return { base, head };
}

/** Serialize outputs for $GITHUB_OUTPUT (name=value lines). */
export function formatGithubOutputs(outputs: ActionOutputs): string {
  return [
    `findings-count=${outputs.findingsCount}`,
    `confirmed-count=${outputs.confirmedCount}`,
    `needs-review-count=${outputs.needsReviewCount}`,
    `report-path=${outputs.reportPath}`,
    `sarif-path=${outputs.sarifPath}`,
  ].join("\n");
}
