export interface RuleInfo {
  id: string;
  title: string;
  description: string;
  /** How findings from this rule are typically classified. */
  statuses: Array<"confirmed" | "needs-review" | "unknown">;
}

/**
 * Catalog of deterministic rules registered in the scan pipeline.
 * Keep in sync with `src/core/scan.ts` / `src/rules/*`.
 */
export const RULE_CATALOG: readonly RuleInfo[] = [
  {
    id: "scripts.missing",
    title: "Missing package scripts",
    description:
      "Documented npm/pnpm/yarn/bun script invocations that were removed or renamed in package.json in the scanned diff.",
    statuses: ["confirmed"],
  },
  {
    id: "links.broken",
    title: "Broken local links",
    description:
      "Local Markdown links and file-path references pointing to files deleted or renamed in the scanned diff.",
    statuses: ["confirmed", "needs-review"],
  },
  {
    id: "env.stale",
    title: "Stale environment variable references",
    description:
      "Documented env keys removed or renamed in committed example files (.env.example and similar) in the scanned diff.",
    statuses: ["confirmed", "needs-review"],
  },
] as const;

export function listRules(): RuleInfo[] {
  return RULE_CATALOG.map((rule) => ({ ...rule, statuses: [...rule.statuses] }));
}
