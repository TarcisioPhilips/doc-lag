# doc-lag

> **Working name — verify availability before publishing.**
> **License:** MIT — see [LICENSE](LICENSE).

**Your code changed. Did your docs keep up?**

doc-lag is a local-first CLI that identifies documentation impacted by
code changes. It connects a Git diff to documented commands and (later) local
file references and configuration facts, producing **evidence-backed findings**
for developers and CI.

> **Project status: early local preview.** This repository is not published to
> npm. Only the first rule is implemented: `package.json` scripts removed or
> renamed in a Git range, still referenced from Markdown. Other planned checks
> (local links, env files, GitHub Action, MCP) are not available yet.

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
```

The example above is illustrative. Exact IDs and lines depend on the scanned
repository.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `--base <ref>` | required | Base Git ref |
| `--head <ref>` | `HEAD` | Head Git ref |
| `--format <text\|json>` | `text` | Output format |
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
- Detect documented `npm run`, `pnpm run` / `pnpm`, `yarn run` / `yarn`, and
  `bun run` invocations of scripts removed or renamed in `package.json`
- Markdown in scope: `README.md`, `docs/**/*.md`, `AGENTS.md`, `CLAUDE.md`,
  `CONTRIBUTING.md`
- Text and versioned JSON output with CI-friendly exit codes
- Offline-by-default, no signup, no API keys

Planned, not implemented yet:

- Local links and file paths
- Explicit env examples (`.env.example`)
- GitHub Action, SARIF, MCP, semantic ranking

## What this will *not* do

- Automatically rewrite docs
- Decide whether freeform prose is semantically correct
- Upload repo contents to AI services
- Require MCP, Jev, or another external model
- Execute, install, or evaluate commands mentioned in the scanned repository

## Roadmap

1. Local read-only deterministic CLI (in progress; first rule only).
2. Additional deterministic rules, then a tested GitHub Actions workflow,
   optional SARIF, and agent-facing MCP integration.
3. Optional semantic ranking (evaluate Jev versus simpler approaches first).
4. GitHub Pages only after initial developer adoption.

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
