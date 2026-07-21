#!/usr/bin/env bash
# Assemble the deployable site into _site/.
#
# Shared by .github/workflows/deploy.yml (push to master) and verify.yml (pull
# requests) so both build the site exactly the same way.
#
# Page directories are discovered by globbing for a top-level index.html, so
# adding a page needs no edit here. A new page must still be registered in:
#   - tailwind.config.js            (content globs, or its classes never compile)
#   - package.json                  (lint:html + lint-staged)
#   - tests/a11y/configs/a11y-urls.json
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

rm -rf _site
mkdir -p _site/assets

cp index.html _site/
cp robots.txt sitemap.xml llms.txt _site/
cp CNAME _site/
cp -r images _site/
touch _site/.nojekyll

# Every top-level directory holding an index.html is a page.
while IFS= read -r dir; do
  echo "  page: ${dir#./}"
  cp -r "$dir" _site/
done < <(find . -mindepth 2 -maxdepth 2 -name index.html \
  -not -path './node_modules/*' -not -path './_site/*' -printf '%h\n' | sort)

npx tailwindcss -i ./src/input.css -o ./_site/assets/tailwind.css --minify

# Cache-bust the stylesheet. assets/tailwind.css is a stable filename with
# mutable content sitting behind a 4-hour Cloudflare TTL, so a deploy that adds
# classes serves stale CSS until the TTL expires and new pages render unstyled.
# Stamping the content hash onto the href gives changed CSS a URL the CDN has
# never cached.
CSS_HASH="$(sha256sum _site/assets/tailwind.css | cut -c1-12)"
find _site -name '*.html' -exec \
  sed -i "s|assets/tailwind\.css|assets/tailwind.css?v=${CSS_HASH}|g" {} +
echo "Stylesheet versioned as ?v=${CSS_HASH}"
grep -rho 'assets/tailwind\.css?v=[a-f0-9]*' _site --include='*.html' | sort -u
