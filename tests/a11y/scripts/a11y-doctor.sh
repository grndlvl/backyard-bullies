#!/usr/bin/env bash
#
# Self-check for the a11y harness: verifies files exist, Node/shell files parse,
# the URL list is valid, and the root shim is wired. Does not run a full audit.
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

PASS=0
FAIL=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; PASS=$((PASS + 1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$*"; FAIL=$((FAIL + 1)); }

echo "a11y-doctor: checking harness at tests/a11y"

# Required files.
for f in \
  tests/a11y/.a11y-setup.yml \
  tests/a11y/configs/a11y-urls.json \
  tests/a11y/configs/.pa11yci.cjs \
  tests/a11y/playwright.config.js \
  tests/a11y/tests/wcag-audit.spec.js \
  tests/a11y/scripts/a11y-audit.sh \
  tests/a11y/scripts/claude-a11y-review.sh \
  scripts/a11y-audit.sh; do
  if [ -f "$f" ]; then ok "exists: $f"; else bad "missing: $f"; fi
done

# Shell syntax.
for s in \
  tests/a11y/scripts/a11y-audit.sh \
  tests/a11y/scripts/a11y-doctor.sh \
  tests/a11y/scripts/claude-a11y-review.sh \
  scripts/a11y-audit.sh; do
  if bash -n "$s" 2>/dev/null; then ok "bash -n: $s"; else bad "syntax error: $s"; fi
done

# Node syntax.
for n in tests/a11y/configs/.pa11yci.cjs tests/a11y/playwright.config.js; do
  if node --check "$n" 2>/dev/null; then ok "node --check: $n"; else bad "syntax error: $n"; fi
done

# Root shim executable.
if [ -x scripts/a11y-audit.sh ]; then ok "executable: scripts/a11y-audit.sh"; else bad "not executable: scripts/a11y-audit.sh"; fi

# URL list parses and has non-empty pr/full, no leftover TODO paths.
node -e '
  const c = require("./tests/a11y/configs/a11y-urls.json");
  for (const k of ["pr", "full"]) {
    if (!Array.isArray(c[k]) || c[k].length === 0) { console.error("empty scope: " + k); process.exit(1); }
    if (c[k].some(p => /TODO/.test(p.path) || /TODO/.test(p.name))) { console.error("TODO left in: " + k); process.exit(1); }
  }
' && ok "a11y-urls.json valid (pr/full non-empty, no TODO)" || bad "a11y-urls.json invalid"

echo "a11y-doctor: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
