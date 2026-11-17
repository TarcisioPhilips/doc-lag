# doc-lag

> **License:** MIT — see [LICENSE](LICENSE).

**Your code changed. Did your docs keep up?**

doc-lag is a local-first CLI that identifies documentation impacted by
code changes. It connects a Git diff to documented commands, local file
references, and configuration facts, producing **evidence-backed findings**
for developers and CI.

> **Project status: early local preview.** This repository is not published to
> npm. Three rules are implemented: `scripts.missing`, `links.broken`, and
> `env.stale`. A composite GitHub Action and a read-only MCP server (stdio) are
> available from this repository. Semantic ranking is not available yet.

## Why?

A pull request removes a script. The README still tells people to use it.
Traditional tests pass; onboarding breaks. doc-lag shows what changed,
where documentation became stale, and why.

The scan is **PR-aware**: it reports references to scripts that *changed in
the given diff*. A leftover command that was already stale before the change
is not reported. That keeps the signal focused on the review at hand.

## Run it locally

Requires Node.js 20+ and Git. From this repository:

```bash
npm install
npm test
npm run build

# Scan a Git range in any repository (this one, or another checkout)
node dist/cli.js scan --base <base-ref> --head <head-ref>
node dist/cli.js scan --base main --head HEAD --format json --fail-on confirmed
```

During development you can skip the build step:

```bash
npx tsx src/cli.ts scan --base <base-ref> --head <head-ref>
# or
npm run scan -- --base <base-ref> --head <head-ref>
```

```text
scripts.missing:README.md:42:deploy:preview  CONFIRMED  README.md:42
`npm run deploy:preview` is documented but no longer exists in package.json scripts.
Evidence: package.json#scripts
  base: "deploy:preview" was present
  head: "deploy:preview" is absent
Suggested action: Update the documented command or restore the script.

links.broken:README.md:15:src/lib/utils.ts  CONFIRMED  README.md:15
`[utils](src/lib/utils.ts)` references a file that was renamed in this diff.
Evidence: src/lib/utils.ts
  renamed → src/lib/helpers.ts
Suggested action: The file was renamed to `src/lib/helpers.ts`. Update the link to point to the new path.

env.stale:docs/setup.md:8:DATABASE_URL  CONFIRMED  docs/setup.md:8
`DATABASE_URL` is referenced in documentation but was removed from .env.example.
Evidence: .env.example/env/DATABASE_URL
Suggested action: Update the documentation to remove the reference or restore the env var.
```

The examples above are illustrative. Exact IDs and lines depend on the scanned
repository.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `--base <ref>` | required | Base Git ref |
| `--head <ref>` | `HEAD` | Head Git ref |
| `--format <text\|json\|sarif>` | `text` | Output format |
| `--fail-on <confirmed\|none>` | `confirmed` | CI threshold |
| `--cwd <path>` | current directory | Repository to scan |

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | No blocking findings (or `--fail-on none`) |
| 1 | At least one finding at the configured threshold |
| 2 | Usage, configuration, or execution error (including an invalid Git ref) |

Findings are always written to stdout. Errors go to stderr. The tool does
**not** execute commands found in documentation.

## Initial scope

Implemented now:

- PR-aware scans based on a Git range (`--base` / `--head`)
- **`scripts.missing`**: Detect documented `npm run`, `pnpm run` / `pnpm`,
  `yarn run` / `yarn`, and `bun run` invocations of scripts removed or renamed
  in `package.json`
- **`links.broken`**: Detect local Markdown links and file paths pointing to
  files deleted or renamed in the diff (see [Limitations](#links-broken-limitations))
- **`env.stale`**: Detect environment variables removed from `.env.example`,
  `.env.sample`, `.env.template` and similar committed example files that are
  still documented (see [Limitations](#env-stale-limitations))
- Markdown in scope: `README.md`, `docs/**/*.md`, `AGENTS.md`, `CLAUDE.md`,
  `CONTRIBUTING.md`
- Text, versioned JSON, and SARIF output with CI-friendly exit codes
- GitHub Action (sticky PR comment + job summary; optional SARIF)
- Read-only MCP server (`doc-lag mcp`) for coding agents
- Offline-by-default scan (no signup, no API keys; Action may call the GitHub
  API only to create/update the sticky comment)

Planned, not implemented yet:

- Optional semantic ranking (evaluate Jev versus simpler baselines first)

### links.broken limitations

The `links.broken` rule detects broken local links **caused by the diff**. It
does not report:

- Pre-existing broken links that were already invalid at the base ref
- External URLs (http://, https://, mailto:, etc.) — these are ignored entirely
- Broken anchor targets within files (only file existence is checked)

Confidence levels:

- **confirmed**: Standard Markdown links (`[text](path)`) and image links
  (`![alt](path)`) to files deleted or renamed in the diff
- **needs-review**: Inline code paths (`` `src/foo.ts` ``) that look like repo
  paths — these are heuristic matches and do not fail CI by default

When git detects a rename, the finding includes the new path as a suggested fix.

### env.stale limitations

The `env.stale` rule detects documentation that still references environment
variables **removed or renamed in the diff** from committed example files
(`.env.example`, `.env.sample`, `.env.template`, and similar). It does not
report:

- Pre-existing stale references that were already invalid at the base ref
- Real `.env` files that may contain secrets — only committed example files
  are read, and only via git at the given refs
- Freeform prose that mentions a concept without an extractable env key

Confidence levels:

- **confirmed**: Assignments in code blocks (`FOO_BAR=...`) and inline code
  mentions (`` `FOO_BAR` `` / `` `FOO_BAR=...` ``) matching a removed key
- **needs-review**: Bare keys in Markdown table cells — heuristic matches that
  do not fail CI by default (`--fail-on confirmed`)

When a single key is removed and a single key is added in the same example
file, the finding includes a rename hint.

## What this will *not* do

- Automatically rewrite docs
- Decide whether freeform prose is semantically correct
- Upload repo contents to AI services
- Require MCP, Jev, or another external model
- Execute, install, or evaluate commands mentioned in the scanned repository

## MCP server (coding agents)

doc-lag exposes a **read-only** MCP server over stdio so agents (Cursor, Claude
Code, Codex, VS Code) can ask which docs a change made stale — before opening a
PR or after editing code (including uncommitted working-tree changes).

```bash
npm run build
node dist/cli.js mcp
# or during development:
npm run mcp
```

Tools (all annotated read-only; no network; paths constrained to the workspace):

| Tool | Purpose |
| --- | --- |
| `scan_diff` | Scan `base..head` (defaults: merge-base with main → `HEAD`). Set `include_working_tree: true` to include uncommitted edits. |
| `explain_finding` | Re-scan and return one finding by stable id with full evidence. |
| `list_rules` | List `scripts.missing`, `links.broken`, `env.stale`. |

### Cursor

Create `.cursor/mcp.json` in the project (or user MCP config):

```json
{
  "mcpServers": {
    "doc-lag": {
      "command": "npx",
      "args": ["-y", "doc-lag", "mcp"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

Until the package is published to npm, point at this checkout instead:

```json
{
  "mcpServers": {
    "doc-lag": {
      "command": "node",
      "args": ["/absolute/path/to/doc-lag/dist/cli.js", "mcp"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

### Claude Code

```bash
claude mcp add doc-lag -- npx -y doc-lag mcp
# local checkout:
claude mcp add doc-lag -- node /absolute/path/to/doc-lag/dist/cli.js mcp
```

### VS Code

Add to `.vscode/mcp.json` (or user MCP settings):

```json
{
  "servers": {
    "doc-lag": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "doc-lag", "mcp"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

### Example tool call

```json
{
  "name": "scan_diff",
  "arguments": {
    "include_working_tree": true
  }
}
```

Example response (shape abbreviated):

```json
{
  "content": [
    {
      "type": "text",
      "text": "doc-lag scan abc1234..WORKING_TREE: 1 finding(s) (1 confirmed, 0 needs-review, 0 unknown).\n- [confirmed] scripts.missing:README.md:1:deploy:preview — `npm run deploy:preview` is documented but no longer exists in package.json scripts."
    }
  ],
  "structuredContent": {
    "schemaVersion": "1.0",
    "tool": "doc-lag",
    "mode": "diff",
    "base": "abc1234…",
    "head": "WORKING_TREE",
    "findings": [
      {
        "id": "scripts.missing:README.md:1:deploy:preview",
        "ruleId": "scripts.missing",
        "status": "confirmed",
        "message": "`npm run deploy:preview` is documented but no longer exists in package.json scripts.",
        "documentation": { "path": "README.md", "line": 1 },
        "evidence": [{ "path": "package.json", "pointer": "/scripts/deploy:preview" }],
        "suggestion": "Update the documented command or restore the script"
      }
    ],
    "summary": { "confirmed": 1, "needsReview": 0, "unknown": 0 }
  }
}
```

## GitHub Action

Use doc-lag on `pull_request` to scan `base.sha..head.sha`, write a job
summary, and post or update a single sticky PR comment. Fork PRs without
comment permission still get the job summary; the step does not fail for that
reason.

```yaml
name: doc-lag

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write
  # Optional, only if you upload SARIF:
  # security-events: write

jobs:
  doc-lag:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: doc-lag
        id: doc-lag
        uses: TarcisioPhilips/doc-lag@v0   # or pin a commit SHA / @main
        with:
          fail-on: confirmed            # confirmed | none (default: confirmed)
          comment: true                 # sticky PR comment (default: true)
          working-directory: .          # optional subdirectory
          sarif: false                  # optional SARIF file for code scanning

      # Optional: surface findings in GitHub code scanning
      # - if: steps.doc-lag.outputs.sarif-path != ''
      #   uses: github/codeql-action/upload-sarif@v3
      #   with:
      #     sarif_file: ${{ steps.doc-lag.outputs.sarif-path }}
      #     category: doc-lag
```

**Inputs:** `fail-on`, `comment`, `working-directory`, `sarif`, optional
`base` / `head` overrides.  
**Outputs:** `findings-count`, `confirmed-count`, `needs-review-count`,
`report-path`, `sarif-path`.

**Zero findings:** when `comment: true`, the Action still creates or updates
the sticky PR comment (and always writes the job summary), with an explicit
“No documentation drift findings for this range.” message. That makes it
obvious the scan ran. Set `comment: false` to suppress the PR comment and
rely on the job summary / outputs only. Re-runs upsert the same sticky
comment (matched by `<!-- doc-lag-sticky -->`) instead of posting duplicates.

The Action is a **composite action that installs and builds from source** in
`${{ github.action_path }}` (locked by `package-lock.json`). That avoids
committing a bundled `dist/` for the Action while keeping external consumers
correct when they pin a tag or SHA. The scan itself stays read-only and does
not execute commands found in documentation.

### Example sticky comment

```markdown
<!-- doc-lag-sticky -->
## doc-lag report

Scanned `aaa111..bbb222` — **1** confirmed, **1** needs-review.

### Confirmed

#### `README.md:1` — `scripts.missing` (CONFIRMED)

`npm run deploy:preview` is documented but no longer exists in package.json scripts.

- Evidence: `package.json#scripts` (`deploy:preview`: base present, head absent)
- Suggested fix: Update the documented command or restore the script

### Needs review

#### `docs/guide.md:4` — `links.broken` (NEEDS-REVIEW)

`src/old.ts` may reference a deleted path.

- Evidence: `src/old.ts` (deleted in this diff)
- Suggested fix: Confirm the inline path and update docs if needed.
```

## Roadmap

1. Local read-only deterministic CLI (scripts, links, and env rules).
2. Tested GitHub Action + optional SARIF (this repository).
3. Agent-facing MCP integration (this repository: `doc-lag mcp`).
4. Optional semantic ranking (evaluate Jev versus simpler approaches first).
5. GitHub Pages only after initial developer adoption.

## Differences from existing tools

The intended distinction is **PR-specific change-to-document traceability**
rather than broad repository linting. That still needs to be demonstrated
against tools such as `docsync`, `docs-drift`, and `doc-drift-guard`. See
[`PROJECT_SPEC.md`](PROJECT_SPEC.md) and the architecture notes in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Contributing

This is a pre-release local preview. Fixtures used by the test suite are
created in a temporary Git repository at runtime (`npm test`). Once the
project is public, we will publish a contribution guide, labeled starter
issues, and a license.

## License

MIT — see [LICENSE](LICENSE).
