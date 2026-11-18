/** Pinned TypeSafe System One model (see https://docs.typesafe.ai/models). */
export const JEV_MODEL = "jev-1.14.0" as const;

/** Verified live endpoint. */
export const TYPESAFE_SYSTEMONE_URL = "https://api.typesafe.ai/v1/systemone";

/** Env var that must hold the TypeSafe API key when `--rank jev` is requested. */
export const TYPESAFE_API_KEY_ENV = "TYPESAFE_API_KEY";

/**
 * Input token price for Jev 1.14 / 1.13 (output tokens are free).
 * Source: https://docs.typesafe.ai/models — $0.042 per Mtok.
 */
export const JEV_PRICE_PER_MILLION_INPUT_USD = 0.042;

/** Max needs-review / unknown findings scored per scan (keeps cost bounded). */
export const JEV_MAX_CANDIDATES = 20;

/** Max characters of PR diff summary sent in `state.pr_diff_summary`. */
export const JEV_MAX_DIFF_SUMMARY_CHARS = 4_000;

/** Max characters of documentation excerpt per candidate. */
export const JEV_MAX_DOC_EXCERPT_CHARS = 1_500;

/** Default HTTP timeout for a single System One request. */
export const JEV_REQUEST_TIMEOUT_MS = 30_000;

export const JEV_PRIVACY_NOTICE =
  "Privacy notice: semantic ranking with Jev sends PR diff summaries and documentation " +
  "excerpts to the TypeSafe AI API (https://api.typesafe.ai). Documentation text and " +
  "diff content leave your machine. The API key is read only from the TYPESAFE_API_KEY " +
  "environment variable and is never logged. See https://docs.typesafe.ai";

export const RELEVANCE_INSTRUCTIONS =
  "How relevant is this documentation paragraph to the pull request diff? " +
  "Judge whether a human reviewing stale docs after this PR should read this paragraph.";

/**
 * Ordered Score levels 0..2 — named situations (not vague degrees), matching the
 * verified PoC request shape and TypeSafe Score guidance.
 */
export const RELEVANCE_CRITERIA = [
  {
    name: "not_relevant",
    situation:
      "The paragraph does not document the behavior, API, config, or flow changed by the PR. " +
      "Shared keywords alone do not make it relevant.",
  },
  {
    name: "marginally_relevant",
    situation:
      "The paragraph covers the same module or neighboring topic, but not the specific change " +
      "in the PR. A reviewer might skim it secondarily.",
  },
  {
    name: "highly_relevant",
    situation:
      "The paragraph documents exactly the feature, API, or behavior the PR changes and would " +
      "become stale if the PR merges without a doc update.",
  },
] as const;
