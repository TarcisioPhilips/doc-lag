import type { FailOn, ScanReport } from "../types.js";

export function exitCodeFor(report: ScanReport, failOn: FailOn): number {
  if (failOn === "none") {
    return 0;
  }
  return report.summary.confirmed > 0 ? 1 : 0;
}
