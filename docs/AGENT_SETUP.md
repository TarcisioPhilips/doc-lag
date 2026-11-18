# Agent setup guide for doc-lag

Machine-friendly instructions for coding agents (Claude Code, Cursor, Codex, VS Code Copilot).
Humans: see the [README quickstart](../README.md#quickstart-1-minute).

**Package:** [`doc-lag`](https://www.npmjs.com/package/doc-lag) on npm (current published: **0.2.1**).  
**Repo:** https://github.com/TarcisioPhilips/doc-lag  
**Requires:** Node.js 20+, Git.

---

## Goal

Wire doc-lag into the user’s repository so that:

1. Pull requests get an automated documentation-drift scan.
2. (Optional) The user’s coding agent can call the read-only MCP server.
3. A first local scan is run and findings are reported.

## Safety rules (always)

- **Read-only by default.** Do not rewrite application documentation unless the user asks.
- **No secrets.** Never commit API keys, tokens, or `.env` files. Do not enable Jev ranking unless the user explicitly asks (Jev needs `TYPESAFE_API_KEY` and sends diff/doc excerpts to a third party).
- **No from-source build required for consumers.** Prefer `npx doc-lag` / `npx -y doc-lag mcp` from npm. Building this repo is only for contributing to doc-lag itself.
- Prefer **advisory** first runs (`--fail-on none`) when reporting; leave the Action at `fail-on: confirmed` unless the user wants otherwise.

---

## Step 1 — Detect the project

1. Confirm the workspace is a Git repository.
2. Detect the default branch (`main` or `master`; fall back to `git symbolic-ref refs/remotes/origin/HEAD`).
3. Confirm Node.js ≥ 20 is available (`node -v`).
4. Note whether `.github/workflows/` already exists.

---

## Step 2 — Add the GitHub Action workflow

Create `.github/workflows/doc-lag.yml` (skip or merge if an equivalent workflow already exists):

```yaml
name: doc-lag

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  doc-lag:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: doc-lag
        uses: TarcisioPhilips/doc-lag@v0
        with:
          fail-on: confirmed
```

**Required details:**

| Detail | Value |
| --- | --- |
| Permissions | `contents: read`, `pull-requests: write` |
| Checkout | `actions/checkout@v4` with **`fetch-depth: 0`** (full history for the base..head range) |
| Action | `TarcisioPhilips/doc-lag@v0` (or pin a commit SHA) |

Do **not** set `rank: jev` or `TYPESAFE_API_KEY` unless the user asked for Jev.

Optional later: `sarif: true` plus `github/codeql-action/upload-sarif` (needs `security-events: write`).

---

## Step 3 — Optionally register the MCP server

Prefer the published npm entrypoints (verified). There is **no** npm package named `doc-lag-mcp` — `npx doc-lag-mcp` 404s. The `doc-lag-mcp` binary is shipped **inside** package `doc-lag`:

```bash
npx -y doc-lag mcp
# same bin via the doc-lag package:
npx -y -p doc-lag doc-lag-mcp
# or after: npm install -g doc-lag
doc-lag-mcp
```

Package bins: `bin.doc-lag` → `dist/cli.js`, `bin.doc-lag-mcp` → `dist/mcp/main.js`.

Pick the config that matches the host tool. Do not invent alternate package names.

### Cursor

Create or merge `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "doc-lag": {
      "command": "npx",
      "args": ["-y", "doc-lag", "mcp"]
    }
  }
}
```

Project file: `.cursor/mcp.json`. User-global alternative: `~/.cursor/mcp.json`.

### Claude Code

```bash
claude mcp add doc-lag -- npx -y doc-lag mcp
```

Or commit project-scoped `.mcp.json`:

```json
{
  "mcpServers": {
    "doc-lag": {
      "command": "npx",
      "args": ["-y", "doc-lag", "mcp"]
    }
  }
}
```

### VS Code / Copilot

Create or merge `.vscode/mcp.json`:

```json
{
  "servers": {
    "doc-lag": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "doc-lag", "mcp"]
    }
  }
}
```

Note the top-level key is **`servers`** (not `mcpServers`), and **`type": "stdio"`** is required for this format.

### Codex

Project: `.codex/config.toml` (loaded for trusted projects). User-global: `~/.codex/config.toml`.

```toml
[mcp_servers.doc-lag]
command = "npx"
args = ["-y", "doc-lag", "mcp"]
```

### MCP tools available

| Tool | Purpose |
| --- | --- |
| `scan_diff` | Scan a git range (default merge-base with main → `HEAD`). `include_working_tree: true` includes uncommitted edits. |
| `explain_finding` | Re-scan and return one finding by stable id. |
| `list_rules` | List `scripts.missing`, `links.broken`, `env.stale`. |

All tools are read-only. Do not pass `rank: "jev"` unless the user asked.

---

## Step 4 — Run a first scan and report

```bash
npx doc-lag scan --base <default-branch> --fail-on none
```

If the default branch ref is missing locally:

```bash
git fetch origin <default-branch>
npx doc-lag scan --base origin/<default-branch> --fail-on none
```

Or use MCP `scan_diff` with `include_working_tree: true` when the user has uncommitted edits.

**Report back:**

- Whether the workflow file was added/updated
- Whether MCP config was added (and which path)
- Scan range used (`base..head`)
- Finding counts (confirmed / needs-review) and a short summary of each confirmed finding
- Reminder that needs-review items are advisory under `--fail-on confirmed`

---

## CLI reference (consumer)

```bash
npx doc-lag scan --base <ref> [--head HEAD] [--format text|json|sarif] [--fail-on confirmed|none] [--cwd <path>]
```

| Exit | Meaning |
| --- | --- |
| 0 | No blocking findings (or `--fail-on none`) |
| 1 | Finding(s) at the configured threshold |
| 2 | Usage / config / execution error |

**Published npm 0.2.1** does **not** include `--rank`. Ranking (`--rank jev`, Action `rank: jev`, MCP `rank: "jev"`) is on repository `main` and will ship as **0.3.0**. Only enable it when the user asks **and** a version that supports it is available; it requires `TYPESAFE_API_KEY` and sends diff summaries + doc excerpts to `https://api.typesafe.ai`.

---

## What doc-lag checks

- **`scripts.missing`** — documented package-manager script invocations removed/renamed in `package.json`
- **`links.broken`** — local Markdown/image links (confirmed) or inline path heuristics (needs-review) broken by the diff
- **`env.stale`** — env keys removed from committed example files still mentioned in docs

Docs scanned: `README.md`, `docs/**/*.md`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`.  
Pre-existing drift (already wrong at `base`) is intentionally not reported.

---

## Do not

- Teach users to `npm install && npm run build` this repo just to scan their own project
- Commit `TYPESAFE_API_KEY` or enable Jev by default
- Change Action `fail-on` to `none` in the committed workflow unless the user wants advisory CI
- Claim endorsements of TypeSafe, Jev, or third-party projects
