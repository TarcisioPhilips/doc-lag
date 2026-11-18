#!/usr/bin/env bash
# Create a tiny self-contained fixture repo for the doc-lag README demo.
# Prints the repo path on stdout. Designed for VHS (docs/demo/demo.tape).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLI="${DOC_LAG_CLI:-$ROOT/dist/cli.js}"

if [[ ! -f "$CLI" ]]; then
  echo "error: built CLI not found at $CLI (run: npm run build)" >&2
  exit 1
fi

REPO="$(mktemp -d "${TMPDIR:-/tmp}/doc-lag-demo.XXXXXX")"
git -C "$REPO" init -b main >/dev/null
git -C "$REPO" config user.email "demo@doc-lag.local"
git -C "$REPO" config user.name "doc-lag Demo"
git -C "$REPO" config commit.gpgsign false

mkdir -p "$REPO/docs"

cat >"$REPO/package.json" <<'EOF'
{
  "name": "demo-api",
  "private": true,
  "version": "0.1.0"
}
EOF

cat >"$REPO/.env.example" <<'EOF'
PORT=3000
API_TIMEOUT=30s
LOG_LEVEL=info
EOF

cat >"$REPO/docs/setup.md" <<'EOF'
# Setup

Copy `.env.example` to `.env`, then set `API_TIMEOUT` for outbound
HTTP calls (default `30s`).

```bash
cp .env.example .env
```
EOF

cat >"$REPO/README.md" <<'EOF'
# demo-api

Tiny fixture used by the doc-lag terminal demo.
EOF

git -C "$REPO" add -A
git -C "$REPO" -c commit.gpgsign=false commit -m "docs: document API_TIMEOUT" >/dev/null

# Head: rename the env key in config; docs still mention API_TIMEOUT.
cat >"$REPO/.env.example" <<'EOF'
PORT=3000
REQUEST_TIMEOUT=30s
LOG_LEVEL=info
EOF

git -C "$REPO" add .env.example
git -C "$REPO" -c commit.gpgsign=false commit -m "refactor: rename API_TIMEOUT to REQUEST_TIMEOUT" >/dev/null

# Wrapper so the demo can type `npx doc-lag ...` while running the local build.
BIN_DIR="$REPO/.demo-bin"
mkdir -p "$BIN_DIR"
cat >"$BIN_DIR/npx" <<EOF
#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "doc-lag" ]]; then
  shift
  exec node $(printf '%q' "$CLI") "\$@"
fi
exec $(command -v npx) "\$@"
EOF
chmod +x "$BIN_DIR/npx"

# Marker files for the tape script.
printf '%s\n' "$REPO" >"$ROOT/docs/demo/.last-demo-repo"
printf '%s\n' "$BIN_DIR" >"$ROOT/docs/demo/.last-demo-bin"

echo "$REPO"
