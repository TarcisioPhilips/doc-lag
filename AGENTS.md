# AGENTS.md — doc-lag

Short orientation for coding agents working in **this** repository or setting up doc-lag in another project.

## If you are setting up doc-lag in the user’s repo

Follow **[docs/AGENT_SETUP.md](docs/AGENT_SETUP.md)** end-to-end.

One-liner the human can paste:

```text
Set up doc-lag in this repo following https://github.com/TarcisioPhilips/doc-lag/blob/main/docs/AGENT_SETUP.md
```

Consumer commands (npm package `doc-lag`, currently **0.2.1**):

```bash
npx doc-lag scan --base main
npx -y doc-lag mcp
# bin inside package doc-lag (not a separate npm package):
npx -y -p doc-lag doc-lag-mcp
```

Safety: read-only by default; no secrets in git; do **not** enable `--rank jev` / `rank: jev` unless the user asks (ranking ships in **0.3.0** / current `main`, not in 0.2.1).

## If you are developing doc-lag itself

```bash
npm install
npm test
npm run build
node dist/cli.js scan --base main --head HEAD
npm run mcp
```

Node.js 20+. Details: [README](README.md), [PROJECT_SPEC.md](PROJECT_SPEC.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
