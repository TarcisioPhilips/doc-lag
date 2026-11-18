# Regenerates docs/demo/doc-lag-demo.gif for the README.
# From the repository root (after `npm run build`):
#   vhs docs/demo/demo.tape
#
# Requires: vhs, ttyd, ffmpeg, node, git (see docs/demo/README.md).

Output docs/demo/doc-lag-demo.gif

Require git
Require node

Set Shell "bash"
Set FontSize 17
Set Width 1100
Set Height 540
Set Padding 18
Set Theme "Catppuccin Mocha"
Set TypingSpeed 42ms
Set Framerate 18
Set PlaybackSpeed 1.05
Set CursorBlink false
Set WindowBar Colorful
Set BorderRadius 8
Set Margin 12
Set MarginFill "#1e1e2e"

# Build fixture + PATH wrapper that makes `npx doc-lag` run the local CLI.
Hide
Type `cd "$(git -C "${PWD}" rev-parse --show-toplevel 2>/dev/null || pwd)" && test -f dist/cli.js || npm run build >/dev/null && REPO="$(./docs/demo/setup-demo.sh)" && export PATH="$(cat docs/demo/.last-demo-bin):$PATH" && cd "$REPO" && clear`
Enter
Sleep 800ms
Show

Type `git diff HEAD~1 -- .env.example`
Enter
Sleep 2.8s

Type `npx doc-lag scan --base HEAD~1 --fail-on none`
Enter
Wait+Screen@12s /CONFIRMED/
Sleep 5.5s

Type@30ms `echo "Also: GitHub Action + MCP — see README Quickstart"`
Enter
Sleep 3.2s
