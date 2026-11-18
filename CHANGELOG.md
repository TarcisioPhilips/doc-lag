# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
