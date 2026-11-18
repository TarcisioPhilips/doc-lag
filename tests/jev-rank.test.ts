import { afterEach, describe, expect, it, vi } from "vitest";
import { scan } from "../src/core/scan.js";
import { scanWithRanking } from "../src/core/scan-with-ranking.js";
import { ScanError } from "../src/errors.js";
import {
  JEV_MODEL,
  JEV_PRIVACY_NOTICE,
  TYPESAFE_API_KEY_ENV,
  TYPESAFE_SYSTEMONE_URL,
} from "../src/ranking/constants.js";
import {
  buildScoreRequest,
  estimateCostUsd,
  scoreWithJev,
} from "../src/ranking/jev-client.js";
import { applyJevRanking } from "../src/ranking/jev-rank.js";
import { redactSecrets, safeErrorMessage } from "../src/ranking/redact.js";
import { formatJson } from "../src/reporters/json.js";
import { formatText } from "../src/reporters/text.js";
import type { Finding, ScanReport } from "../src/types.js";
import { SCHEMA_VERSION, TOOL_NAME } from "../src/types.js";
import {
  cleanupFixture,
  createFixtureRepo,
  packageJson,
  type FixtureRepo,
} from "./helpers/fixture.js";

const fixtures: string[] = [];

afterEach(() => {
  while (fixtures.length > 0) {
    const repo = fixtures.pop();
    if (repo) cleanupFixture(repo);
  }
  vi.unstubAllGlobals();
});

function track(fixture: FixtureRepo): FixtureRepo {
  fixtures.push(fixture.repo);
  return fixture;
}

function needsReviewFixture(): FixtureRepo {
  return track(
    createFixtureRepo({
      baseFiles: {
        "package.json": packageJson({ build: "tsc" }),
        "src/old.ts": "export const x = 1;\n",
        "src/keep.ts": "export const y = 2;\n",
        "docs/guide.md":
          "See `src/old.ts` for the helper.\n\nAlso mention `src/keep.ts`.\n\nUnrelated prose about billing.\n",
      },
      headFiles: {
        "src/old.ts": null,
      },
    }),
  );
}

function mockJevFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return handler(url, init);
  });
  return fetchImpl as unknown as typeof fetch;
}

describe("redactSecrets", () => {
  it("redacts Bearer tokens and TYPESAFE_API_KEY assignments", () => {
    const raw =
      'Authorization: Bearer super-secret-key-value\nTYPESAFE_API_KEY=abc123xyz\napi_key="another-secret"';
    const redacted = redactSecrets(raw);
    expect(redacted).not.toContain("super-secret-key-value");
    expect(redacted).not.toContain("abc123xyz");
    expect(redacted).not.toContain("another-secret");
    expect(redacted).toContain("[REDACTED]");
    expect(safeErrorMessage(new Error("Bearer leaked-token-here failed"))).not.toContain(
      "leaked-token-here",
    );
  });
});

describe("Jev client request shape", () => {
  it("builds the verified System One score payload", () => {
    const payload = buildScoreRequest({
      pr_diff_summary: "Reduce TTL",
      doc_path: "docs/auth.md",
      doc_excerpt: "Refresh tokens remain valid for 30 days.",
    });
    expect(payload.model).toBe(JEV_MODEL);
    expect(typeof payload.questions).toBe("object");
    expect(Array.isArray(payload.questions)).toBe(false);
    expect(payload.questions.relevance?.type).toBe("score");
    expect(payload.questions.relevance?.instructions).toBeTruthy();
    expect(payload.questions.relevance?.criteria).toHaveLength(3);
    expect(payload.questions.relevance?.criteria[0]?.name).toBe("not_relevant");
    expect(estimateCostUsd(1_000_000)).toBeCloseTo(0.042);
  });
});

describe("scan without ranking stays offline and unchanged", () => {
  it("does not call fetch and omits ranking metadata", async () => {
    const fixture = needsReviewFixture();
    const fetchImpl = mockJevFetch(() => {
      throw new Error("network should not be used");
    });
    const deterministic = scan({
      cwd: fixture.repo,
      base: fixture.base,
      head: fixture.head,
    });
    const viaWrapper = await scanWithRanking({
      cwd: fixture.repo,
      base: fixture.base,
      head: fixture.head,
      rank: "none",
      fetchImpl,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(viaWrapper.ranking).toBeUndefined();
    expect(formatJson(viaWrapper)).toBe(formatJson(deterministic));
    expect(formatText(viaWrapper)).toBe(formatText(deterministic));
  });
});

describe("applyJevRanking", () => {
  it("errors clearly when TYPESAFE_API_KEY is missing", async () => {
    const fixture = needsReviewFixture();
    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    const warnings: string[] = [];
    await expect(
      applyJevRanking(report, {
        cwd: fixture.repo,
        headSha: fixture.head,
        baseLabel: fixture.base,
        headLabel: fixture.head,
        env: {},
        warn: (message) => warnings.push(message),
      }),
    ).rejects.toBeInstanceOf(ScanError);
    expect(warnings.some((w) => w.includes("Privacy notice"))).toBe(true);
  });

  it("reorders needs-review by score and records usage without changing status", async () => {
    const fixture = needsReviewFixture();
    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.findings.some((f) => f.status === "needs-review")).toBe(true);

    const scoresByExcerpt = new Map<string, number>();
    const fetchImpl = mockJevFetch(async (url, init) => {
      expect(url).toBe(TYPESAFE_SYSTEMONE_URL);
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer test-key-not-real");
      const body = JSON.parse(String(init?.body)) as {
        model: string;
        questions: Record<string, unknown>;
        state: { doc_excerpt: string };
      };
      expect(body.model).toBe(JEV_MODEL);
      expect(body.questions.relevance).toMatchObject({ type: "score" });
      const excerpt = body.state.doc_excerpt;
      const score = excerpt.includes("src/old.ts") ? 1.9 : 0.2;
      scoresByExcerpt.set(excerpt, score);
      return new Response(
        JSON.stringify({
          model: JEV_MODEL,
          answers: {
            relevance: {
              type: "score",
              score,
              confidence: 0.88,
              probabilities: { "0": 0.05, "1": 0.1, "2": 0.85 },
            },
          },
          usage: { input_tokens: 120, output_tokens: 10 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const warnings: string[] = [];
    const ranked = await applyJevRanking(report, {
      cwd: fixture.repo,
      headSha: fixture.head,
      baseLabel: fixture.base,
      headLabel: fixture.head,
      apiKey: "test-key-not-real",
      fetchImpl,
      warn: (message) => warnings.push(message),
    });

    expect(ranked.ranking?.applied).toBe(true);
    expect(ranked.ranking?.provider).toBe("jev");
    expect(ranked.ranking?.inputTokens).toBeGreaterThan(0);
    expect(ranked.ranking?.estimatedCostUsd).toBeCloseTo(
      estimateCostUsd(ranked.ranking!.inputTokens),
    );
    expect(warnings[0]).toBe(JEV_PRIVACY_NOTICE);

    const needsReview = ranked.findings.filter((f) => f.status === "needs-review");
    expect(needsReview.length).toBeGreaterThanOrEqual(1);
    for (const finding of needsReview) {
      expect(finding.status).toBe("needs-review");
      expect(finding.ranking?.score).toBeTypeOf("number");
      expect(finding.evidence.some((e) => e.path === "jev" && e.pointer === "/relevance")).toBe(
        true,
      );
    }
    // Highest score first among needs-review
    if (needsReview.length >= 2) {
      expect(needsReview[0]!.ranking!.score).toBeGreaterThanOrEqual(
        needsReview[1]!.ranking!.score,
      );
    }
    expect(formatText(ranked)).toContain("jev#relevance");
    expect(formatText(ranked)).toContain("Ranking: jev");
    expect(JSON.stringify(ranked)).not.toContain("test-key-not-real");
    expect(JSON.stringify(warnings)).not.toContain("test-key-not-real");
  });

  it("falls back to deterministic order on HTTP 500 without leaking secrets", async () => {
    const fixture = needsReviewFixture();
    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    const before = formatJson(report);
    const fetchImpl = mockJevFetch(async () => {
      return new Response(JSON.stringify({ error: "boom Authorization: Bearer secret-value" }), {
        status: 500,
      });
    });
    const warnings: string[] = [];
    const ranked = await applyJevRanking(report, {
      cwd: fixture.repo,
      headSha: fixture.head,
      baseLabel: fixture.base,
      headLabel: fixture.head,
      apiKey: "secret-value",
      fetchImpl,
      warn: (message) => warnings.push(message),
    });
    expect(ranked.ranking?.applied).toBe(false);
    expect(ranked.ranking?.warning).toMatch(/HTTP 500/);
    expect(ranked.findings.map((f) => f.id)).toEqual(report.findings.map((f) => f.id));
    expect(warnings.join("\n")).not.toContain("secret-value");
    expect(warnings.join("\n")).not.toMatch(/Authorization: Bearer (?!\[REDACTED\])/);
    // Findings themselves unchanged aside from ranking metadata absence
    const stripped: ScanReport = {
      ...ranked,
      ranking: undefined,
      findings: ranked.findings.map((f) => {
        const { ranking: _r, ...rest } = f;
        return rest as Finding;
      }),
    };
    expect(formatJson(stripped)).toBe(before);
  });

  it("falls back on 401 invalid key", async () => {
    const fixture = needsReviewFixture();
    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    const fetchImpl = mockJevFetch(async () => new Response("{}", { status: 401 }));
    const ranked = await applyJevRanking(report, {
      cwd: fixture.repo,
      headSha: fixture.head,
      baseLabel: fixture.base,
      headLabel: fixture.head,
      apiKey: "bad-key",
      fetchImpl,
      warn: () => undefined,
    });
    expect(ranked.ranking?.applied).toBe(false);
    expect(ranked.ranking?.warning).toMatch(/401/);
  });

  it("falls back on timeout / abort", async () => {
    const fixture = needsReviewFixture();
    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    const fetchImpl = mockJevFetch(async (_url, init) => {
      const signal = init?.signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    const ranked = await applyJevRanking(report, {
      cwd: fixture.repo,
      headSha: fixture.head,
      baseLabel: fixture.base,
      headLabel: fixture.head,
      apiKey: "test-key",
      fetchImpl,
      timeoutMs: 20,
      warn: () => undefined,
    });
    expect(ranked.ranking?.applied).toBe(false);
    expect(ranked.ranking?.warning).toMatch(/timed out/i);
  });
});

describe("scoreWithJev", () => {
  it("parses usage.input_tokens for cost", async () => {
    const fetchImpl = mockJevFetch(async () =>
      new Response(
        JSON.stringify({
          model: JEV_MODEL,
          answers: {
            relevance: { type: "score", score: 1.5, confidence: 0.7 },
          },
          usage: { input_tokens: 284, output_tokens: 12 },
        }),
        { status: 200 },
      ),
    );
    const result = await scoreWithJev({
      apiKey: "k",
      fetchImpl,
      state: {
        pr_diff_summary: "x",
        doc_path: "README.md",
        doc_excerpt: "y",
      },
    });
    expect(result.inputTokens).toBe(284);
    expect(estimateCostUsd(result.inputTokens)).toBeCloseTo(284 / 1_000_000 * 0.042);
  });
});

describe("scanWithRanking env wiring", () => {
  it("reads TYPESAFE_API_KEY from env when rank=jev", async () => {
    const fixture = needsReviewFixture();
    const fetchImpl = mockJevFetch(async () =>
      new Response(
        JSON.stringify({
          model: JEV_MODEL,
          answers: {
            relevance: { type: "score", score: 1.0, confidence: 0.5 },
          },
          usage: { input_tokens: 10, output_tokens: 1 },
        }),
        { status: 200 },
      ),
    );
    const report = await scanWithRanking({
      cwd: fixture.repo,
      base: fixture.base,
      head: fixture.head,
      rank: "jev",
      env: { [TYPESAFE_API_KEY_ENV]: "env-key-value" },
      fetchImpl,
      warn: () => undefined,
    });
    expect(report.ranking?.applied).toBe(true);
    expect(fetchImpl).toHaveBeenCalled();
    const firstCall = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = firstCall[1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer env-key-value");
  });
});

describe("report schema without ranking", () => {
  it("keeps schemaVersion 1.0 and no ranking key", () => {
    const report: ScanReport = {
      schemaVersion: SCHEMA_VERSION,
      tool: TOOL_NAME,
      mode: "diff",
      base: "a",
      head: "b",
      findings: [],
      summary: { confirmed: 0, needsReview: 0, unknown: 0 },
    };
    const parsed = JSON.parse(formatJson(report)) as Record<string, unknown>;
    expect(parsed.schemaVersion).toBe("1.0");
    expect("ranking" in parsed).toBe(false);
  });
});
