#!/usr/bin/env bash
# Thin root shim — delegates to the canonical harness under tests/a11y.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
exec bash tests/a11y/scripts/a11y-audit.sh "$@"
