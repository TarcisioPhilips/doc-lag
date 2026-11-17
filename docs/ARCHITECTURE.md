# Architecture

doc-lag is a local, read-only, deterministic pipeline. It never executes
commands found in documentation, never installs packages from a scanned
repository, and never modifies that repository.

## Pipeline

```
git range (base..head)
  → source extractors     (facts from changed manifests, env examples, path changes)
  → documentation discovery
  → documentation extractors (references in Markdown: scripts, links, env vars)
  → rules                 (compare facts vs references)
  → finding normalizer    (stable IDs, deterministic sort)
  → reporters + exit code (text / JSON)
```

Orchestration lives in `src/core/scan.ts`. Git access is confined to
`src/core/git.ts`, which only runs `git` with argument arrays (no shell, and
never a command parsed from a README).

## Modules

| Area | Role |
| --- | --- |
| `src/core/git.ts` | Resolve refs, list trees, read files at a revision, diff paths |
| `src/core/docs.ts` | Decide which Markdown files are in scope |
| `src/extractors/package-scripts.ts` | Extract script changes from package.json at base/head |
| `src/extractors/markdown-scripts.ts` | Extract script invocations from Markdown |
| `src/extractors/markdown-links.ts` | Extract local links and inline code paths from Markdown |
| `src/extractors/path-changes.ts` | Extract deleted/renamed files from git diff |
| `src/extractors/env-example.ts` | Extract env key changes from committed `.env.example`-like files |
| `src/extractors/markdown-env.ts` | Extract env var references from Markdown |
| `src/rules/scripts-missing.ts` | Report documented scripts missing from package.json |
| `src/rules/links-broken.ts` | Report links to files deleted/renamed in the diff |
| `src/rules/env-vars-stale.ts` | Report documented env keys removed from example files |
| `src/findings/` | IDs, sorting, summary counts |
| `src/reporters/` | Text and JSON output, CI exit codes |
| `src/cli.ts` | Commander interface |

## Adding a later rule

New rule families should follow the same contract so they slot in without
changing the CLI or report schema:

1. Add a source extractor in `src/extractors/` that reads a source of truth
   from git at `base` and `head` (for example, existing paths, or keys in
   `.env.example`).
2. Add a documentation extractor if the references live in Markdown (local
   links, `` `$VAR` `` mentions, and so on).
3. Add a rule in `src/rules/` that reports a finding **only** when the source
   fact changed in the diff *and* a documentation reference is now
   inconsistent. Untouched pre-existing drift stays silent — that is the
   PR-aware wedge.
4. Register the rule in `src/core/scan.ts`.
5. Cover it with a temp-dir git fixture in `tests/`.

Current rules:

- `scripts.missing` (RF-04): removed or renamed `package.json` scripts that
  documentation still invokes
- `links.broken` (RF-05): local Markdown links and file paths pointing to
  files deleted or renamed in the diff
- `env.stale` (RF-06): env keys removed or renamed in committed example files
  (`.env.example`, `.env.sample`, `.env.template`, …) that documentation still
  references. Never reads real `.env` files; only example files via git.

## Finding identity and output

Finding IDs are content-derived (`ruleId:docPath:line:factName`), not
sequential. Findings are sorted by documentation path, line, rule id, then
id. The JSON report uses `schemaVersion: "1.0"`.

## Trust boundary

Repository content is untrusted input. Markdown, comments, `AGENTS.md`, and
`CLAUDE.md` cannot change tool behavior. File reads are limited to paths
inside the repository tree at the given git refs.

## Design for future MCP and Jev integration

The finding structure is designed for future consumption by an MCP server
(read-only `scan_diff`, `get_finding`, `explain_impact` tools) and an optional
Jev semantic-ranking layer, without breaking changes:

- **Stable IDs**: Finding IDs are content-derived (`ruleId:docPath:line:name`),
  not sequential. This allows MCP clients to reference specific findings across
  sessions and Jev to correlate findings with ranking signals.

- **Evidence array**: Each finding includes an `evidence` array with structured
  provenance (source path, JSON pointer or status, base/head values). This
  provides enough context for a ranking model to assess relevance without
  re-parsing the repository.

- **Status granularity**: Findings have a `status` field (`confirmed`,
  `needs-review`, `unknown`) that separates deterministic checks from heuristic
  matches. Jev may re-rank `needs-review` findings but cannot upgrade
  `needs-review` to `confirmed`—only deterministic rules can do that.

- **Versioned JSON schema**: The report includes `schemaVersion: "1.0"`. Future
  additions (e.g., confidence scores, ranking metadata) will be additive fields
  or a minor version bump, preserving backward compatibility.

- **Deterministic output**: Same inputs produce identical JSON (sorted findings,
  stable IDs). This is essential for CI gating and for Jev evaluation baselines.

The MCP adapter (P1) will expose the scan pipeline as read-only tools. The Jev
integration (P2) will optionally re-rank `needs-review` findings by relevance
to the change, but it will never override `confirmed` status or modify the
deterministic core.
