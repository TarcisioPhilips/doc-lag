import { isStickyComment } from "./comment.js";

export interface IssueComment {
  id: number;
  body: string;
  user?: { login?: string | null } | null;
}

export interface GithubApiClient {
  listIssueComments(owner: string, repo: string, issueNumber: number): Promise<IssueComment[]>;
  createIssueComment(owner: string, repo: string, issueNumber: number, body: string): Promise<IssueComment>;
  updateIssueComment(owner: string, repo: string, commentId: number, body: string): Promise<IssueComment>;
}

export type CommentPermissionResult =
  | { ok: true; commentId: number; updated: boolean }
  | { ok: false; reason: "permission" | "error"; message: string };

export interface UpsertStickyCommentOptions {
  owner: string;
  repo: string;
  issueNumber: number;
  body: string;
  client: GithubApiClient;
  /** Optional: only treat comments from this login as ours when multiple bots exist. */
  authorLogin?: string;
}

/**
 * Create or update the sticky doc-lag PR comment.
 * Callers should treat permission failures as non-fatal (fork PRs).
 */
export async function upsertStickyComment(
  options: UpsertStickyCommentOptions,
): Promise<CommentPermissionResult> {
  try {
    const comments = await options.client.listIssueComments(
      options.owner,
      options.repo,
      options.issueNumber,
    );
    const existing = comments.find((comment) => {
      if (!isStickyComment(comment.body)) {
        return false;
      }
      if (options.authorLogin && comment.user?.login) {
        return comment.user.login === options.authorLogin;
      }
      return true;
    });

    if (existing) {
      const updated = await options.client.updateIssueComment(
        options.owner,
        options.repo,
        existing.id,
        options.body,
      );
      return { ok: true, commentId: updated.id, updated: true };
    }

    const created = await options.client.createIssueComment(
      options.owner,
      options.repo,
      options.issueNumber,
      options.body,
    );
    return { ok: true, commentId: created.id, updated: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isPermissionError(error)) {
      return { ok: false, reason: "permission", message };
    }
    return { ok: false, reason: "error", message };
  }
}

export function isPermissionError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const status = "status" in error ? Number((error as { status: unknown }).status) : NaN;
  return status === 401 || status === 403 || status === 404;
}

export class FetchGithubApiClient implements GithubApiClient {
  constructor(
    private readonly options: {
      token: string;
      apiUrl: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const url = `${this.options.apiUrl.replace(/\/$/, "")}${path}`;
    const response = await fetchImpl(url, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.options.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      const error = new Error(`GitHub API ${method} ${path} failed (${response.status}): ${text}`);
      (error as Error & { status: number }).status = response.status;
      throw error;
    }

    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  async listIssueComments(owner: string, repo: string, issueNumber: number): Promise<IssueComment[]> {
    const results: IssueComment[] = [];
    let page = 1;
    for (;;) {
      const batch = await this.request<IssueComment[]>(
        "GET",
        `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100&page=${page}`,
      );
      results.push(...batch);
      if (batch.length < 100) {
        break;
      }
      page += 1;
      if (page > 20) {
        break;
      }
    }
    return results;
  }

  createIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
  ): Promise<IssueComment> {
    return this.request<IssueComment>("POST", `/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
      body,
    });
  }

  updateIssueComment(
    owner: string,
    repo: string,
    commentId: number,
    body: string,
  ): Promise<IssueComment> {
    return this.request<IssueComment>("PATCH", `/repos/${owner}/${repo}/issues/comments/${commentId}`, {
      body,
    });
  }
}
