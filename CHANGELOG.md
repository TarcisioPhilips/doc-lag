# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- MDX support (`.mdx`) with heuristic preparation: YAML frontmatter, `import`/`export`, and JSX/MDX expressions are neutralized without shifting finding line numbers
- Configurable documentation discovery via `doc-lag.config.json` / `.doc-lag.json` (`docs.include` / `docs.exclude`)
- CLI: `--config`, `--docs-include`, `--docs-exclude`; env `DOC_LAG_CONFIG`
- GitHub Action inputs: `config`, `docs-include`, `docs-exclude`
- MCP `scan_diff` / `explain_finding` params: `config`, `docs_include`, `docs_exclude`
- Broader default include globs: `documentation/**`, `website/docs/**`, `website/src/pages/**`, `apps/docs/**`, `packages/*/README.md`, `packages/*/docs/**`, `apps/*/README.md`, `content/**` (md + mdx)
- Default excludes for generated/build trees and `CHANGELOG.md` / `LICENSE.md`
- README section **What counts as documentation**
- Shared **Development workflow** in [`AGENTS.md`](AGENTS.md) (local `.plans/` specs → plan → tests → focused PRs; docs sync; safety; no feature-PR releases) and [`CONTRIBUTING.md`](CONTRIBUTING.md) pointer for humans and coding agents; `.plans/` gitignored

### Changed

- Default scan may report additional findings in monorepos and MDX doc sites (more paths in scope). Escape hatch: set `docs.include` to the legacy root + `docs/**/*.md` list. Findings for previously scanned Markdown paths remain compatible; report `schemaVersion` stays `1.0`.

## [0.3.0] — 2026-11-18

### Added

- Optional Jev semantic ranking for `needs-review` / `unknown` findings (ordering and evidence only; never changes status):
  - CLI: `--rank jev` or `DOC_LAG_RANK=jev` (requires `TYPESAFE_API_KEY`)
  - GitHub Action input: `rank: jev`
  - MCP `scan_diff` / `explain_finding`: `rank: "jev"`
- README rewrite aimed at npm adoption: quickstart (`npx doc-lag`), Action, and MCP first
- Agent setup docs: [`AGENTS.md`](AGENTS.md), [`docs/AGENT_SETUP.md`](docs/AGENT_SETUP.md), [`llms.txt`](llms.txt)

### Changed

- Default scan remains offline and deterministic when ranking is omitted (`--rank none`)

## [0.2.1] — 2026-11-18

### Fixed

- `doc-lag` and `doc-lag-mcp` now run when launched through npm/npx bin symlinks (they exited silently under npm installs in 0.2.0)

## [0.2.0] — 2026-11-17

### Added

- Read-only MCP server over stdio for coding agents (`doc-lag mcp` / `doc-lag-mcp` bin)
  - Tools: `scan_diff`, `explain_finding`, `list_rules`
  - Optional `include_working_tree` for uncommitted edits

[0.3.0]: https://github.com/TarcisioPhilips/doc-lag/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/TarcisioPhilips/doc-lag/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/TarcisioPhilips/doc-lag/compare/v0.1.1...v0.2.0
