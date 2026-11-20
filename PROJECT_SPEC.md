# doc-lag — Product & Engineering Specification

> **Status:** proposal / pre-release · **Version:** 0.1-draft · **Date:** 2026-11-17  
> **Language of this specification:** Portuguese (Brazil) · **Public repository copy:** English  
> **Goal:** ship a useful, local-first open-source tool and earn organic developer adoption.

## 0. Executive decision

**Working name:** **doc-lag** (`doc-lag` / `doc-lag`). **Not yet confirmed as available** on GitHub, npm/PyPI, domains or in trademark databases. Do not publish under this name until the naming gate is completed.

**Product one-liner:** Detect documentation that may be stale after a code change — with traceable evidence, not guesswork.

**Chosen wedge:** **PR-aware documentation impact** rather than another generic README linter. The CLI answers: **“Given this git diff, which documentation claims are now invalid or deserve review, and why?”**

**MVP:** completely local, deterministic rules, read-only, no LLM, no API key, no MCP requirement. Python and TypeScript/JavaScript repositories may be analyzed based on supported static manifests; no promise of complete language understanding. Later items delivered or in progress: optional Jev semantic ranking (opt-in), GitHub Action, MCP; GitHub Pages still later.

**Success criterion:** Demonstrate a differentiated, reproducible PR-related finding in real repositories versus existing tools; obtain evidence that developers want to use it again. Stars are a discovery signal, not proof of retention.

## 1. Why this project / the user problem

Code and docs evolve at different speeds. A pull request can rename a script, remove a route, change environment variables, move a file, or invalidate setup instructions. Reviewers typically inspect code diffs, not all documentation that depends on them.

**Target user (first):** open-source maintainer or developer reviewing TypeScript/JavaScript and Python projects; wants a precise, low-noise, local check before merging. **Second:** coding-agent users who want evidence about documentation impact. **Third:** CI maintainers and teams.

### Jobs to be done

1. From the current branch versus a base ref, find documentation *affected by the change*.
2. Point to exact source-of-truth and docs locations.
3. Distinguish **confirmed inconsistency** from **review suggestion**.
4. Provide a machine-readable result that a CI job or agent can consume.
5. Never execute arbitrary commands extracted from repository documentation during scanning.

### Non-goals (MVP)

- Auto-rewrite documentation; generate PRs; run doc code examples or shell commands.
- Claim semantic correctness for freeform prose or deep call-graph analysis.
- Support all languages, monorepo structures, or documentation generators from day one.
- Publish an autonomous agent or a generic Jev/MCP framework.
- Require cloud upload, registration, embeddings, LLM calls, or background services.

## 2. Naming, positioning and GitHub discovery

### Naming decision and risks

- **DocDrift** was our earlier codename, but overlapping projects and adjacent names make search and branding harder.
- Other trial names such as **DocTether**, **DocParity** and **ReadmeProof** were found in use during exploratory searches; avoid assuming uniqueness.
- **doc-lag** is a *working candidate*, not a reserved handle or trademark clearance. A quick indexed-web search did not establish a direct exact-name match, **but this is not proof of availability**.
- **Naming gate before first public release:** search GitHub repositories/users/orgs; npm and PyPI exact package names; domain and common social handles if desired; trademark search for relevant jurisdictions; check pronunciation and confusion with similarly named tools. If unavailable, select a new distinctive name **without changing the keywords in the positioning**.
- Do not promise SEO ranking. GitHub search can use name, description, topics and README; write accurate, natural language and avoid keyword stuffing.

### Draft GitHub repository metadata (English)

**Repository name:** `doc-lag` (pending availability)

**About / short description:**

> Catch stale documentation after code changes. A local-first CLI for PR-aware documentation drift detection, with evidence-backed findings and CI-ready reports.

**Tagline:** `Your code changed. Did your docs keep up?`

**Suggested GitHub topics at initial release:** `documentation`, `documentation-drift`, `developer-tools`, `cli`, `git-diff`, `static-analysis`, `markdown`, `typescript`, `python`, `open-source` (use only topics that accurately match implemented support).

**Future topics, only after shipping:** `github-actions`, `mcp`, `ai-agents`, `jev` (if implemented).

**Search intent coverage in README:** `outdated README`, `stale docs`, `documentation drift`, `docs as code`, `git diff documentation`, `documentation checker`, `AGENTS.md`.

### Value statement

**Not:** “We check that a file linked from README exists.”  
**Rather:** “Given a PR, we connect changed source-of-truth facts to the documentation that references them, separating demonstrably broken instructions from plausible review targets.”

### Competitive landscape (verify again before release)

| Comparable project | Known scope | Positioning test for doc-lag |
|---|---|---|
| `Dvorinka/docsync` | Verifies env vars, paths, commands, API routes and build pins | Must demonstrate PR-aware, evidence-linked prioritization beyond generic scan |
| `NickitaChe/docs-drift` | Checks commands, flags, env vars/config and CI workflows | Must outperform on *change-to-doc traceability*, not duplicate check coverage |
| `melonusers/doc-drift-guard` | Documentation drift scanning across code and docs | Evaluate overlap in language support and reporting |
| `pallaprolus/drift` | JSDoc/docstrings/README and VS Code/CI integrations | Avoid competing on editor features at MVP |
| GitHub Copilot `docs-sync-audit` skill | Agent-assisted read-only audit | Provide deterministic, offline evidence and CI integration |

**Kill / pivot condition:** If existing tools deliver equivalent change-to-document traceability with equal setup burden, do **not** create a lookalike. Narrow to a deeper problem (e.g., PR-targeted *claims graph*, AGENTS.md contract checks, provenance) or contribute upstream.

References (as researched 2026-11-17):
- https://github.com/Dvorinka/docsync
- https://github.com/NickitaChe/docs-drift
- https://github.com/melonusers/doc-drift-guard
- https://github.com/pallaprolus/drift
- https://awesome-copilot.github.com/skill/docs-sync-audit/
- https://docs.github.com/en/search-github/searching-on-github/searching-for-repositories
- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics

## 3. MVP workflows

### Workflow A — PR-aware scan

```bash
# illustrative command design — not implemented
npx doc-lag scan --base origin/main --head HEAD --format text
```

1. Read changed files and changed line ranges from Git.
2. Extract supported source facts in changed files (e.g., `package.json` script names, `.env.example` keys, file paths, optionally documented OpenAPI route declarations if available).
3. Scan relevant Markdown (`README.md`, `docs/**/*.md`, `AGENTS.md`, `CONTRIBUTING.md`) for claims/references.
4. Compare references with the post-change repository state; emit **confirmed** if check is decisive; otherwise **needs-review** with reason.
5. Link evidence: documentation file:line, source file:line and fact identifier; provide stable finding ID and suggested next step.
6. Return predictable exit code and JSON/text result.

### Workflow B — repository-wide baseline

```bash
npx doc-lag scan --all --format json
```

Runs bounded deterministic checks on supported facts, even without a diff. Useful for onboarding, but **less distinctive** than the PR workflow.

### Workflow C — individual finding

```text
DOC-001  CONFIRMED  docs/setup.md:42
Command `npm run deploy:preview` is documented but absent from package.json scripts.
Evidence: package.json#scripts · changed in this PR
Suggested action: update docs or restore the script.
```

This is an invented example, not an actual scan.

## 4. Functional requirements

Priorities: **P0 = first public MVP**, **P1 = next iteration**, **P2 = later research**.

| ID | Priority | Requirement | Acceptance condition |
|---|---|---|---|
| RF-01 | P0 | CLI with `scan`, `--help`, `--version` | Clear help and error messages; works without account/API key |
| RF-02 | P0 | Git diff mode (`--base`, optional `--head`) | Analyze changed paths/ranges; handle renamed/deleted paths; error clearly if ref is invalid |
| RF-03 | P0 | Markdown discovery with include/exclude globs | Detect README, docs and AGENTS.md; respect configurable exclusions |
| RF-04 | P0 | Detect stale npm/pnpm/yarn/bun script references | Missing script is reported only when an unambiguous script invocation is parsed |
| RF-05 | P0 | Detect broken local links and referenced file paths | Distinguish missing target from external URL; do not fetch external URLs |
| RF-06 | P0 | Check references to keys in `.env.example` and declared config manifests | Report only within supported syntax, with documented limitations |
| RF-07 | P0 | Connect changed source facts to docs references | At least one finding indicates the change that triggered review and two source locations where applicable |
| RF-08 | P0 | Classify `confirmed`, `needs-review`, `unknown` | Ambiguous statements must not be marked confirmed |
| RF-09 | P0 | Show evidence and suggested action | Every confirmed finding includes doc location + source-of-truth citation + reason |
| RF-10 | P0 | Text and JSON output | Stable, versioned JSON schema and legible terminal format |
| RF-11 | P0 | CI-friendly exit codes and `--fail-on` | Exit 0 no blocking findings; exit 1 per configured threshold; exit 2 for execution/config errors |
| RF-12 | P0 | Safe read-only mode by default | Tool never executes commands from Markdown, installs dependencies, or modifies scanned files |
| RF-13 | P0 | Inline ignore directives / config exclusions | Scoped suppressions require a reason and are documented in report |
| RF-14 | P1 | GitHub Actions template and PR summary | Example pipeline can comment or annotate without requiring a hosted backend |
| RF-14b | P1 | Optional docs-sync (`docs.missing`): flag new public surfaces / pairing-rule mismatches without matching docs | Off by default; enable via `docsSync` / `--docs-sync`; findings are `needs-review` unless `enforce`; report may include `docsSync`, `surface`, `enforced` |
| RF-15 | P1 | Check OpenAPI routes and CLI flags, where explicit source-of-truth exists | Rule works with fixtures and reports unsupported frameworks as unsupported |
| RF-16 | P1 | Incremental cache | Same revision can be analyzed without redundant parsing; invalidation is correct |
| RF-17 | P1 | SARIF output | Valid SARIF passes a schema validator; links resolve to source |
| RF-18 | P1 | Agent-consumable MCP read-only adapter | Exposes `scan_diff`, `get_finding`, `explain_impact`; no write tools |
| RF-19 | P2 | Semantic candidate ranking using Jev or other providers | Benchmarked against lexical/rule baseline and optional; never upgrades a guess to confirmed |
| RF-20 | P2 | Safe patch suggestions | Preview-only changes with tests, explicit user review; no autonomous modifications |

### Priority clarification

**P0 is not “all conceivable docs problems.”** Build only 3 deterministic rule families first (scripts, local links/paths, `.env.example` references). Expand only when measurements justify it.

## 5. Non-functional requirements

| ID | Category | Requirement / target |
|---|---|---|
| RNF-01 | Privacy | Local files never leave the machine in the default mode; no telemetry by default |
| RNF-02 | Security | No execution of repository-provided shell commands, scripts or untrusted code |
| RNF-03 | Filesystem safety | Follow symlinks only inside repo root or ignore them; prevent path traversal beyond root |
| RNF-04 | Predictability | Same code, refs and config produce identical canonical JSON findings |
| RNF-05 | Precision | Target **≥95% precision** on a *curated, published MVP fixture set* for `confirmed` findings; disclose dataset limitations |
| RNF-06 | Performance | Initial target **≤5 s p95** on an agreed representative repo (e.g., ≤2k Markdown/source files) on documented hardware; benchmark, do not claim upfront |
| RNF-07 | Scalability | Cap file size, number of scanned files, diff size and execution time; explain skipped items |
| RNF-08 | Portability | Support active LTS Node.js versions; Linux/macOS/Windows in CI (exact support matrix at release) |
| RNF-09 | Usability | First meaningful finding with one command and no signup; helpful failure messages |
| RNF-10 | Extensibility | Separate extractors, rules, reporters and provider adapters; internal APIs versioned only when stabilized |
| RNF-11 | Observability | Optional diagnostic logs with no content leakage by default; `--verbose` for local debugging |
| RNF-12 | Testability | Unit, fixture, integration and snapshot tests; stable reproduction for each bug |
| RNF-13 | CI compatibility | Stable exit codes and machine-readable output; no unsolicited network access |
| RNF-14 | Accessibility | Text results include full severity/status, never color alone; `--no-color` |
| RNF-15 | Licensing | Choose permissive license (e.g. Apache-2.0 or MIT), include security policy and contribution guide |
| RNF-16 | Documentation integrity | README examples are executable/tested in release automation; feature claims match released code |

## 6. Evidence model and JSON contract (proposed)

```json
{
  "schemaVersion": "1.0",
  "tool": "doc-lag",
  "mode": "diff",
  "base": "origin/main",
  "head": "HEAD",
  "findings": [
    {
      "id": "doc-001",
      "ruleId": "scripts.missing",
      "status": "confirmed",
      "severity": "warning",
      "message": "README references a package script missing from the current manifest",
      "documentation": {"path": "README.md", "line": 42},
      "evidence": [{"path": "package.json", "pointer": "/scripts"}],
      "change": {"path": "package.json", "kind": "modified"},
      "suggestion": "Update the documented command or restore the script"
    }
  ],
  "summary": {"confirmed": 1, "needsReview": 0, "unknown": 0},
  "docsSync": {
    "status": "ran",
    "enforced": false,
    "effectiveBase": "abc123",
    "detectors": ["action.input", "cli.flag"],
    "rulesEvaluated": 1,
    "candidateFiles": 3,
    "newSurfaces": 1,
    "findings": 1,
    "omitted": 0,
    "warnings": []
  }
}
```

Additive finding fields for `docs.missing` (optional; `schemaVersion` stays `1.0`):

- `surface`: `{ kind, name, sourcePath }` for detector findings
- `enforced`: `true` when `docsSync.enforce` is on for that finding

**Important:** the above describes the shipped JSON contract shape. Stable IDs are content-derived rather than sequential; `doc-001` is pedagogical only. For status `needs-review`, list evidence and uncertainty, not a fabricated confidence score. `report.docsSync` is absent when docs-sync is disabled so default reports stay byte-identical.

## 7. Proposed architecture and tooling

**Recommended initial stack:** TypeScript + Node.js for CLI and parsers; direct access to `package.json` and Git; library plus CLI published to npm. The original team's Python/FastAPI experience can inform Python-specific extractors later. No need for FastAPI, React or a hosted backend in MVP.

```text
src/
  cli/              # commands, args, exit codes
  core/             # diff, paths, manifests, scan orchestration
  extractors/       # markdown links/commands, JSON manifest, dotenv
  rules/            # deterministic checks
  findings/         # provenance, normalization, classification
  reporters/        # text, JSON (SARIF in P1)
  config/           # inclusions, exclusions, ignore rules
  adapters/         # future GitHub Action / MCP / semantic ranking
fixtures/
  scripts-removed/
  broken-links/
  env-renamed/
  unaffected-docs/
  noisy-monorepo/
benchmarks/
  fixtures-manifest.json
```

**Pipeline:** git diff → changed facts → docs reference extraction → rule evaluation → optional docs-sync (`docs.missing`) → evidence normalizer → structured results → CLI/CI/MCP adapters. Config autocomplete schema: `schema/doc-lag.config.schema.json`.

**Trust boundaries:** treat repository content as untrusted data; never let comments, docs or agent instructions override scan rules; no code execution; isolate path resolution within workspace.

## 8. Jev integration — optional semantic ranking (shipped as opt-in)

**Question:** Can a decision model rank *which paragraphs/docs deserve review* better than simple lexical ranking or graph adjacency?

**Decision (go):** A private PoC (`jev-poc`) benchmarked Jev `score` ranking of doc paragraphs vs a PR diff on **43 public PRs from 13 open-source projects**: nDCG@3 Jev **0.86** vs path-overlap **0.73** vs BM25 **0.62**; P@2 **0.96** vs **0.88** vs **0.72**; ~US$0.007 total and ~0.4s per case. Inclusion in OSS projects is for evaluation only — not an endorsement.

### Shipped behavior in doc-lag

- **Strictly opt-in:** CLI `--rank jev` (or `DOC_LAG_RANK=jev`), Action input `rank: jev`, MCP `scan_diff.rank: "jev"`. Default remains offline, deterministic, and byte-identical (no network).
- **Ordering only:** Jev reorders `needs-review` / `unknown` findings for human review. It **never** changes `status` and never upgrades anything to `confirmed`.
- **API (verified live):** `POST https://api.typesafe.ai/v1/systemone`, `Authorization: Bearer $TYPESAFE_API_KEY`, body `{ model, state, questions }` with `questions` as an **object** keyed by id. Score question uses `instructions` + ordered named `criteria` situations (`not_relevant`, `marginally_relevant`, `highly_relevant`). State includes `pr_diff_summary` and `doc_excerpt`. Model pinned to `jev-1.14.0`. Cost from `usage.input_tokens` at $0.042/Mtok (output free).
- **Privacy:** When enabled, print a clear notice that diff summaries and doc excerpts go to a third-party API. Key only from `TYPESAFE_API_KEY`; never log/print Authorization headers (redaction).
- **Missing key:** clear error (exit 2) when Jev is requested without `TYPESAFE_API_KEY`.
- **Runtime failures:** timeouts, 4xx/5xx, and rate limits degrade gracefully to deterministic order with a warning and `report.ranking.warning`.
- **Bounds:** cap candidates scored per scan and truncate diff/doc text sizes; report token usage and estimated cost when applied.
- **Evidence:** score/confidence attached as extra finding evidence (`jev#relevance`) and optional `finding.ranking` / `report.ranking` fields (additive; `schemaVersion` stays `1.0`).

## 9. Milestones and implementation issues

### Gate 0 — 1–2 days: validate differentiation and name

- [ ] Search exact name on GitHub, npm, PyPI and trademark databases.
- [ ] Run 3 competitors on 2 repositories with historical documentation-related PRs.
- [ ] Write down one demonstrable gap + example fixture that existing tools miss.
- [ ] If no gap, pivot or contribute upstream; do not start a lookalike.

### Week 1 — vertical slice

- [ ] Set up TypeScript CLI, tests, fixtures and Git integration.
- [ ] Implement `--base/--head` and Markdown discovery.
- [ ] Extract changed package scripts and documented run-script references.
- [ ] Implement first end-to-end finding with evidence and text/JSON output.

### Week 2 — reliable MVP

- [ ] Local links/paths and `.env.example` rules.
- [ ] Ignore configuration, statuses, exit codes, symlink/path safety.
- [ ] Test across three repositories; measure precision, false positives and runtime.
- [ ] Draft README demo, install instructions, examples and limitations.

### Weeks 3–4 — distribution (after core passes benchmarks)

- [ ] GitHub Actions example (P1).
- [ ] Publish npm release with provenance, version tag, changelog.
- [ ] Open initial issues, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT (if appropriate).
- [ ] Demo GIF showing a real pull request causing a documentation finding.
- [ ] Collect feedback; prioritize requested rules rather than speculative features.

### Later (not a launch blocker)

- [ ] MCP read-only adapter.
- [x] Optional Jev semantic ranking (`--rank jev` / Action / MCP); ordering only.
- [ ] GitHub Pages: benchmark/results, docs, playground only if it converts users to installation.

## 10. Acceptance scenarios

**AC-01: removed script**  
Given `package.json` removes `deploy:preview` and README says `npm run deploy:preview`, when scanning diff, tool emits 1 `confirmed` finding with README line and package manifest provenance; exit code follows config.

**AC-02: unchanged docs no false positive**  
Given a changed script unrelated to any documented commands, when scanning diff, it emits no `confirmed` stale-script findings.

**AC-03: broken relative link**  
Given a docs link points to a file removed in the diff and no replacement exists, emit a confirmed finding at docs link location.

**AC-04: ambiguous natural-language description**  
Given prose vaguely mentions a renamed feature but no extractable fact proves it wrong, do not mark it confirmed; at most `needs-review` if heuristics support it.

**AC-05: read-only security**  
Given a README code block with destructive shell commands, tool parses as text but never executes it or writes files.

**AC-06: unsupported syntax**  
Given an unsupported monorepo manifest convention, scanner logs a bounded skip reason and does not assert absence of a command.

## 11. Organic distribution plan

### Release checklist

- [ ] Name checked and claimed; no confusion with major existing project.
- [ ] README in English: 1-sentence value prop, 20-second before/after, installation, demo, examples, limitations, comparison, contribution path.
- [ ] GitHub About text and truthful topics.
- [ ] Reproducible benchmark fixtures and public evaluation methodology.
- [ ] One-line local installation and quickstart (verify commands against published package).
- [ ] 2–3 public example PRs with direct evidence of usefulness.
- [ ] Publish to relevant developer communities transparently, no star exchanges, bots or manufactured engagement.

### Metrics (first 30 days post-release)

**North star:** count of non-author repositories/workflows that use tool repeatedly, verified by voluntary feedback or public usage signals. **Secondary:** unique installations/downloads (noisy), GitHub stars, issues from non-maintainers, repeat contributors, conversion of demo viewers to installation where measurable without invasive tracking.

**Qualification:** user can reproduce a meaningful finding and wants to keep the check in their workflow; avoid using star count alone to define success.

### Public roadmap / future GitHub Pages

A future site may contain: installation, interactive sample diff-to-doc report, benchmarks against baselines, rules registry, integrations, and privacy/security statement. **Do not prioritize the site before validating a useful CLI**.

## 12. Open decisions before implementation

1. Final public name (doc-lag is a working name; reserve exact package and handle).
2. Start TypeScript-only manifests, or include Python `.env.example` and Markdown immediately? **Recommendation:** start TS manifests plus universal path/link rules; add Python-specific extractors later.
3. Git diff semantics: include uncommitted working-tree changes? **Recommendation:** explicit `--working-tree` in P1, avoid ambiguous default.
4. How strict should `--fail-on` be by default? **Recommendation:** only confirmed findings block CI; advisory suggestions never block by default.
5. License (MIT vs Apache-2.0), owner/organization and contribution governance.
6. Which two public repos and one synthetic fixture repo serve as honest comparisons?

## 13. Cursor kickoff prompt (paste into your coding agent)

> Implement doc-lag from `PROJECT_SPEC.md`. Start with **Gate 0**: inspect listed competitors and identify a concrete differentiating fixture; do not code before writing the competitive gap in `docs/validation.md`. Then implement **only RF-01 through RF-03, RF-04, RF-07 through RF-12** for a TypeScript CLI, with fixtures and tests. Keep the tool fully local and read-only; never execute commands found in repository docs. Use a clear, versioned JSON report; return deterministic results and documented exit codes. Do **not** implement Jev, MCP, cloud service, GitHub Pages, UI or automatic file modifications. Document every limitation, provide exact commands to run tests and a demonstrable before/after PR fixture. Avoid making unsupported marketing claims.

---

**Scope control:** A crisp, tested, PR-aware difference is better than a huge rules catalog that duplicates existing projects.  
**Status:** specification only; no application code is claimed to exist.
