# Architecture

doc-lag is a local, read-only, deterministic pipeline. It never executes
commands found in documentation, never installs packages from a scanned
repository, and never modifies that repository.

## Pipeline

```
git range (base..head)
  → source extractors     (facts from changed manifests)
  → documentation discovery
  → documentation extractors (references in Markdown)
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
| `src/extractors/` | Turn repository files into structured facts or doc references |
| `src/rules/` | Pure checks that emit findings from those structures |
| `src/findings/` | IDs, sorting, summary counts |
| `src/reporters/` | Text and JSON output, CI exit codes |
| `src/cli.ts` | Commander interface |

## Adding a later rule (links/paths, env vars)

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

Current rule: `scripts.missing` (removed or renamed `package.json` scripts
that documentation still invokes).

Planned, not implemented:

- Local links and file paths (RF-05)
- `.env.example` / declared config keys (RF-06)

## Finding identity and output

Finding IDs are content-derived (`ruleId:docPath:line:factName`), not
sequential. Findings are sorted by documentation path, line, rule id, then
id. The JSON report uses `schemaVersion: "1.0"`.

## Trust boundary

Repository content is untrusted input. Markdown, comments, `AGENTS.md`, and
`CLAUDE.md` cannot change tool behavior. File reads are limited to paths
inside the repository tree at the given git refs.
