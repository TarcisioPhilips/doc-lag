# doc-lag

> **License:** MIT — see [LICENSE](LICENSE).

**Your code changed. Did your docs keep up?**

doc-lag is a local-first CLI that identifies documentation impacted by
code changes. It connects a Git diff to documented commands, local file
references, and configuration facts, producing **evidence-backed findings**
for developers and CI.

> **Project status: early local preview.** This repository is not published to
> npm. Three rules are implemented: `scripts.missing` (package.json scripts
> removed or renamed in a Git range, still referenced from Markdown),
> `links.broken` (local Markdown links and file paths pointing to files deleted
> or renamed in the diff), and `env.stale` (environment variables removed from
> `.env.example` files but still documented). Other planned checks (GitHub
> Action publishing, MCP, semantic ranking) are not available yet.

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
- Text and versioned JSON output with CI-friendly exit codes
- Offline-by-default, no signup, no API keys

Planned, not implemented yet:

- Published GitHub Action, SARIF output, MCP adapter, semantic ranking

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

## Roadmap

1. Local read-only deterministic CLI (scripts, links, and env rules).
2. Optional SARIF output and agent-facing MCP integration.
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
