import {
  JEV_MODEL,
  JEV_REQUEST_TIMEOUT_MS,
  RELEVANCE_CRITERIA,
  RELEVANCE_INSTRUCTIONS,
  TYPESAFE_SYSTEMONE_URL,
} from "./constants.js";
import { redactSecrets, safeErrorMessage } from "./redact.js";

export interface JevScoreState {
  pr_diff_summary: string;
  changed_paths?: string[];
  doc_path: string;
  doc_excerpt: string;
  finding_id?: string;
  finding_message?: string;
}

export interface JevScoreQuestion {
  type: "score";
  instructions: string;
  criteria: Array<{ name: string; situation: string }>;
}

export interface JevSystemOneRequest {
  model: string;
  state: JevScoreState;
  questions: Record<string, JevScoreQuestion>;
}

export interface JevScoreAnswer {
  type: "score";
  score: number;
  confidence: number;
  probabilities?: Record<string, number>;
  legend?: Record<string, unknown>;
}

export interface JevSystemOneResponse {
  model?: string;
  answers: Record<string, JevScoreAnswer>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export interface JevScoreResult {
  score: number;
  confidence: number;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export type FetchLike = typeof fetch;

export class JevClientError extends Error {
  readonly status?: number;
  readonly retryable: boolean;

  constructor(message: string, options: { status?: number; retryable?: boolean } = {}) {
    super(redactSecrets(message));
    this.name = "JevClientError";
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

export function buildRelevanceQuestion(): JevScoreQuestion {
  return {
    type: "score",
    instructions: RELEVANCE_INSTRUCTIONS,
    criteria: RELEVANCE_CRITERIA.map((level) => ({
      name: level.name,
      situation: level.situation,
    })),
  };
}

export function buildScoreRequest(
  state: JevScoreState,
  model: string = JEV_MODEL,
): JevSystemOneRequest {
  return {
    model,
    state,
    questions: {
      relevance: buildRelevanceQuestion(),
    },
  };
}

export function estimateCostUsd(inputTokens: number): number {
  // $0.042 per million input tokens; output free.
  return (inputTokens / 1_000_000) * 0.042;
}

export interface ScoreWithJevOptions {
  apiKey: string;
  state: JevScoreState;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
  endpoint?: string;
}

/**
 * POST one Score question to TypeSafe System One.
 * Never attaches the Authorization header to thrown errors.
 */
export async function scoreWithJev(options: ScoreWithJevOptions): Promise<JevScoreResult> {
  const model = options.model ?? JEV_MODEL;
  const timeoutMs = options.timeoutMs ?? JEV_REQUEST_TIMEOUT_MS;
  const endpoint = options.endpoint ?? TYPESAFE_SYSTEMONE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const payload = buildScoreRequest(options.state, model);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    const aborted =
      (error instanceof Error && error.name === "AbortError") ||
      (typeof error === "object" &&
        error !== null &&
        "name" in error &&
        (error as { name: string }).name === "AbortError");
    if (aborted) {
      throw new JevClientError(`TypeSafe API request timed out after ${timeoutMs}ms`, {
        retryable: true,
      });
    }
    throw new JevClientError(`TypeSafe API request failed: ${safeErrorMessage(error)}`, {
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401) {
    throw new JevClientError(
      "TypeSafe API returned 401 Unauthorized (invalid or missing TYPESAFE_API_KEY).",
      { status: 401, retryable: false },
    );
  }

  if (response.status === 429) {
    throw new JevClientError("TypeSafe API returned 429 Too Many Requests (rate limited).", {
      status: 429,
      retryable: true,
    });
  }

  if (!response.ok) {
    // Do not include response body verbatim — it might echo headers.
    throw new JevClientError(`TypeSafe API returned HTTP ${response.status}.`, {
      status: response.status,
      retryable: response.status >= 500,
    });
  }

  let body: JevSystemOneResponse;
  try {
    body = (await response.json()) as JevSystemOneResponse;
  } catch (error) {
    throw new JevClientError(`TypeSafe API returned invalid JSON: ${safeErrorMessage(error)}`, {
      status: response.status,
      retryable: true,
    });
  }

  const answer = body.answers?.relevance;
  if (!answer || typeof answer.score !== "number") {
    throw new JevClientError("TypeSafe API response missing answers.relevance.score", {
      retryable: false,
    });
  }

  return {
    score: answer.score,
    confidence: typeof answer.confidence === "number" ? answer.confidence : 0,
    inputTokens: Number(body.usage?.input_tokens ?? 0),
    outputTokens: Number(body.usage?.output_tokens ?? 0),
    model: body.model ?? model,
  };
}
