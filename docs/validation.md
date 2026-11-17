# Gate 0 — Competitive validation

**Date:** 2026-11-17 (America/Sao_Paulo, UTC-3)  
**Status:** complete for the synthetic fixture described below  
**Purpose:** decide whether doc-lag's chosen wedge — *given this git diff, which documentation claims are now invalid or deserve review, and why?* — is still a real gap, or whether existing tools already deliver equivalent change-to-document traceability with similar setup burden (the specification's kill / pivot condition).

This document records only what was installed and executed. No competitor result is inferred from a README alone.

## 1. Method

### 1.1 Environment

| Item | Value |
|---|---|
| Host | Linux 6.12.113+ x86_64, 8-core Intel Xeon |
| Local time of the runs | 2026-11-17 18:53 America/Sao_Paulo (UTC-3) |
| Go | go1.27.3 |
| Node.js / npm | v24.22.1 / 11.21.1 |
| Python | 3.13.5 |
| Working tree | `/workspace/doc-lag-validation` |

Times below are single-run wall-clock measurements on this machine, not a benchmark claim.

### 1.2 Fixture

A tiny Node.js git repository lives at [`fixture/preview-service`](../fixture/preview-service). It has two commits:

| Ref | SHA | Role |
|---|---|---|
| `main` (base) | `041f53207c40e3126468809a7e4b1ab829b5551b` | Docs and source agree, except for one intentional pre-existing stale page |
| `stale-docs` (head) | `308fdcaeaa8c3e11b75f397542d453770ba7a0f1` | Code changes that leave documentation behind |

The head diff touches only `.env.example`, `package.json`, `src/cli.js`, `src/lib/preview.js` → `src/lib/preview-engine.js`, and `src/server.js`. **No Markdown file is modified in the PR.** Case definitions and the expected doc-lag behavior are in [`fixture/CASES.md`](../fixture/CASES.md).

| ID | Change in `main..stale-docs` | Stale documentation (unchanged) |
|---|---|---|
| A | `package.json` script `deploy:preview` is removed | `README.md:20`, `AGENTS.md:3` still say `npm run deploy:preview` |
| B | `src/lib/preview.js` is moved and the export is renamed to `buildSnapshot` | Markdown link and path references to `src/lib/preview.js`; README example still calls `buildPreview()` |
| C | `PREVIEW_SECRET` is removed from `.env.example` (and from server code) | `README.md`, `AGENTS.md`, `docs/setup.md`, `docs/api.md` still document it |
| D | CLI flag `--dry-run` is renamed to `--check-only`; route `GET /api/preview` is renamed to `GET /api/snapshots` | `README.md`, `docs/cli.md`, `docs/api.md`, `AGENTS.md` |
| N | *(not part of the diff)* | `docs/maintenance.md` still documents `npm run ancient:cleanup` and links to `docs/legacy-handbook.md`, both already invalid on `main` |

Case N exists to distinguish a PR-aware tool from a generic repository-wide scanner. A PR-aware tool may still *discover* N in an `--all` scan, but it must not present N as something this pull request caused.

The fixture can be recreated with [`scripts/create-fixture.sh`](../scripts/create-fixture.sh). Raw JSON from every run is under [`raw-results/`](../raw-results).

### 1.3 Competitors

Each tool was cloned from GitHub on 2026-11-17 and built or installed from that checkout. GitHub metadata (stars, `pushed_at`, license field) was read with the authenticated GitHub API. License files in the trees were also checked.

| Project | HEAD SHA | Stars | GitHub `pushed_at` (as America/Sao_Paulo) | License | Language |
|---|---|---|---|---|---|
| [Dvorinka/docsync](https://github.com/Dvorinka/docsync) | `4ea15396c692a8fc18de0f6344910565f5c8c61f` | 1 | 2026-11-07 09:50 | Apache-2.0 in `LICENSE`; GitHub API reports `Other` / `NOASSERTION` | Go |
| [NickitaChe/docs-drift](https://github.com/NickitaChe/docs-drift) | `fdbd9a2dc376618f18145054cc451ba85624c3a0` | 0 | 2026-06-09 09:08 | MIT | TypeScript |
| [melonusers/doc-drift-guard](https://github.com/melonusers/doc-drift-guard) | `94de3877cbef5124543494ca3eec351130a1795f` | 0 | 2026-03-10 01:50 | MIT | Python |
| [pallaprolus/drift](https://github.com/pallaprolus/drift) (`docs-drift` on npm, v0.7.5) | `90a21b8c2744960894a290e1802f2f0ecf091cf9` | 4 | 2026-10-07 23:46 | MIT | TypeScript |
| GitHub Copilot skill `docs-sync-audit` | n/a (agent skill, not a CLI we ran) | n/a | n/a | described only; see §5 | Agent prompt + optional Python helper |

`pushed_at` values from the API, converted from UTC to America/Sao_Paulo (UTC-3).

### 1.4 How each tool was run

Commands were executed twice: once with the fixture on `main`, once on `stale-docs`. Tools that advertise a changed-only or baseline mode were also exercised in that mode on `stale-docs`.

- **docsync:** `go build -o bin/docsync ./cmd/docsync` (about 4.5 s), then `docsync check --json` from the fixture root. Additional runs: `check --json --baseline-out …` on `main`, then `check --json --baseline …` on `stale-docs`. An optional config enabling `api_routes` is recorded in the appendix; it is not the default.
- **NickitaChe/docs-drift:** `npm install && npm run build` in the clone (not published to npm; the npm name `docs-drift` is already used by pallaprolus/drift). Then `node packages/cli/dist/index.js scan --config docs-drift.yml --format json`. The fixture includes a `docs-drift.yml` because this tool **requires** a config and a CLI help command; the configured command was `node src/cli.js --help`, which the tool executed.
- **doc-drift-guard:** `python3 -m venv` + `pip install -e .`, then `ddg scan --repo . --format json --no-ai` (full scan) and `ddg scan --repo . --format json --no-ai --changed-only --base-ref main` on `stale-docs`.
- **pallaprolus/drift:** `npm install && npm run build:cli` in the clone (also published as `npx docs-drift@0.7.5`). Then `node dist/cli.js --format json --quiet --fail-on none .`.
- **docs-sync-audit:** not executed. It is an agent skill, not a local deterministic CLI. Section 5 quotes what the public skill page states.

## 2. Results

Legend for cases A–D: **Yes** = the tool named the stale documentation and the missing or renamed source fact; **Partial** = it surfaced a related symptom but not the intended source of truth, or only after a non-default setup; **No** = it did not report the case.

| Tool | Install friction | A script | B path/move | C env vs `.env.example` | D flag / route | Diff / PR-aware? | Case N on a PR scan | Evidence quality | Runtime (head) | CI support |
|---|---|---|---|---|---|---|---|---|---|---|
| **docsync** | Low. Single Go binary; no config required; `go build` succeeded. Also documents `go install` and an `install.sh`. | **Yes** (`README.md:20`, `AGENTS.md:3`) | **Yes** (`src/lib/preview.js` in README, AGENTS, `docs/setup.md`) | **No**. Env checks are code ↔ `.env.example`, not docs → `.env.example`. | **No** in the default scan. With an opt-in `api_routes` config it could not parse raw `http.createServer` routes (see appendix). | **Not as `--base/--head`.** `--baseline` can suppress findings already present on `main` (see §3.1). | Full scan reports N as critical findings mixed with A/B. Baseline mode suppressed all three N findings. | High for A/B: category, key, `file:line`, and a reason that names `package.json` or a missing path. Does not cite the git change. | 0.005 s | Yes: exit 2 on critical, `--format sarif`, `--json`, CI workflows in-repo. No first-party GitHub Action directory, but a one-binary CI step is straightforward. |
| **NickitaChe/docs-drift** | High. Must clone and build; unpublished; **requires YAML config**; **shells out to a configured help command**. | **No**. Did not compare `npm run deploy:preview` to `package.json`. Reported a noisy `npm run` “command not in CLI help” hit instead. | **No** path/link checks. | **Yes** on head (`PREVIEW_SECRET` missing from `.env.example`, cited in AGENTS + README). | **Partial (flag only).** `--dry-run` flagged on head against CLI help. Route `/api/preview` not checked. Many false-positive “commands” (`node`, `npm start`, `const payload`, …). | **No.** Full-tree comparison only. | Default include `docs/**/*.md` did **not** match files directly under `docs/` (glob bug; see appendix). After adding `docs/*.md`, `npm run` was flagged in `docs/maintenance.md` but not as a missing package script, and it was not attributed to the PR. | Medium when the check is in scope (env/flag name + files). Weak otherwise: no line numbers in the JSON we received, and command extraction is noisy. | 0.080 s | Yes: in-repo `packages/github-action`, `--fail-on`, JSON. |
| **doc-drift-guard** (`ddg`) | Medium. `pip install -e .` into a venv worked on Python 3.13; zero config for a first scan. | **No.** The CLI detector indexes commands from source, not `package.json` scripts, and treats `npm` as an external command. | **Partial.** On head it flagged missing `src/lib/preview.js` (and a `require("./src/lib/preview")` path) with a closest-match hint to `preview-engine.js`. On **base** it already falsely flagged `./src/lib/preview` as missing even though `src/lib/preview.js` existed. | **Partial, different check.** On head: “documented `PREVIEW_SECRET` is unused in code.” It does not compare docs to `.env.example`. | **No.** | **Partial.** `--changed-only --base-ref main` is implemented (`git diff --name-only base...HEAD`, then keep doc sections that mention a changed file’s name or stem). | `--changed-only` correctly omitted `docs/maintenance.md` (it never reports N anyway). It still emitted pre-existing false positives on README (`PORT` “undocumented”, `content-type` “config key”) because the filename heuristic pulled README in. | Mixed. Findings have severity, confidence, a summary, and evidence strings, but some are attached to README sections that do not exist (`#Configuration`, `#Environment`). | 0.210 s changed-only / 0.227 s full | Yes: exit 1 on findings, JSON/Markdown/SARIF-like, `.github/workflows/docs-drift.yml`, `--changed-only`. |
| **pallaprolus/drift** | Low for users (`npx docs-drift`); heavier from source (`npm install` pulled 277 packages in 48 s). | **No** | **No.** Scanned 4 JS files and 5 Markdown files, including the README example that still calls `buildPreview()`, and reported **zero** issues on base and on head. | **No** | **No** | Git blame / “docs older than code” exist, but they are age-based, not “this diff invalidated this claim.” Default `--stale-days 30`; this fixture’s 16-day gap did not fire. | Did not report N (or anything else). | n/a on this fixture (empty report). The product’s intended evidence is signature/JSDoc/code-block mismatch, which did not trigger here. | 0.052 s | Yes: first-party GitHub Action `pallaprolus/drift@v0`, CLI `--fail-on`, VS Code extension. |
| **Copilot `docs-sync-audit`** | Agent skill (`gh skills install github/awesome-copilot docs-sync-audit`). Needs a Copilot/agent host, not a local one-shot binary. | Not run. The skill *instructs* an agent to compare docs to code, optionally starting from a bundled `scripts/docs_drift.py` that checks `npm run` / `make` targets, relative Markdown links, and env names. Results would depend on the agent and are not deterministic CI output. | — | — | — | The skill accepts PR/branch scope (“audit docs for this PR”) but is not a `--base/--head` CLI. | — | The skill’s *instructions* demand path:line evidence; that is a prompt contract, not a measured run. | n/a | Not a standalone CI action. |

## 3. What this means for the wedge

### 3.1 The closest competitor is docsync, not the drift-named tools

docsync is a small project (1 star) but it is already a fast, zero-config, deterministic linter for the two most photogenic cases in this fixture: a removed npm script and a moved file, including `AGENTS.md`, with clear `file:line` evidence. On a naive full-repo scan it also flags case N, which is correct as repository hygiene and noisy as a PR comment.

Its `--baseline` / `--baseline-out` pair is the most important PR-adjacent feature we measured. After writing a baseline on `main` and re-running on `stale-docs`:

- summary became `critical: 5`, `suppressed: 3`;
- the three case-N findings disappeared;
- only the new A and B findings remained (`deploy:preview` and `src/lib/preview.js`).

That is **new-finding gating**, not **change-to-document traceability**. The report still does not say that `package.json` lost `deploy:preview` in this diff, or that `src/lib/preview.js` was renamed in this diff. Producing the baseline also needs a checkout (or worktree) of the base ref; there is no `docsync check --base main --head HEAD`.

### 3.2 Other tools do not close the same gap

- **doc-drift-guard** is the only other tool with a one-shot `--changed-only --base-ref` flag. On this fixture that mode missed the headline script case (A), kept pre-existing false positives on the README, and used a filename/stem heuristic (the stem `preview` is enough to pull in almost every page of this repo). Last push: 2026-03-10. 0 stars. Early alpha.
- **NickitaChe/docs-drift** is the only tool that cleanly caught case C (docs vs `.env.example`) and the renamed flag in case D, but only by executing a help command, only with a hand-written config, and with a high false-positive rate. It does not inspect `package.json` scripts or Markdown paths, and it is not PR-aware. The documented include pattern `docs/**/*.md` skipped every file directly under `docs/`.
- **pallaprolus/drift** is the most mature distribution story (4 stars, VS Code, npm, GitHub Action) and aims at a different problem: JSDoc/docstrings and fenced examples versus code signatures. It produced an empty report on this fixture, including the stale `buildPreview()` example.

### 3.3 Kill / pivot condition

The specification says: *if existing tools deliver equivalent change-to-document traceability with equal setup burden, do not create a lookalike.*

**The condition is not met, but the gap is narrower than “nobody lints stale README commands.”** A product that is only “scan the whole repo for missing scripts and paths” would be a lookalike of docsync and should not be built. The remaining concrete gap, demonstrated by this fixture, is:

1. A **single local command** of the form `scan --base <ref> --head <ref>` that does not require a pre-generated baseline file or a second checkout to be useful in a PR.
2. **Evidence that names both sides of the causal link:** the source fact that changed in the diff (for example `package.json#scripts` lost `deploy:preview`) and the exact documentation location that still claims it.
3. **Case N handling:** pre-existing stale references are omitted from the PR report (or clearly labeled as pre-existing), without forcing the user to maintain a baseline artifact. docsync can approximate this with `--baseline`; doc-lag should make it the default PR behavior.
4. **Docs → `.env.example` references** (case C), which none of the default docsync checks cover. NickitaChe covers it, but not in a PR-aware, low-noise, zero-config way.
5. Optional, later: explicit CLI-flag and route extractors (case D) that do not require executing help text and that do not depend on a framework the repository does not use.

That is enough to proceed with the MVP in the specification (RF-01–RF-04, RF-07–RF-12, plus the P0 path and `.env.example` rules), **provided the README and first GIF show a PR comment / `scan --base` report, not a generic repo lint.** If implementation slips into “another full-tree documentation linter,” the kill condition should be revisited, because docsync already does that part well.

## 4. Recommended next step

Keep this fixture as the first automated test repository for doc-lag (it was designed to be reusable). A first implementation bar:

- On `stale-docs` vs `main`, report A, B, and C as confirmed findings with diff evidence.
- Do not attribute case N to the PR scan.
- On `main` vs `main`, report nothing in PR mode (case N belongs only to `--all`).
- Do not execute commands found in documentation.

## 5. GitHub Copilot skill `docs-sync-audit` (not executed)

Source: [https://awesome-copilot.github.com/skill/docs-sync-audit/](https://awesome-copilot.github.com/skill/docs-sync-audit/) (fetched 2026-11-17).

The page describes a **read-only, agent-assisted** documentation audit. Installation is `gh skills install github/awesome-copilot docs-sync-audit`. The agent is told to accept PR/branch, feature, API, config, or whole-repo scope; to ground every finding in both the source of truth and the stale doc; and to separate confirmed drift from inferred gaps. When available, it should first run a bundled `scripts/docs_drift.py` that checks documented `npm run` scripts and `make` targets against those that exist, relative Markdown links against the filesystem, and environment variable names in both directions. The script “never judges prose.” The rest of the audit (wording, completeness, whether an explanation is correct) is left to the model.

This overlaps the *problem statement* of doc-lag, especially for script, path, and env claims, and it can be scoped to a PR in natural language. It is not a substitute for a deterministic, offline, no-account CLI or for a CI gate with stable exit codes. doc-lag should stay in that deterministic lane and can later be an input an agent consults, not an agent itself.

## Appendix A — NickitaChe glob follow-up

The tool’s documented include pattern `docs/**/*.md` is compiled to the regular expression `docs/.*/[^/]*\.md`, which requires a directory between `docs/` and the file name. In this fixture `docs/setup.md`, `docs/cli.md`, `docs/api.md`, and `docs/maintenance.md` were therefore **not** in `checkedFiles` (only `README.md` and `AGENTS.md` were).

A follow-up scan on `stale-docs` with `docs/*.md` added to `include` scanned all six Markdown files. Extra true positives: `--dry-run` also in `docs/cli.md`; `PREVIEW_SECRET` also in `docs/setup.md` and `docs/api.md`. Extra noise: `3000`, `json`, `text` reported as missing commands. Primary-table results still use the tool’s documented `docs/**/*.md` pattern, because that is what a user who copies the official template would run.

## Appendix B — docsync optional `api_routes`

A side run on `stale-docs` with `-config` pointing at an external YAML that enabled `api_routes` for `framework: express` and `framework: go` under `src/` produced `route_not_found` warnings for both `GET /api/preview` (stale) and `GET /health` (still implemented in `src/server.js`). The raw Node `http.createServer` handlers were not extracted, so the check could not tell a real stale route from a false positive. This is not counted as catching case D in the main table.

## Appendix C — Reproduce

```bash
# from /workspace/doc-lag-validation
scripts/create-fixture.sh
scripts/run-competitors.sh   # expects the clones and built binaries described above
```

Raw outputs: `raw-results/*.stdout`, `raw-results/*.report.json`, `raw-results/docsync-baseline.json`.
