import { compareFindings } from "../findings/normalize.js";
import { ScanError } from "../errors.js";
import type { Finding, RankingInfo, ScanReport } from "../types.js";
import {
  JEV_MAX_CANDIDATES,
  JEV_MODEL,
  JEV_PRIVACY_NOTICE,
  JEV_REQUEST_TIMEOUT_MS,
  TYPESAFE_API_KEY_ENV,
} from "./constants.js";
import { buildPrDiffSummary } from "./diff-summary.js";
import { extractDocExcerpt } from "./doc-excerpt.js";
import {
  estimateCostUsd,
  JevClientError,
  scoreWithJev,
  type FetchLike,
} from "./jev-client.js";
import { redactSecrets, safeErrorMessage } from "./redact.js";

export type RankProvider = "none" | "jev";

export interface ApplyJevRankingOptions {
  cwd: string;
  /** Resolved head commit SHA (or WORKING_TREE materialization SHA). */
  headSha: string;
  /** Display base label already stored on the report. */
  baseLabel: string;
  /** Display head label already stored on the report. */
  headLabel: string;
  apiKey?: string;
  env?: NodeJS.ProcessEnv;
  maxCandidates?: number;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
  endpoint?: string;
  model?: string;
  /** Optional prebuilt diff summary (tests). */
  diffSummary?: string;
  /** Injected logger for privacy notice / warnings (defaults to stderr). */
  warn?: (message: string) => void;
}

function isRankable(finding: Finding): boolean {
  return finding.status === "needs-review" || finding.status === "unknown";
}

function readApiKey(options: ApplyJevRankingOptions): string | undefined {
  if (options.apiKey !== undefined) {
    const trimmed = options.apiKey.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  const env = options.env ?? process.env;
  const raw = env[TYPESAFE_API_KEY_ENV];
  if (raw === undefined) {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

function changedPathsFromFindings(findings: Finding[]): string[] {
  return [...new Set(findings.map((f) => f.change.path))].sort();
}

function withRankingEvidence(finding: Finding, score: number, confidence: number): Finding {
  const evidence = [
    ...finding.evidence,
    {
      path: "jev",
      pointer: "/relevance",
      head: {
        score,
        confidence,
        provider: "jev" as const,
        model: JEV_MODEL,
      },
    },
  ];
  return {
    ...finding,
    evidence,
    ranking: {
      provider: "jev",
      score,
      confidence,
    },
  };
}

function orderFindings(confirmed: Finding[], ranked: Finding[], unranked: Finding[]): Finding[] {
  return [...confirmed, ...ranked, ...unranked];
}

/**
 * Opt-in Jev semantic ranking: reorders needs-review/unknown findings only.
 * Never changes statuses or upgrades anything to confirmed.
 *
 * Missing TYPESAFE_API_KEY → clear ScanError (exit 2).
 * Timeouts / 4xx / 5xx / rate limits → keep deterministic order, set ranking.warning.
 */
export async function applyJevRanking(
  report: ScanReport,
  options: ApplyJevRankingOptions,
): Promise<ScanReport> {
  const warn =
    options.warn ?? ((message: string) => process.stderr.write(`${redactSecrets(message)}\n`));
  warn(JEV_PRIVACY_NOTICE);

  const apiKey = readApiKey(options);
  if (!apiKey) {
    throw new ScanError(
      `Semantic ranking with Jev requires ${TYPESAFE_API_KEY_ENV} to be set in the environment. ` +
        `Get a key at https://console.typesafe.ai, or omit --rank jev to stay offline.`,
    );
  }

  const confirmed = report.findings.filter((f) => f.status === "confirmed").sort(compareFindings);
  const candidates = report.findings.filter(isRankable).sort(compareFindings);
  const maxCandidates = options.maxCandidates ?? JEV_MAX_CANDIDATES;
  const toScore = candidates.slice(0, maxCandidates);
  const overflow = candidates.slice(maxCandidates);

  const rankingBase: RankingInfo = {
    provider: "jev",
    model: options.model ?? JEV_MODEL,
    applied: false,
    privacyNotice: JEV_PRIVACY_NOTICE,
    candidatesScored: 0,
    candidatesSkipped: overflow.length,
    inputTokens: 0,
    estimatedCostUsd: 0,
  };

  if (toScore.length === 0) {
    return {
      ...report,
      findings: orderFindings(confirmed, [], overflow),
      ranking: { ...rankingBase, applied: true },
    };
  }

  const diffSummary =
    options.diffSummary ??
    buildPrDiffSummary(options.cwd, report.base, options.headSha);
  const changedPaths = changedPathsFromFindings(report.findings);

  let inputTokens = 0;
  const scored: Array<{ finding: Finding; score: number; confidence: number }> = [];

  try {
    for (const finding of toScore) {
      const docExcerpt = extractDocExcerpt({
        cwd: options.cwd,
        head: options.headSha,
        docPath: finding.documentation.path,
        line: finding.documentation.line,
        fallback: finding.message,
      });
      const result = await scoreWithJev({
        apiKey,
        model: options.model ?? JEV_MODEL,
        timeoutMs: options.timeoutMs ?? JEV_REQUEST_TIMEOUT_MS,
        fetchImpl: options.fetchImpl,
        endpoint: options.endpoint,
        state: {
          pr_diff_summary: diffSummary,
          changed_paths: changedPaths,
          doc_path: finding.documentation.path,
          doc_excerpt: docExcerpt,
          finding_id: finding.id,
          finding_message: finding.message,
        },
      });
      inputTokens += result.inputTokens;
      scored.push({
        finding: withRankingEvidence(finding, result.score, result.confidence),
        score: result.score,
        confidence: result.confidence,
      });
    }
  } catch (error) {
    const message =
      error instanceof JevClientError
        ? error.message
        : `Jev ranking failed: ${safeErrorMessage(error)}`;
    warn(
      `doc-lag: ${message} Falling back to deterministic finding order.`,
    );
    return {
      ...report,
      findings: orderFindings(confirmed, candidates, []),
      ranking: {
        ...rankingBase,
        applied: false,
        warning: message,
        candidatesSkipped: candidates.length,
      },
    };
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    return compareFindings(a.finding, b.finding);
  });

  const rankedFindings = scored.map((item) => item.finding);
  const estimatedCostUsd = estimateCostUsd(inputTokens);

  warn(
    `doc-lag: Jev ranking scored ${rankedFindings.length} candidate(s); ` +
      `input_tokens=${inputTokens}; estimated_cost_usd=${estimatedCostUsd.toFixed(6)} ` +
      `(model ${options.model ?? JEV_MODEL}).`,
  );

  return {
    ...report,
    findings: orderFindings(confirmed, rankedFindings, overflow),
    ranking: {
      ...rankingBase,
      applied: true,
      candidatesScored: rankedFindings.length,
      candidatesSkipped: overflow.length,
      inputTokens,
      estimatedCostUsd,
    },
  };
}

export function parseRankProvider(raw: string | undefined): RankProvider {
  if (raw === undefined || raw.trim() === "" || raw.trim().toLowerCase() === "none") {
    return "none";
  }
  const value = raw.trim().toLowerCase();
  if (value === "jev") {
    return "jev";
  }
  throw new ScanError(`Invalid --rank value "${raw}" (expected none|jev)`);
}
