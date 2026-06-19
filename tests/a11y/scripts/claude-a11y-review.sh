#!/usr/bin/env bash
#
# LOCAL-ONLY accessibility AI review for the Backyard Bullies site.
#
# There are no Claude credentials in GitHub Actions, so this never runs in CI
# (a11y-audit.sh guards on $CI). It captures live evidence from the rendered page
# (axe results + rendered HTML + screenshot) and asks a local AI CLI to review it
# against the project's accessibility patterns, then writes a Markdown report.
#
# AI backend:
#   - Default: `claude -p` (you have Claude locally).
#   - Override with A11Y_AI_CMD, e.g. for a Codex CLI:  A11Y_AI_CMD="codex exec"
#     (the script appends the prompt as the final argument).
#
# Flags:
#   --url URL    Target to review (default: build + serve repo root locally).
#   --out PATH   Report path (default: tests/a11y/reports/ACCESSIBILITY_AI_REVIEW.md).
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

URL=""
OUT="tests/a11y/reports/ACCESSIBILITY_AI_REVIEW.md"
PORT="${A11Y_PORT:-8181}"
AI_CMD="${A11Y_AI_CMD:-claude}"

while [ $# -gt 0 ]; do
  case "$1" in
    --url) shift; URL="${1:-}" ;;
    --url=*) URL="${1#*=}" ;;
    --out) shift; OUT="${1:-}" ;;
    --out=*) OUT="${1#*=}" ;;
    *) echo "Unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

if [ "${CI:-}" = "true" ]; then
  echo "claude-a11y-review: skipped in CI (no AI credentials on GitHub)."
  exit 0
fi

EVID_DIR="tests/a11y/reports/ai-evidence"
mkdir -p "$EVID_DIR" "$(dirname "$OUT")"

# ---- Serve locally if no URL was provided -----------------------------------
SERVER_PID=""
cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if [ -z "$URL" ]; then
  echo "Building + serving locally on port $PORT…"
  npm run build:css
  python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$REPO_ROOT" >/dev/null 2>&1 &
  SERVER_PID=$!
  URL="http://127.0.0.1:${PORT}"
  for _ in $(seq 1 30); do curl -fsS -o /dev/null "${URL}/" && break; sleep 0.5; done
fi

echo "Capturing live evidence from $URL …"
A11Y_TARGET="$URL" A11Y_EVID_DIR="$EVID_DIR" node - <<'NODE'
const { chromium } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('fs');
const path = require('path');

(async () => {
  const url = process.env.A11Y_TARGET;
  const dir = process.env.A11Y_EVID_DIR;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(url, { waitUntil: 'networkidle' });

  // Expand all disclosures so the AI sees the full DOM (mobile nav, bios, calendar).
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
  await page.waitForTimeout(300);

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  fs.writeFileSync(path.join(dir, 'axe.json'), JSON.stringify(results.violations, null, 2));

  const html = await page.content();
  fs.writeFileSync(path.join(dir, 'page.html'), html);
  await page.screenshot({ path: path.join(dir, 'page.png'), fullPage: true });

  await browser.close();
  console.log(`axe violations captured: ${results.violations.length}`);
})().catch((e) => {
  console.error('Evidence capture failed:', e.message);
  process.exit(1);
});
NODE

if [ ! -f "$EVID_DIR/axe.json" ]; then
  echo "NO LIVE BROWSER EVIDENCE — evidence capture failed." >&2
  exit 1
fi

# ---- Build the prompt -------------------------------------------------------
PROMPT_FILE="$(mktemp)"
trap 'rm -f "$PROMPT_FILE"; cleanup' EXIT
{
  echo "You are an expert WCAG 2.2 AA accessibility reviewer. Review the LIVE rendered"
  echo "evidence below for the Backyard Bullies single-page wrestling-club site."
  echo
  echo "Project accessibility patterns to respect (from AGENTS.md):"
  echo "- Skip link targets <main tabindex=\"-1\">; global :focus-visible brand outline."
  echo "- prefers-reduced-motion disables transitions/animations."
  echo "- Disclosures are native <details>/<summary> (do NOT recommend role=menu)."
  echo "- Every target=_blank link has an sr-only '(opens in new window)' cue."
  echo "- Decorative images/emoji use alt=\"\"/aria-hidden; coach avatars are aria-hidden monograms."
  echo
  echo "Machine evidence (axe-core violations, expanded DOM) follows. Group findings by"
  echo "root cause, rate each by WCAG impact, and give a concrete fix. Then add issues a"
  echo "scanner CANNOT catch that you can see in the rendered HTML (focus order, link text,"
  echo "heading structure, label quality). Output Markdown only. If the evidence is empty,"
  echo "say so plainly — do not invent findings."
  echo
  echo '## axe-core violations (JSON)'
  echo '```json'
  cat "$EVID_DIR/axe.json"
  echo '```'
  echo
  echo "Rendered HTML and a full-page screenshot are at $EVID_DIR/ for reference."
} > "$PROMPT_FILE"

echo "Invoking AI review via: $AI_CMD -p …"
if ! command -v "${AI_CMD%% *}" >/dev/null 2>&1; then
  echo "AI CLI '${AI_CMD%% *}' not found. Evidence is in $EVID_DIR/." >&2
  echo "Set A11Y_AI_CMD to your CLI (e.g. A11Y_AI_CMD=\"codex exec\") and re-run." >&2
  exit 1
fi

# shellcheck disable=SC2086
if $AI_CMD -p "$(cat "$PROMPT_FILE")" > "$OUT" 2>/dev/null; then
  echo "AI review written to $OUT"
else
  echo "AI review invocation failed; raw evidence remains in $EVID_DIR/." >&2
  exit 1
fi
