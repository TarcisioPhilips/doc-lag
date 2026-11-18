     1|# doc-lag — Product & Engineering Specification
     2|
     3|> **Status:** proposal / pre-release · **Version:** 0.1-draft · **Date:** 2026-11-17  
     4|> **Language of this specification:** Portuguese (Brazil) · **Public repository copy:** English  
     5|> **Goal:** ship a useful, local-first open-source tool and earn organic developer adoption.
     6|
     7|## 0. Executive decision
     8|
     9|**Working name:** **doc-lag** (`doc-lag` / `doc-lag`). **Not yet confirmed as available** on GitHub, npm/PyPI, domains or in trademark databases. Do not publish under this name until the naming gate is completed.
    10|
    11|**Product one-liner:** Detect documentation that may be stale after a code change — with traceable evidence, not guesswork.
    12|
    13|**Chosen wedge:** **PR-aware documentation impact** rather than another generic README linter. The CLI answers: **“Given this git diff, which documentation claims are now invalid or deserve review, and why?”**
    14|
    15|**MVP:** completely local, deterministic rules, read-only, no LLM, no API key, no MCP requirement. Python and TypeScript/JavaScript repositories may be analyzed based on supported static manifests; no promise of complete language understanding. Later items delivered or in progress: optional Jev semantic ranking (opt-in), GitHub Action, MCP; GitHub Pages still later.
    16|
    17|**Success criterion:** Demonstrate a differentiated, reproducible PR-related finding in real repositories versus existing tools; obtain evidence that developers want to use it again. Stars are a discovery signal, not proof of retention.
    18|
    19|## 1. Why this project / the user problem
    20|
    21|Code and docs evolve at different speeds. A pull request can rename a script, remove a route, change environment variables, move a file, or invalidate setup instructions. Reviewers typically inspect code diffs, not all documentation that depends on them.
    22|
    23|**Target user (first):** open-source maintainer or developer reviewing TypeScript/JavaScript and Python projects; wants a precise, low-noise, local check before merging. **Second:** coding-agent users who want evidence about documentation impact. **Third:** CI maintainers and teams.
    24|
    25|### Jobs to be done
    26|
    27|1. From the current branch versus a base ref, find documentation *affected by the change*.
    28|2. Point to exact source-of-truth and docs locations.
    29|3. Distinguish **confirmed inconsistency** from **review suggestion**.
    30|4. Provide a machine-readable result that a CI job or agent can consume.
    31|5. Never execute arbitrary commands extracted from repository documentation during scanning.
    32|
    33|### Non-goals (MVP)
    34|
    35|- Auto-rewrite documentation; generate PRs; run doc code examples or shell commands.
    36|- Claim semantic correctness for freeform prose or deep call-graph analysis.
    37|- Support all languages, monorepo structures, or documentation generators from day one.
    38|- Publish an autonomous agent or a generic Jev/MCP framework.
    39|- Require cloud upload, registration, embeddings, LLM calls, or background services.
    40|
    41|## 2. Naming, positioning and GitHub discovery
    42|
    43|### Naming decision and risks
    44|
    45|- **DocDrift** was our earlier codename, but overlapping projects and adjacent names make search and branding harder.
    46|- Other trial names such as **DocTether**, **DocParity** and **ReadmeProof** were found in use during exploratory searches; avoid assuming uniqueness.
    47|- **doc-lag** is a *working candidate*, not a reserved handle or trademark clearance. A quick indexed-web search did not establish a direct exact-name match, **but this is not proof of availability**.
    48|- **Naming gate before first public release:** search GitHub repositories/users/orgs; npm and PyPI exact package names; domain and common social handles if desired; trademark search for relevant jurisdictions; check pronunciation and confusion with similarly named tools. If unavailable, select a new distinctive name **without changing the keywords in the positioning**.
    49|- Do not promise SEO ranking. GitHub search can use name, description, topics and README; write accurate, natural language and avoid keyword stuffing.
    50|
    51|### Draft GitHub repository metadata (English)
    52|
    53|**Repository name:** `doc-lag` (pending availability)
    54|
    55|**About / short description:**
    56|
    57|> Catch stale documentation after code changes. A local-first CLI for PR-aware documentation drift detection, with evidence-backed findings and CI-ready reports.
    58|
    59|**Tagline:** `Your code changed. Did your docs keep up?`
    60|
    61|**Suggested GitHub topics at initial release:** `documentation`, `documentation-drift`, `developer-tools`, `cli`, `git-diff`, `static-analysis`, `markdown`, `typescript`, `python`, `open-source` (use only topics that accurately match implemented support).
    62|
    63|**Future topics, only after shipping:** `github-actions`, `mcp`, `ai-agents`, `jev` (if implemented).
    64|
    65|**Search intent coverage in README:** `outdated README`, `stale docs`, `documentation drift`, `docs as code`, `git diff documentation`, `documentation checker`, `AGENTS.md`.
    66|
    67|### Value statement
    68|
    69|**Not:** “We check that a file linked from README exists.”  
    70|**Rather:** “Given a PR, we connect changed source-of-truth facts to the documentation that references them, separating demonstrably broken instructions from plausible review targets.”
    71|
    72|### Competitive landscape (verify again before release)
    73|
    74|| Comparable project | Known scope | Positioning test for doc-lag |
    75||---|---|---|
    76|| `Dvorinka/docsync` | Verifies env vars, paths, commands, API routes and build pins | Must demonstrate PR-aware, evidence-linked prioritization beyond generic scan |
    77|| `NickitaChe/docs-drift` | Checks commands, flags, env vars/config and CI workflows | Must outperform on *change-to-doc traceability*, not duplicate check coverage |
    78|| `melonusers/doc-drift-guard` | Documentation drift scanning across code and docs | Evaluate overlap in language support and reporting |
    79|| `pallaprolus/drift` | JSDoc/docstrings/README and VS Code/CI integrations | Avoid competing on editor features at MVP |
    80|| GitHub Copilot `docs-sync-audit` skill | Agent-assisted read-only audit | Provide deterministic, offline evidence and CI integration |
    81|
    82|**Kill / pivot condition:** If existing tools deliver equivalent change-to-document traceability with equal setup burden, do **not** create a lookalike. Narrow to a deeper problem (e.g., PR-targeted *claims graph*, AGENTS.md contract checks, provenance) or contribute upstream.
    83|
    84|References (as researched 2026-11-17):
    85|- https://github.com/Dvorinka/docsync
    86|- https://github.com/NickitaChe/docs-drift
    87|- https://github.com/melonusers/doc-drift-guard
    88|- https://github.com/pallaprolus/drift
    89|- https://awesome-copilot.github.com/skill/docs-sync-audit/
    90|- https://docs.github.com/en/search-github/searching-on-github/searching-for-repositories
    91|- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics
    92|
    93|## 3. MVP workflows
    94|
    95|### Workflow A — PR-aware scan
    96|
    97|```bash
    98|# illustrative command design — not implemented
    99|npx doc-lag scan --base origin/main --head HEAD --format text
   100|```
   101|
   102|1. Read changed files and changed line ranges from Git.
   103|2. Extract supported source facts in changed files (e.g., `package.json` script names, `.env.example` keys, file paths, optionally documented OpenAPI route declarations if available).
   104|3. Scan relevant Markdown (`README.md`, `docs/**/*.md`, `AGENTS.md`, `CONTRIBUTING.md`) for claims/references.
   105|4. Compare references with the post-change repository state; emit **confirmed** if check is decisive; otherwise **needs-review** with reason.
   106|5. Link evidence: documentation file:line, source file:line and fact identifier; provide stable finding ID and suggested next step.
   107|6. Return predictable exit code and JSON/text result.
   108|
   109|### Workflow B — repository-wide baseline
   110|
   111|```bash
   112|npx doc-lag scan --all --format json
   113|```
   114|
   115|Runs bounded deterministic checks on supported facts, even without a diff. Useful for onboarding, but **less distinctive** than the PR workflow.
   116|
   117|### Workflow C — individual finding
   118|
   119|```text
   120|DOC-001  CONFIRMED  docs/setup.md:42
   121|Command `npm run deploy:preview` is documented but absent from package.json scripts.
   122|Evidence: package.json#scripts · changed in this PR
   123|Suggested action: update docs or restore the script.
   124|```
   125|
   126|This is an invented example, not an actual scan.
   127|
   128|## 4. Functional requirements
   129|
   130|Priorities: **P0 = first public MVP**, **P1 = next iteration**, **P2 = later research**.
   131|
   132|| ID | Priority | Requirement | Acceptance condition |
   133||---|---|---|---|
   134|| RF-01 | P0 | CLI with `scan`, `--help`, `--version` | Clear help and error messages; works without account/API key |
   135|| RF-02 | P0 | Git diff mode (`--base`, optional `--head`) | Analyze changed paths/ranges; handle renamed/deleted paths; error clearly if ref is invalid |
   136|| RF-03 | P0 | Markdown discovery with include/exclude globs | Detect README, docs and AGENTS.md; respect configurable exclusions |
   137|| RF-04 | P0 | Detect stale npm/pnpm/yarn/bun script references | Missing script is reported only when an unambiguous script invocation is parsed |
   138|| RF-05 | P0 | Detect broken local links and referenced file paths | Distinguish missing target from external URL; do not fetch external URLs |
   139|| RF-06 | P0 | Check references to keys in `.env.example` and declared config manifests | Report only within supported syntax, with documented limitations |
   140|| RF-07 | P0 | Connect changed source facts to docs references | At least one finding indicates the change that triggered review and two source locations where applicable |
   141|| RF-08 | P0 | Classify `confirmed`, `needs-review`, `unknown` | Ambiguous statements must not be marked confirmed |
   142|| RF-09 | P0 | Show evidence and suggested action | Every confirmed finding includes doc location + source-of-truth citation + reason |
   143|| RF-10 | P0 | Text and JSON output | Stable, versioned JSON schema and legible terminal format |
   144|| RF-11 | P0 | CI-friendly exit codes and `--fail-on` | Exit 0 no blocking findings; exit 1 per configured threshold; exit 2 for execution/config errors |
   145|| RF-12 | P0 | Safe read-only mode by default | Tool never executes commands from Markdown, installs dependencies, or modifies scanned files |
   146|| RF-13 | P0 | Inline ignore directives / config exclusions | Scoped suppressions require a reason and are documented in report |
   147|| RF-14 | P1 | GitHub Actions template and PR summary | Example pipeline can comment or annotate without requiring a hosted backend |
   148|| RF-15 | P1 | Check OpenAPI routes and CLI flags, where explicit source-of-truth exists | Rule works with fixtures and reports unsupported frameworks as unsupported |
   149|| RF-16 | P1 | Incremental cache | Same revision can be analyzed without redundant parsing; invalidation is correct |
   150|| RF-17 | P1 | SARIF output | Valid SARIF passes a schema validator; links resolve to source |
   151|| RF-18 | P1 | Agent-consumable MCP read-only adapter | Exposes `scan_diff`, `get_finding`, `explain_impact`; no write tools |
   152|| RF-19 | P2 | Semantic candidate ranking using Jev or other providers | Benchmarked against lexical/rule baseline and optional; never upgrades a guess to confirmed |
   153|| RF-20 | P2 | Safe patch suggestions | Preview-only changes with tests, explicit user review; no autonomous modifications |
   154|
   155|### Priority clarification
   156|
   157|**P0 is not “all conceivable docs problems.”** Build only 3 deterministic rule families first (scripts, local links/paths, `.env.example` references). Expand only when measurements justify it.
   158|
   159|## 5. Non-functional requirements
   160|
   161|| ID | Category | Requirement / target |
   162||---|---|---|
   163|| RNF-01 | Privacy | Local files never leave the machine in the default mode; no telemetry by default |
   164|| RNF-02 | Security | No execution of repository-provided shell commands, scripts or untrusted code |
   165|| RNF-03 | Filesystem safety | Follow symlinks only inside repo root or ignore them; prevent path traversal beyond root |
   166|| RNF-04 | Predictability | Same code, refs and config produce identical canonical JSON findings |
   167|| RNF-05 | Precision | Target **≥95% precision** on a *curated, published MVP fixture set* for `confirmed` findings; disclose dataset limitations |
   168|| RNF-06 | Performance | Initial target **≤5 s p95** on an agreed representative repo (e.g., ≤2k Markdown/source files) on documented hardware; benchmark, do not claim upfront |
   169|| RNF-07 | Scalability | Cap file size, number of scanned files, diff size and execution time; explain skipped items |
   170|| RNF-08 | Portability | Support active LTS Node.js versions; Linux/macOS/Windows in CI (exact support matrix at release) |
   171|| RNF-09 | Usability | First meaningful finding with one command and no signup; helpful failure messages |
   172|| RNF-10 | Extensibility | Separate extractors, rules, reporters and provider adapters; internal APIs versioned only when stabilized |
   173|| RNF-11 | Observability | Optional diagnostic logs with no content leakage by default; `--verbose` for local debugging |
   174|| RNF-12 | Testability | Unit, fixture, integration and snapshot tests; stable reproduction for each bug |
   175|| RNF-13 | CI compatibility | Stable exit codes and machine-readable output; no unsolicited network access |
   176|| RNF-14 | Accessibility | Text results include full severity/status, never color alone; `--no-color` |
   177|| RNF-15 | Licensing | Choose permissive license (e.g. Apache-2.0 or MIT), include security policy and contribution guide |
   178|| RNF-16 | Documentation integrity | README examples are executable/tested in release automation; feature claims match released code |
   179|
   180|## 6. Evidence model and JSON contract (proposed)
   181|
   182|```json
   183|{
   184|  "schemaVersion": "1.0",
   185|  "tool": "doc-lag",
   186|  "mode": "diff",
   187|  "base": "origin/main",
   188|  "head": "HEAD",
   189|  "findings": [
   190|    {
   191|      "id": "doc-001",
   192|      "ruleId": "scripts.missing",
   193|      "status": "confirmed",
   194|      "severity": "warning",
   195|      "message": "README references a package script missing from the current manifest",
   196|      "documentation": {"path": "README.md", "line": 42},
   197|      "evidence": [{"path": "package.json", "pointer": "/scripts"}],
   198|      "change": {"path": "package.json", "kind": "modified"},
   199|      "suggestion": "Update the documented command or restore the script"
   200|    }
   201|  ],
   202|  "summary": {"confirmed": 1, "needsReview": 0, "unknown": 0}
   203|}
   204|```
   205|
   206|**Important:** the above describes an API *to implement*, not an existing feature. Stable IDs should be content-derived rather than sequential; `doc-001` is pedagogical only. For status `needs-review`, list evidence and uncertainty, not a fabricated confidence score.
   207|
   208|## 7. Proposed architecture and tooling
   209|
   210|**Recommended initial stack:** TypeScript + Node.js for CLI and parsers; direct access to `package.json` and Git; library plus CLI published to npm. The original team's Python/FastAPI experience can inform Python-specific extractors later. No need for FastAPI, React or a hosted backend in MVP.
   211|
   212|```text
   213|src/
   214|  cli/              # commands, args, exit codes
   215|  core/             # diff, paths, manifests, scan orchestration
   216|  extractors/       # markdown links/commands, JSON manifest, dotenv
   217|  rules/            # deterministic checks
   218|  findings/         # provenance, normalization, classification
   219|  reporters/        # text, JSON (SARIF in P1)
   220|  config/           # inclusions, exclusions, ignore rules
   221|  adapters/         # future GitHub Action / MCP / semantic ranking
   222|fixtures/
   223|  scripts-removed/
   224|  broken-links/
   225|  env-renamed/
   226|  unaffected-docs/
   227|  noisy-monorepo/
   228|benchmarks/
   229|  fixtures-manifest.json
   230|```
   231|
   232|**Pipeline:** git diff → changed facts → docs reference extraction → rule evaluation → evidence normalizer → structured results → CLI/CI/MCP adapters.
   233|
   234|**Trust boundaries:** treat repository content as untrusted data; never let comments, docs or agent instructions override scan rules; no code execution; isolate path resolution within workspace.
   235|
   236|## 8. Jev integration — optional semantic ranking (shipped as opt-in)
   237|
   238|**Question:** Can a decision model rank *which paragraphs/docs deserve review* better than simple lexical ranking or graph adjacency?
   239|
   240|**Decision (go):** A private PoC (`jev-poc`) benchmarked Jev `score` ranking of doc paragraphs vs a PR diff on **43 public PRs from 13 open-source projects**: nDCG@3 Jev **0.86** vs path-overlap **0.73** vs BM25 **0.62**; P@2 **0.96** vs **0.88** vs **0.72**; ~US$0.007 total and ~0.4s per case. Inclusion in OSS projects is for evaluation only — not an endorsement.
   241|
   242|### Shipped behavior in doc-lag
   243|
   244|- **Strictly opt-in:** CLI `--rank jev` (or `DOC_LAG_RANK=jev`), Action input `rank: jev`, MCP `scan_diff.rank: "jev"`. Default remains offline, deterministic, and byte-identical (no network).
   245|- **Ordering only:** Jev reorders `needs-review` / `unknown` findings for human review. It **never** changes `status` and never upgrades anything to `confirmed`.
   246|- **API (verified live):** `POST https://api.typesafe.ai/v1/systemone`, `Authorization: Bearer $TYPESAFE_API_KEY`, body `{ model, state, questions }` with `questions` as an **object** keyed by id. Score question uses `instructions` + ordered named `criteria` situations (`not_relevant`, `marginally_relevant`, `highly_relevant`). State includes `pr_diff_summary` and `doc_excerpt`. Model pinned to `jev-1.14.0`. Cost from `usage.input_tokens` at $0.042/Mtok (output free).
   247|- **Privacy:** When enabled, print a clear notice that diff summaries and doc excerpts go to a third-party API. Key only from `TYPESAFE_API_KEY`; never log/print Authorization headers (redaction).
   248|- **Missing key:** clear error (exit 2) when Jev is requested without `TYPESAFE_API_KEY`.
   249|- **Runtime failures:** timeouts, 4xx/5xx, and rate limits degrade gracefully to deterministic order with a warning and `report.ranking.warning`.
   250|- **Bounds:** cap candidates scored per scan and truncate diff/doc text sizes; report token usage and estimated cost when applied.
   251|- **Evidence:** score/confidence attached as extra finding evidence (`jev#relevance`) and optional `finding.ranking` / `report.ranking` fields (additive; `schemaVersion` stays `1.0`).
   252|
   247|## 9. Milestones and implementation issues
   248|
   249|### Gate 0 — 1–2 days: validate differentiation and name
   250|
   251|- [ ] Search exact name on GitHub, npm, PyPI and trademark databases.
   252|- [ ] Run 3 competitors on 2 repositories with historical documentation-related PRs.
   253|- [ ] Write down one demonstrable gap + example fixture that existing tools miss.
   254|- [ ] If no gap, pivot or contribute upstream; do not start a lookalike.
   255|
   256|### Week 1 — vertical slice
   257|
   258|- [ ] Set up TypeScript CLI, tests, fixtures and Git integration.
   259|- [ ] Implement `--base/--head` and Markdown discovery.
   260|- [ ] Extract changed package scripts and documented run-script references.
   261|- [ ] Implement first end-to-end finding with evidence and text/JSON output.
   262|
   263|### Week 2 — reliable MVP
   264|
   265|- [ ] Local links/paths and `.env.example` rules.
   266|- [ ] Ignore configuration, statuses, exit codes, symlink/path safety.
   267|- [ ] Test across three repositories; measure precision, false positives and runtime.
   268|- [ ] Draft README demo, install instructions, examples and limitations.
   269|
   270|### Weeks 3–4 — distribution (after core passes benchmarks)
   271|
   272|- [ ] GitHub Actions example (P1).
   273|- [ ] Publish npm release with provenance, version tag, changelog.
   274|- [ ] Open initial issues, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT (if appropriate).
   275|- [ ] Demo GIF showing a real pull request causing a documentation finding.
   276|- [ ] Collect feedback; prioritize requested rules rather than speculative features.
   277|
   278|### Later (not a launch blocker)
   279|
   280|- [ ] MCP read-only adapter.
   281|- [x] Optional Jev semantic ranking (`--rank jev` / Action / MCP); ordering only.
   282|- [ ] GitHub Pages: benchmark/results, docs, playground only if it converts users to installation.
   283|
   284|## 10. Acceptance scenarios
   285|
   286|**AC-01: removed script**  
   287|Given `package.json` removes `deploy:preview` and README says `npm run deploy:preview`, when scanning diff, tool emits 1 `confirmed` finding with README line and package manifest provenance; exit code follows config.
   288|
   289|**AC-02: unchanged docs no false positive**  
   290|Given a changed script unrelated to any documented commands, when scanning diff, it emits no `confirmed` stale-script findings.
   291|
   292|**AC-03: broken relative link**  
   293|Given a docs link points to a file removed in the diff and no replacement exists, emit a confirmed finding at docs link location.
   294|
   295|**AC-04: ambiguous natural-language description**  
   296|Given prose vaguely mentions a renamed feature but no extractable fact proves it wrong, do not mark it confirmed; at most `needs-review` if heuristics support it.
   297|
   298|**AC-05: read-only security**  
   299|Given a README code block with destructive shell commands, tool parses as text but never executes it or writes files.
   300|
   301|**AC-06: unsupported syntax**  
   302|Given an unsupported monorepo manifest convention, scanner logs a bounded skip reason and does not assert absence of a command.
   303|
   304|## 11. Organic distribution plan
   305|
   306|### Release checklist
   307|
   308|- [ ] Name checked and claimed; no confusion with major existing project.
   309|- [ ] README in English: 1-sentence value prop, 20-second before/after, installation, demo, examples, limitations, comparison, contribution path.
   310|- [ ] GitHub About text and truthful topics.
   311|- [ ] Reproducible benchmark fixtures and public evaluation methodology.
   312|- [ ] One-line local installation and quickstart (verify commands against published package).
   313|- [ ] 2–3 public example PRs with direct evidence of usefulness.
   314|- [ ] Publish to relevant developer communities transparently, no star exchanges, bots or manufactured engagement.
   315|
   316|### Metrics (first 30 days post-release)
   317|
   318|**North star:** count of non-author repositories/workflows that use tool repeatedly, verified by voluntary feedback or public usage signals. **Secondary:** unique installations/downloads (noisy), GitHub stars, issues from non-maintainers, repeat contributors, conversion of demo viewers to installation where measurable without invasive tracking.
   319|
   320|**Qualification:** user can reproduce a meaningful finding and wants to keep the check in their workflow; avoid using star count alone to define success.
   321|
   322|### Public roadmap / future GitHub Pages
   323|
   324|A future site may contain: installation, interactive sample diff-to-doc report, benchmarks against baselines, rules registry, integrations, and privacy/security statement. **Do not prioritize the site before validating a useful CLI**.
   325|
   326|## 12. Open decisions before implementation
   327|
   328|1. Final public name (doc-lag is a working name; reserve exact package and handle).
   329|2. Start TypeScript-only manifests, or include Python `.env.example` and Markdown immediately? **Recommendation:** start TS manifests plus universal path/link rules; add Python-specific extractors later.
   330|3. Git diff semantics: include uncommitted working-tree changes? **Recommendation:** explicit `--working-tree` in P1, avoid ambiguous default.
   331|4. How strict should `--fail-on` be by default? **Recommendation:** only confirmed findings block CI; advisory suggestions never block by default.
   332|5. License (MIT vs Apache-2.0), owner/organization and contribution governance.
   333|6. Which two public repos and one synthetic fixture repo serve as honest comparisons?
   334|
   335|## 13. Cursor kickoff prompt (paste into your coding agent)
   336|
   337|> Implement doc-lag from `PROJECT_SPEC.md`. Start with **Gate 0**: inspect listed competitors and identify a concrete differentiating fixture; do not code before writing the competitive gap in `docs/validation.md`. Then implement **only RF-01 through RF-03, RF-04, RF-07 through RF-12** for a TypeScript CLI, with fixtures and tests. Keep the tool fully local and read-only; never execute commands found in repository docs. Use a clear, versioned JSON report; return deterministic results and documented exit codes. Do **not** implement Jev, MCP, cloud service, GitHub Pages, UI or automatic file modifications. Document every limitation, provide exact commands to run tests and a demonstrable before/after PR fixture. Avoid making unsupported marketing claims.
   338|
   339|---
   340|
   341|**Scope control:** A crisp, tested, PR-aware difference is better than a huge rules catalog that duplicates existing projects.  
   342|**Status:** specification only; no application code is claimed to exist.
   343|