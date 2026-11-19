# Contributing

Thanks for contributing to **doc-lag**.

**Process:** follow the **Development workflow** in [`AGENTS.md`](AGENTS.md) — same steps for humans and every coding agent (Cursor, Claude Code, Codex, Grok, etc.). It is tool-agnostic and not tied to any particular agent framework. Implementation specs/plans live in local gitignored `.plans/` only (never commit them or paste them into PR bodies beyond a short summary).

**Quick local loop** (Node.js 20+):

```bash
npm install
npm test
npm run build
node dist/cli.js scan --base main --head HEAD
```

Open a focused PR against `main` with a conventional description and a test plan. Do not bump the package version or publish; the maintainer releases.
