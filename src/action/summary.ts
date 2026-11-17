import { formatCommentBody, STICKY_COMMENT_MARKER } from "./comment.js";
import type { ScanReport } from "../types.js";

/**
 * Job summary markdown (same content as the sticky comment, without the HTML marker).
 */
export function formatJobSummary(report: ScanReport): string {
  return formatCommentBody(report).replace(`${STICKY_COMMENT_MARKER}\n`, "");
}
