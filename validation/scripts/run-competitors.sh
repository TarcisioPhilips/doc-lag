#!/usr/bin/env bash
# Re-run the Gate 0 competitor suite against fixture/preview-service.
# Expects clones under competitors/ and a built docsync at bin/docsync.
# Optional: DDG=/path/to/ddg if the venv is not at /tmp/rdp-venvs/ddg.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIX="$ROOT/fixture/preview-service"
OUT="$ROOT/raw-results"
BIN="$ROOT/bin"
DOCS_DRIFT_CLI="$ROOT/competitors/docs-drift/packages/cli/dist/index.js"
PALLA_CLI="$ROOT/competitors/drift/dist/cli.js"
DDG="${DDG:-/tmp/rdp-venvs/ddg/bin/ddg}"

mkdir -p "$OUT"

if [[ ! -d "$FIX/.git" ]]; then
  echo "Fixture missing. Run scripts/create-fixture.sh first." >&2
  exit 1
fi

run_tool() {
  local name="$1" ref="$2" logfile="$3"
  shift 3
  git -C "$FIX" checkout -q "$ref"
  local start end elapsed rc
  start=$(date +%s.%N)
  set +e
  (cd "$FIX" && "$@") >"$OUT/${logfile}.stdout" 2>"$OUT/${logfile}.stderr"
  rc=$?
  set -e
  end=$(date +%s.%N)
  elapsed=$(python3 -c "print(f'{float('$end')-float('$start'):.3f}')")
  printf '%s\n' "$rc" >"$OUT/${logfile}.exit"
  printf '%s\n' "$elapsed" >"$OUT/${logfile}.time"
  echo "[$name @ $ref] exit=$rc time=${elapsed}s"
}

run_tool docsync main docsync-main "$BIN/docsync" check --json
run_tool docsync stale-docs docsync-head "$BIN/docsync" check --json

git -C "$FIX" checkout -q main
(cd "$FIX" && "$BIN/docsync" check --json --baseline-out "$OUT/docsync-baseline.json") >"$OUT/docsync-baseline-write.stdout" 2>"$OUT/docsync-baseline-write.stderr" || true
run_tool docsync stale-docs docsync-baseline-head "$BIN/docsync" check --json --baseline "$OUT/docsync-baseline.json"

run_tool nickita-docs-drift main nickita-main node "$DOCS_DRIFT_CLI" scan --config docs-drift.yml --format json
run_tool nickita-docs-drift stale-docs nickita-head node "$DOCS_DRIFT_CLI" scan --config docs-drift.yml --format json

if [[ -x "$DDG" ]]; then
  run_tool ddg-full main ddg-full-main "$DDG" scan --repo . --format json --no-ai --output "$OUT/ddg-full-main.report.json"
  run_tool ddg-full stale-docs ddg-full-head "$DDG" scan --repo . --format json --no-ai --output "$OUT/ddg-full-head.report.json"
  run_tool ddg-changed stale-docs ddg-changed-head "$DDG" scan --repo . --format json --no-ai --changed-only --base-ref main --output "$OUT/ddg-changed-head.report.json"
else
  echo "Skipping ddg: executable not found at $DDG" >&2
fi

run_tool palla-drift main palla-main node "$PALLA_CLI" --format json --quiet --fail-on none .
run_tool palla-drift stale-docs palla-head node "$PALLA_CLI" --format json --quiet --fail-on none .

git -C "$FIX" checkout -q stale-docs
echo "Done. Outputs in $OUT"
