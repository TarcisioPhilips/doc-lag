import {
  findCommitTrailer,
  resolveMergeBase,
} from "../core/git-helpers.js";
import {
  resolveDocsSyncConfig,
  SURFACE_KINDS,
  type DocsSyncConfig,
} from "../core/docs-sync-config.js";
import { listFiles } from "../core/git.js";
import { compareFindings } from "../findings/normalize.js";
import type { DocsDiscoveryOptions, DocsSyncInfo, Finding } from "../types.js";
import { buildCandidates } from "./candidates.js";
import { evaluatePairingRules } from "./rules.js";

export type { DocsSyncInfo };

export interface DocsSyncEngineResult {
  /** Absent when docsSync is disabled. */
  info?: DocsSyncInfo;
  findings: Finding[];
}

export interface DocsSyncEngineOptions {
  cwd: string;
  base: string;
  head: string;
  /** Already-resolved commit SHAs (after working-tree materialization). */
  baseSha: string;
  headSha: string;
  docsOptions: DocsDiscoveryOptions;
  configPath?: string;
  /** CLI/Action/MCP overrides. */
  enabled?: boolean;
  enforce?: boolean;
  skipLabels?: string[];
  /** PR labels from the Action event payload (empty outside Action). */
  prLabels?: string[];
  env?: NodeJS.ProcessEnv;
  warn?: (message: string) => void;
}

function enabledDetectors(config: DocsSyncConfig): string[] {
  return SURFACE_KINDS.filter((kind) => config.detectors[kind]?.enabled).sort();
}

/**
 * Run the docs-sync check. When disabled, returns no info and no findings
 * so the scan report stays byte-identical to pre-docsSync output.
 *
 * Detectors are not wired in this step; pairing rules and skip/metadata run.
 */
export function runDocsSync(options: DocsSyncEngineOptions): DocsSyncEngineResult {
  const config = resolveDocsSyncConfig(options.cwd, {
    configPath: options.configPath,
    enabled: options.enabled,
    enforce: options.enforce,
    skipLabels: options.skipLabels,
    env: options.env,
    warn: options.warn,
  });

  if (!config.enabled) {
    return { findings: [] };
  }

  const warnings: string[] = [];
  const warn = (message: string): void => {
    warnings.push(message);
    options.warn?.(message);
  };

  const merge = resolveMergeBase(options.cwd, options.baseSha, options.headSha, {
    warn,
  });
  const effectiveBase = merge.effectiveBase;

  // Label skip (Action); no-op when prLabels is empty/undefined.
  if (options.prLabels && options.prLabels.length > 0) {
    const hit = config.skipLabels.find((label) => options.prLabels!.includes(label));
    if (hit) {
      return {
        findings: [],
        info: {
          status: "skipped",
          skipReason: `label:${hit}`,
          enforced: config.enforce,
          effectiveBase,
          mergeBaseFallback: merge.mergeBaseFallback || undefined,
          detectors: enabledDetectors(config),
          rulesEvaluated: config.rules.length,
          candidateFiles: 0,
          newSurfaces: 0,
          findings: 0,
          omitted: 0,
          warnings,
        },
      };
    }
  }

  const trailer = findCommitTrailer(
    options.cwd,
    effectiveBase,
    options.headSha,
    config.skipTrailer,
    { warn },
  );
  if (trailer.found && trailer.value) {
    return {
      findings: [],
      info: {
        status: "skipped",
        skipReason: `trailer:${trailer.value}`,
        enforced: config.enforce,
        effectiveBase,
        mergeBaseFallback: merge.mergeBaseFallback || undefined,
        detectors: enabledDetectors(config),
        rulesEvaluated: config.rules.length,
        candidateFiles: 0,
        newSurfaces: 0,
        findings: 0,
        omitted: 0,
        warnings,
      },
    };
  }

  const headFilesList = listFiles(options.cwd, options.headSha);
  const headFiles = new Set(headFilesList);

  const candidates = buildCandidates({
    cwd: options.cwd,
    effectiveBase,
    head: options.headSha,
    docsOptions: options.docsOptions,
    ignore: config.ignore,
    warn,
  });
  warnings.push(...candidates.warnings.filter((w) => !warnings.includes(w)));

  // Detectors land in later tasks; newSurfaces stays 0 here.
  const newSurfaces = 0;

  const ruleFindings = evaluatePairingRules({
    cwd: options.cwd,
    effectiveBase,
    head: options.headSha,
    headFiles,
    entries: candidates.entries,
    codeCandidates: candidates.codeCandidates,
    config,
  });

  const sorted = [...ruleFindings].sort(compareFindings);
  const omitted = Math.max(0, sorted.length - config.maxFindings);
  const capped = omitted > 0 ? sorted.slice(0, config.maxFindings) : sorted;

  return {
    findings: capped,
    info: {
      status: "ran",
      enforced: config.enforce,
      effectiveBase,
      mergeBaseFallback: merge.mergeBaseFallback || undefined,
      detectors: enabledDetectors(config),
      rulesEvaluated: config.rules.length,
      candidateFiles: candidates.codeCandidates.length,
      newSurfaces,
      findings: sorted.length,
      omitted,
      truncated: candidates.truncated || undefined,
      warnings,
    },
  };
}

