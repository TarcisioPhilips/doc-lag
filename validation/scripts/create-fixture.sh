#!/usr/bin/env bash
# Recreate fixture/preview-service with the Gate 0 base and head commits.
# Run from the validation workspace root or from this script's directory.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/fixture/preview-service"

if [[ -d "$DEST/.git" ]]; then
  echo "Removing existing fixture at $DEST"
  rm -rf "$DEST"
fi

mkdir -p "$DEST"/{src/lib,docs,scripts}

cat > "$DEST/package.json" <<'EOF'
{
  "name": "preview-service",
  "version": "1.2.0",
  "private": true,
  "description": "Tiny Node service used as a doc-lag Gate 0 fixture",
  "bin": {
    "preview-cli": "./src/cli.js"
  },
  "scripts": {
    "start": "node src/server.js",
    "test": "node --test",
    "build": "node -e \"console.log('ok')\"",
    "deploy:preview": "node scripts/deploy-preview.js",
    "lint": "node -e \"console.log('lint ok')\""
  }
}
EOF

cat > "$DEST/.env.example" <<'EOF'
PORT=3000
API_KEY=replace-me
DATABASE_URL=postgres://localhost:5432/preview
PREVIEW_SECRET=dev-secret
EOF

cat > "$DEST/src/cli.js" <<'EOF'
#!/usr/bin/env node
"use strict";

function printHelp() {
  process.stdout.write(
    [
      "preview-cli",
      "",
      "Usage:",
      "  preview-cli --format <json|text> --dry-run",
      "",
      "Options:",
      "  --format    Output format (json|text)",
      "  --dry-run   Do not write files",
      "  --help      Show help",
      "",
    ].join("\n")
  );
}

function parseArgs(argv) {
  const options = { format: "text", dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--format") {
      options.format = argv[i + 1];
      i += 1;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    }
  }
  return options;
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  const payload = { ok: true, dryRun: options.dryRun };
  process.stdout.write(
    options.format === "json" ? `${JSON.stringify(payload)}\n` : "ok\n"
  );
}

module.exports = { parseArgs };
EOF

cat > "$DEST/src/lib/preview.js" <<'EOF'
"use strict";

function buildPreview(source) {
  return { kind: "preview", source };
}

module.exports = { buildPreview };
EOF

cat > "$DEST/src/server.js" <<'EOF'
"use strict";

const http = require("node:http");
const { buildPreview } = require("./lib/preview");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;
const PREVIEW_SECRET = process.env.PREVIEW_SECRET;

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && req.url === "/api/preview") {
    if (!API_KEY || !PREVIEW_SECRET) {
      sendJson(res, 500, { error: "missing credentials" });
      return;
    }
    sendJson(res, 200, buildPreview("live"));
    return;
  }

  sendJson(res, 404, { error: "not found" });
});

if (require.main === module) {
  server.listen(PORT, () => {
    process.stdout.write(`listening on ${PORT}\n`);
  });
}

module.exports = { server };
EOF

cat > "$DEST/scripts/deploy-preview.js" <<'EOF'
"use strict";

process.stdout.write("deploying preview environment\n");
EOF

cat > "$DEST/README.md" <<'EOF'
# preview-service

Small HTTP service that renders a preview payload.

## Setup

1. Copy `.env.example` and set `API_KEY` plus `PREVIEW_SECRET`.
2. Install dependencies with `npm install`.
3. Start the server:

```bash
npm start
```

## Deploy a preview environment

After tests pass, publish a preview with:

```bash
npm run deploy:preview
```

The helper lives in [src/lib/preview.js](src/lib/preview.js).

You can also build a payload from a script:

```js
const { buildPreview } = require("./src/lib/preview");

const payload = buildPreview("docs-example");
console.log(payload);
```

## CLI

Inspect a payload without writing files:

```bash
node src/cli.js --format json --dry-run
```
EOF

cat > "$DEST/AGENTS.md" <<'EOF'
# Agent notes

When a reviewer asks for a preview environment, run `npm run deploy:preview`.
Do not invent other release scripts.

The preview helper is `src/lib/preview.js`. Use `PREVIEW_SECRET` from `.env.example`
when calling `GET /api/preview`.
EOF

cat > "$DEST/docs/setup.md" <<'EOF'
# Setup

Required environment variables (see `.env.example`):

- `PORT` — HTTP port, default `3000`
- `API_KEY` — request credential
- `DATABASE_URL` — unused in the tiny fixture server, kept for the setup guide
- `PREVIEW_SECRET` — required by the preview endpoint

The preview builder is implemented in `src/lib/preview.js`.
EOF

cat > "$DEST/docs/cli.md" <<'EOF'
# CLI

`preview-cli` is the local inspection tool.

```bash
node src/cli.js --format json --dry-run
```

Flags:

- `--format` — `json` or `text`
- `--dry-run` — print the payload and exit without writing files
EOF

cat > "$DEST/docs/api.md" <<'EOF'
# HTTP API

- `GET /health` — liveness probe
- `GET /api/preview` — returns the preview payload; requires `API_KEY` and `PREVIEW_SECRET`
EOF

cat > "$DEST/docs/maintenance.md" <<'EOF'
# Maintenance

Once a month the on-call engineer should purge leftover build artifacts:

```bash
npm run ancient:cleanup
```

The historical runbook still lives in the [legacy handbook](docs/legacy-handbook.md).
EOF

cat > "$DEST/docs-drift.yml" <<'EOF'
docs:
  include:
    - README.md
    - AGENTS.md
    - docs/**/*.md

sources:
  cli:
    command: "node src/cli.js --help"
  env:
    file: ".env.example"

checks:
  - cli_flags
  - env_vars

ignore:
  cliFlags: []
  envVars: []
  configKeys: []

report:
  format: text
  failOn:
    - missing_in_source
    - parse_error
EOF

cat > "$DEST/.gitignore" <<'EOF'
node_modules/
.env
EOF

git -C "$DEST" init -b main
git -C "$DEST" config user.name "doc-lag Fixture"
git -C "$DEST" config user.email "fixture@doc-lag.example"

export GIT_AUTHOR_DATE="2026-11-01T12:00:00-03:00"
export GIT_COMMITTER_DATE="$GIT_AUTHOR_DATE"
git -C "$DEST" add .
git -C "$DEST" commit -m "Initial preview-service docs and source (base)"

# Head changes
python3 - <<'PY'
from pathlib import Path
import json
p = Path("'''"$DEST"'''") / "package.json"
data = json.loads(p.read_text())
del data["scripts"]["deploy:preview"]
p.write_text(json.dumps(data, indent=2) + "\n")
PY

git -C "$DEST" mv src/lib/preview.js src/lib/preview-engine.js
cat > "$DEST/src/lib/preview-engine.js" <<'EOF'
"use strict";

function buildSnapshot(source) {
  return { kind: "snapshot", source };
}

module.exports = { buildSnapshot };
EOF

cat > "$DEST/src/server.js" <<'EOF'
"use strict";

const http = require("node:http");
const { buildSnapshot } = require("./lib/preview-engine");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && req.url === "/api/snapshots") {
    if (!API_KEY) {
      sendJson(res, 500, { error: "missing credentials" });
      return;
    }
    sendJson(res, 200, buildSnapshot("live"));
    return;
  }

  sendJson(res, 404, { error: "not found" });
});

if (require.main === module) {
  server.listen(PORT, () => {
    process.stdout.write(`listening on ${PORT}\n`);
  });
}

module.exports = { server };
EOF

cat > "$DEST/.env.example" <<'EOF'
PORT=3000
API_KEY=replace-me
DATABASE_URL=postgres://localhost:5432/preview
EOF

cat > "$DEST/src/cli.js" <<'EOF'
#!/usr/bin/env node
"use strict";

function printHelp() {
  process.stdout.write(
    [
      "preview-cli",
      "",
      "Usage:",
      "  preview-cli --format <json|text> --check-only",
      "",
      "Options:",
      "  --format       Output format (json|text)",
      "  --check-only   Do not write files",
      "  --help         Show help",
      "",
    ].join("\n")
  );
}

function parseArgs(argv) {
  const options = { format: "text", checkOnly: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--format") {
      options.format = argv[i + 1];
      i += 1;
    } else if (arg === "--check-only") {
      options.checkOnly = true;
    }
  }
  return options;
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  const payload = { ok: true, checkOnly: options.checkOnly };
  process.stdout.write(
    options.format === "json" ? `${JSON.stringify(payload)}\n` : "ok\n"
  );
}

module.exports = { parseArgs };
EOF

git -C "$DEST" checkout -b stale-docs
export GIT_AUTHOR_DATE="2026-11-17T15:00:00-03:00"
export GIT_COMMITTER_DATE="$GIT_AUTHOR_DATE"
git -C "$DEST" add -A
git -C "$DEST" commit -m "Break docs: drop deploy:preview, move helper, remove env, rename flag and route"

echo "Created $DEST"
echo "base:  $(git -C "$DEST" rev-parse main)"
echo "head:  $(git -C "$DEST" rev-parse stale-docs)"
git -C "$DEST" --no-pager diff --name-status main...stale-docs
