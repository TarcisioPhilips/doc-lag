# doc-lag

[![npm](https://img.shields.io/npm/v/doc-lag.svg)](https://www.npmjs.com/package/doc-lag)
[![CI](https://github.com/TarcisioPhilips/doc-lag/actions/workflows/ci.yml/badge.svg)](https://github.com/TarcisioPhilips/doc-lag/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Your code changed. Did your docs keep up?**

doc-lag scans a Git range and reports documentation that this change made stale —
with evidence, not guesses. Use it from the CLI, a GitHub Action, or an MCP server
for coding agents.

```text
scripts.missing:README.md:42:deploy:preview  CONFIRMED  README.md:42
`npm run deploy:preview` is documented but no longer exists in package.json scripts.
Evidence: package.json#scripts
  base: "deploy:preview" was present
  head: "deploy:preview" is absent
Suggested action: Update the documented command or restore the script.
```

It catches removed/renamed `package.json` scripts still documented as `npm`/`pnpm`/`yarn`/`bun`
commands, local Markdown links and paths broken by the diff, and env keys removed from
committed example files (`.env.example` and similar) that docs still mention.

---

## Quickstart (~1 minute)

Requires **Node.js 20+** and Git.

### CLI

```bash
# one-shot (no install)
npx doc-lag scan --base main

# or install globally
npm install -g doc-lag
doc-lag scan --base main --head HEAD
```

`--head` defaults to `HEAD`. Add `--format json` or `--format sarif` for machines; `--fail-on none` for advisory runs.

### GitHub Action

```yaml
# .github/workflows/doc-lag.yml
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

### MCP (coding agents)

Prefer the subcommand (there is no separate `doc-lag-mcp` package on npm):

```bash
npx -y doc-lag mcp
# same bin, via the doc-lag package:
npx -y -p doc-lag doc-lag-mcp
# or after: npm install -g doc-lag
doc-lag-mcp
```

**Cursor** — `.cursor/mcp.json`:

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

**Claude Code:**

```bash
claude mcp add doc-lag -- npx -y doc-lag mcp
```

Or commit a project `.mcp.json` with the same `mcpServers` shape.

**VS Code / Copilot** — `.vscode/mcp.json`:

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

**Codex** — `.codex/config.toml` (project) or `~/.codex/config.toml`:

```toml
[mcp_servers.doc-lag]
command = "npx"
args = ["-y", "doc-lag", "mcp"]
```

---

## Set it up with your coding agent

Paste this prompt into Claude Code, Cursor, Codex, or VS Code Copilot:

````text
Set up doc-lag in this repository following
https://github.com/TarcisioPhilips/doc-lag/blob/main/docs/AGENT_SETUP.md

Constraints:
- Read-only setup: do not rewrite application docs unless I ask.
- Do not commit secrets or API keys.
- Add `.github/workflows/doc-lag.yml` with contents: read, pull-requests: write,
  actions/checkout@v4 with fetch-depth: 0, and uses: TarcisioPhilips/doc-lag@v0.
- Optionally register the MCP server for the tool I am using (Cursor `.cursor/mcp.json`,
  Claude Code `claude mcp add` / `.mcp.json`, VS Code `.vscode/mcp.json`,
  Codex `.codex/config.toml`) using `npx -y doc-lag mcp`.
- Do not enable Jev ranking (`--rank jev` / `rank: jev`) unless I explicitly ask.
- Run `npx doc-lag scan --base <default-branch>` (or merge-base) once and report findings.
````

One-liner for your agent:

```text
Set up doc-lag in this repo following https://github.com/TarcisioPhilips/doc-lag/blob/main/docs/AGENT_SETUP.md
```

Machine-readable copies: [`docs/AGENT_SETUP.md`](docs/AGENT_SETUP.md), [`AGENTS.md`](AGENTS.md), [`llms.txt`](llms.txt).

---

## How it works

The scan is **PR-aware**: it reports documentation references invalidated by
*this* `base..head` diff. A leftover command that was already stale before the
change is not reported. That keeps the signal focused on the review at hand.

### Rules

| Rule | Confirmed | Needs-review |
| --- | --- | --- |
| `scripts.missing` | Documented `npm`/`pnpm`/`yarn`/`bun` script invocations removed or renamed in `package.json` | — |
| `links.broken` | Markdown / image links to files deleted or renamed in the diff | Inline `` `path/like` `` heuristics |
| `env.stale` | Code-block / inline-code env keys removed from `.env.example` (and similar) | Bare keys in Markdown table cells |

Markdown in scope: `README.md`, `docs/**/*.md`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`.

**confirmed** findings fail CI by default (`--fail-on confirmed`). **needs-review** findings are advisory and do not fail that threshold.

Default scan is offline: no signup, no API keys. The GitHub Action may call the
GitHub API only to create/update the sticky PR comment. The tool never executes
commands found in documentation.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `--base <ref>` | required | Base Git ref |
| `--head <ref>` | `HEAD` | Head Git ref |
| `--format <text\|json\|sarif>` | `text` | Output format |
| `--fail-on <confirmed\|none>` | `confirmed` | CI threshold |
| `--rank <none\|jev>` | `none` | Optional semantic ranking (**since 0.3.0** / current `main`; not in npm `0.2.1`) |
| `--cwd <path>` | current directory | Repository to scan |

`DOC_LAG_RANK=jev` is equivalent to `--rank jev` when the flag is omitted (**since 0.3.0**).

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | No blocking findings (or `--fail-on none`) |
| 1 | At least one finding at the configured threshold |
| 2 | Usage, configuration, or execution error (including an invalid Git ref) |

Findings go to stdout; errors to stderr.

### Rule limitations

**`links.broken`** does not report pre-existing broken links, external URLs
(`http://`, `https://`, `mailto:`, …), or missing in-file anchors (file existence
only). Renames detected by Git include the new path as a suggested fix.

**`env.stale`** only reads committed example files (`.env.example`, `.env.sample`,
`.env.template`, and similar) via Git at the given refs — never real `.env`
files. Freeform prose without an extractable key is ignored. A 1:1 remove/add
in the same example file yields a rename hint.

### What this will *not* do

- Automatically rewrite docs
- Decide whether freeform prose is semantically correct
- Upload repo contents to AI services **unless you opt into `--rank jev`**
- Require MCP, Jev, or another external model (default remains local)
- Execute, install, or evaluate commands mentioned in the scanned repository

---

## Optional: Jev ranking *(since 0.3.0)*

> **Availability:** `--rank jev`, Action `rank: jev`, and MCP `rank: "jev"` are on
> `main` and will ship in **npm 0.3.0**. npm **0.2.1** and Action tag **`@v0`**
> (currently pointing at 0.2.1) do not include ranking yet — use a `main` checkout
> / `uses: TarcisioPhilips/doc-lag@main` until 0.3.0 is released.

By default doc-lag stays offline. When a PR produces many **needs-review**
findings, optional **[Jev](https://docs.typesafe.ai)** ranking (TypeSafe AI’s
non-generative System One model) puts the ones that matter first and sinks likely
false alarms. Ranking **never** changes a finding’s `status` and never upgrades
anything to `confirmed` — order and evidence only.

**When to enable:** large PRs with a noisy needs-review list (especially
`env.stale` table cells or heuristic path mentions). Skip it for small PRs or when
you want a fully offline CI job.

**Example:** three `env.stale` needs-review hits after removing billing/SMTP keys.
Without ranking, a glossary table that merely mentions `LEGACY_TOKEN` sits mixed
in with real config docs. With `--rank jev`, billing/SMTP docs surface first
(~0.96 / ~0.91 confidence) and the glossary mention drops last (~0.22).

**Benchmark** (43 public PRs from 13 open-source projects; evaluation only — not
an endorsement of those projects, TypeSafe, or Jev):

| Ranker | nDCG@3 | P@2 |
| --- | ---: | ---: |
| Jev (`score`) | 0.86 | 0.96 |
| Path overlap | 0.73 | 0.88 |
| BM25 | 0.62 | 0.72 |

Rough cost on that set: ~US$0.007 total and ~0.4s per case.

**Privacy:** when ranking is enabled, PR diff summaries and documentation excerpts
are sent to `https://api.typesafe.ai`. The key is read only from
`TYPESAFE_API_KEY` and is never logged. Missing key → clear error (exit 2).
Timeouts, 4xx/5xx, and rate limits fall back to deterministic order with a warning.

### Setup (CLI / Action / MCP)

```bash
export TYPESAFE_API_KEY="your-key"   # https://console.typesafe.ai
# needs doc-lag >= 0.3.0 (or current main):
doc-lag scan --base main --head HEAD --rank jev
```

```yaml
# Action: pin @main until 0.3.0 / a tag that includes ranking
- uses: TarcisioPhilips/doc-lag@main
  with:
    fail-on: confirmed
    rank: jev
  env:
    TYPESAFE_API_KEY: ${{ secrets.TYPESAFE_API_KEY }}
```

```json
{
  "name": "scan_diff",
  "arguments": {
    "base": "main",
    "head": "HEAD",
    "rank": "jev"
  }
}
```

---

## GitHub Action details

On `pull_request`, the Action scans `base.sha..head.sha`, writes a job summary,
and posts or updates a single sticky PR comment. Fork PRs without comment
permission still get the job summary; the step does not fail for that reason.

**Inputs:** `fail-on`, `comment`, `working-directory`, `sarif`, `rank` (**since 0.3.0**),
optional `base` / `head` overrides.  
**Outputs:** `findings-count`, `confirmed-count`, `needs-review-count`,
`report-path`, `sarif-path`.

With `comment: true` (default), zero findings still upsert the sticky comment
(“No documentation drift findings…”) so it is obvious the scan ran. Re-runs
match `<!-- doc-lag-sticky -->` instead of posting duplicates.

The Action is a **composite action that installs and builds from source** in
`${{ github.action_path }}` (locked by `package-lock.json`). Pin a tag or SHA for
reproducibility.

Optional SARIF upload:

```yaml
      - name: doc-lag
        id: doc-lag
        uses: TarcisioPhilips/doc-lag@v0
        with:
          sarif: true

      - if: steps.doc-lag.outputs.sarif-path != ''
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: ${{ steps.doc-lag.outputs.sarif-path }}
          category: doc-lag
```

(`security-events: write` required for the upload step.)

### MCP tools

All tools are annotated read-only; paths are constrained to the workspace.

| Tool | Purpose |
| --- | --- |
| `scan_diff` | Scan `base..head` (defaults: merge-base with main → `HEAD`). Set `include_working_tree: true` for uncommitted edits. Optional `rank: "jev"` (**since 0.3.0**). |
| `explain_finding` | Re-scan and return one finding by stable id with full evidence. |
| `list_rules` | List `scripts.missing`, `links.broken`, `env.stale`. |

---

## Why this is different

doc-lag focuses on **PR-specific change-to-document traceability** (this diff →
these evidence-backed doc hits), not broad repository linting or age-based
“docs older than code” heuristics. Competitive notes:
[`docs/validation.md`](docs/validation.md), [`PROJECT_SPEC.md`](PROJECT_SPEC.md),
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Roadmap

1. Local read-only deterministic CLI (scripts, links, and env rules) — shipped.
2. GitHub Action + optional SARIF — shipped.
3. Agent-facing MCP (`doc-lag mcp`; bin `doc-lag-mcp` inside the `doc-lag` package) — shipped on npm.
4. Optional semantic ranking with Jev (`--rank jev`) — on `main`, npm **0.3.0** next.
5. GitHub Pages only after initial developer adoption.

## Contributing / development

From a clone (Node 20+):

```bash
npm install
npm test
npm run build

# scan with the built CLI
node dist/cli.js scan --base main --head HEAD

# or without a build step
npx tsx src/cli.ts scan --base main --head HEAD
npm run scan -- --base main --head HEAD
npm run mcp
```

Test fixtures are created in a temporary Git repository at runtime (`npm test`).
Issues and PRs welcome.

## License

MIT — see [LICENSE](LICENSE).
