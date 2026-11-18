# Terminal demo (VHS)

The README embeds `doc-lag-demo.gif`, a short terminal recording that shows
doc-lag catching a stale env-var reference after a rename.

## Regenerate

Requires [VHS](https://github.com/charmbracelet/vhs) (`ttyd` + `ffmpeg` on
`PATH`), Node.js 20+, and Git.

```bash
npm run build
vhs docs/demo/demo.tape
```

This runs `setup-demo.sh` (creates a temp fixture repo), then records
`docs/demo/doc-lag-demo.gif`. Commit the updated GIF with the tape when the
CLI output format changes.

## Files

| Path | Role |
| --- | --- |
| `setup-demo.sh` | Builds a tiny fixture: docs mention `API_TIMEOUT`, then a commit renames it in `.env.example` |
| `demo.tape` | VHS script (typing, pacing, output settings) |
| `doc-lag-demo.gif` | Committed recording for the README |

The tape uses a PATH wrapper so the visible command is `npx doc-lag …` while
executing this repo’s built `dist/cli.js`. No API keys; ranking stays off.
