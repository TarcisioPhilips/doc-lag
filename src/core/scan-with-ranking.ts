import { materializeWorkingTreeCommit } from "./working-tree.js";
import { resolveRef } from "./git.js";
import { scan } from "./scan.js";
import { applyJevRanking, parseRankProvider, type RankProvider } from "../ranking/jev-rank.js";
import type { FetchLike } from "../ranking/jev-client.js";
import type { ScanOptions, ScanReport } from "../types.js";

export interface ScanWithRankingOptions extends ScanOptions {
  /**
   * Optional semantic ranking. Default `none` keeps the scan offline and
   * byte-identical to `scan()`.
   */
  rank?: RankProvider | string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
  warn?: (message: string) => void;
}

function resolveProvider(rank: RankProvider | string | undefined): RankProvider {
  if (rank === undefined || rank === "none") {
    return "none";
  }
  if (rank === "jev") {
    return "jev";
  }
  return parseRankProvider(rank);
}

/**
 * Run the deterministic scan, then optionally reorder needs-review/unknown
 * findings with Jev. When `rank` is omitted or `none`, this is equivalent to
 * `scan()` (no network).
 */
export async function scanWithRanking(
  options: ScanWithRankingOptions,
): Promise<ScanReport> {
  const provider = resolveProvider(options.rank);
  const report = scan({
    cwd: options.cwd,
    base: options.base,
    head: options.head,
    includeWorkingTree: options.includeWorkingTree,
    docs: options.docs,
    configPath: options.configPath,
    docsSyncEnabled: options.docsSyncEnabled,
    docsSyncEnforce: options.docsSyncEnforce,
    docsSyncSkipLabels: options.docsSyncSkipLabels,
    prLabels: options.prLabels,
    env: options.env,
    warn: options.warn,
  });

  if (provider === "none") {
    return report;
  }

  const headSha = options.includeWorkingTree
    ? materializeWorkingTreeCommit(options.cwd)
    : resolveRef(options.cwd, options.head);

  return applyJevRanking(report, {
    cwd: options.cwd,
    headSha,
    baseLabel: report.base,
    headLabel: report.head,
    env: options.env,
    fetchImpl: options.fetchImpl,
    warn: options.warn,
  });
}
