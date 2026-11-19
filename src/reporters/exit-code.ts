import type { FailOn, ScanReport } from "../types.js";

export function exitCodeFor(report: ScanReport, failOn: FailOn): number {
  if (failOn === "none") {
    return 0;
  }
  if (report.summary.confirmed > 0) {
    return 1;
  }
  // docs.missing fails only when enforce is on and the check actually ran.
  if (
    report.docsSync?.enforced === true &&
    report.docsSync.status === "ran" &&
    report.findings.some((finding) => finding.ruleId === "docs.missing")
  ) {
    return 1;
  }
  return 0;
}
