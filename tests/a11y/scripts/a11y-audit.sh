#!/usr/bin/env bash
#
# Accessibility audit runner for the Backyard Bullies static site.
#
# Single entrypoint used by local dev and by .github/workflows/deploy.yml.
# Layers:
#   - Linting (html-validate + stylelint w/ a11y + content) via `npm run lint`
#   - Rendered axe-core scan (Playwright, desktop + mobile, disclosures expanded)
#   - Rendered Pa11y-CI scan (axe + htmlcs runners)
#   - Optional local Claude AI review (never runs in CI)
#
# It builds Tailwind CSS and serves the site locally (python3 http.server), then
# points the rendered tools at it — unless --url is given (test a remote target).
#
# Flags:
#   --scope=pr|full     URL subset (identical for this single-page site). Default full.
#   --tools=axe,pa11y   Rendered tools to run. Default axe,pa11y.
#   --lint-only         Run only the linting layer, then exit.
#   --no-lint           Skip the linting layer (CI runs it earlier in the deploy).
#   --url URL           Test an already-running target; skip build+serve.
#   --serve-dir DIR     Directory to serve (default: repo root). CI uses _site.
#   --claude            Run the local Claude AI review pass at the end (local only).
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

SCOPE="full"
TOOLS="axe,pa11y"
DO_LINT=1
LINT_ONLY=0
EXTERNAL_URL=""
SERVE_DIR="$REPO_ROOT"
RUN_CLAUDE=0
PORT="${A11Y_PORT:-8181}"

for arg in "$@"; do
  case "$arg" in
    --scope=*) SCOPE="${arg#*=}" ;;
    --tools=*) TOOLS="${arg#*=}" ;;
    --lint-only) LINT_ONLY=1 ;;
    --no-lint) DO_LINT=0 ;;
    --url) shift; EXTERNAL_URL="${1:-}" ;;          # supports `--url X`
    --url=*) EXTERNAL_URL="${arg#*=}" ;;
    --serve-dir) shift; SERVE_DIR="${1:-}" ;;
    --serve-dir=*) SERVE_DIR="${arg#*=}" ;;
    --claude) RUN_CLAUDE=1 ;;
    -h|--help) sed -n '2,30p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; }

FAILED=0

# ---- Layer 1: linting -------------------------------------------------------
if [ "$DO_LINT" -eq 1 ] || [ "$LINT_ONLY" -eq 1 ]; then
  say "Linting (html-validate + stylelint a11y + content)"
  if npm run lint; then
    echo "lint: OK"
  else
    fail "lint failed"
    FAILED=1
  fi
fi

if [ "$LINT_ONLY" -eq 1 ]; then
  [ "$FAILED" -eq 0 ] && say "Lint-only passed" || fail "Lint-only failed"
  exit "$FAILED"
fi

# ---- Serve the build (unless testing an external URL) -----------------------
SERVER_PID=""
cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if [ -n "$EXTERNAL_URL" ]; then
  BASE_URL="$EXTERNAL_URL"
  say "Testing external target: $BASE_URL"
else
  say "Building Tailwind CSS"
  npm run build:css

  say "Serving '$SERVE_DIR' on port $PORT"
  python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$SERVE_DIR" >/dev/null 2>&1 &
  SERVER_PID=$!
  BASE_URL="http://127.0.0.1:${PORT}"

  # Wait for readiness.
  ready=0
  for _ in $(seq 1 30); do
    if curl -fsS -o /dev/null "${BASE_URL}/"; then ready=1; break; fi
    sleep 0.5
  done
  if [ "$ready" -ne 1 ]; then
    fail "server did not become ready at ${BASE_URL}/"
    exit 1
  fi
  echo "server ready at $BASE_URL (pid $SERVER_PID)"
fi

export BASE_URL
export A11Y_SCOPE="$SCOPE"

# ---- Layer 3: rendered audits ----------------------------------------------
case ",$TOOLS," in
  *,axe,*)
    say "axe-core (Playwright — desktop + mobile, disclosures expanded)"
    if npx playwright test --config tests/a11y/playwright.config.js; then
      echo "axe: OK"
    else
      fail "axe-core violations"
      FAILED=1
    fi
    ;;
esac

case ",$TOOLS," in
  *,pa11y,*)
    say "Pa11y-CI (axe + htmlcs)"
    if npx pa11y-ci --config tests/a11y/configs/.pa11yci.cjs; then
      echo "pa11y: OK"
    else
      fail "Pa11y-CI violations"
      FAILED=1
    fi
    ;;
esac

# ---- Layer 4: optional local Claude review ----------------------------------
if [ "$RUN_CLAUDE" -eq 1 ]; then
  say "Claude AI review (local)"
  if [ "${CI:-}" = "true" ]; then
    echo "Skipping Claude review in CI (no Claude credentials on GitHub)."
  else
    bash tests/a11y/scripts/claude-a11y-review.sh --url "$BASE_URL" || {
      fail "Claude review reported issues"
      FAILED=1
    }
  fi
fi

if [ "$FAILED" -eq 0 ]; then
  say "Accessibility audit passed"
else
  fail "Accessibility audit found issues"
fi
exit "$FAILED"
