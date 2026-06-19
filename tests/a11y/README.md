# Accessibility testing (`tests/a11y`)

WCAG 2.2 AA enforcement for this static single-page site. Adapted from the
four-layer a11y stack to fit plain HTML + compiled Tailwind (no framework).

## What runs where

| Layer                | Tool                                                                           | Where                                           |
| -------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------- |
| 1. Lint (static)     | `html-validate` + `stylelint` (`@double-great/stylelint-a11y`) + content check | `npm run lint` → pre-commit hook + `deploy.yml` |
| 3. Rendered (axe)    | Playwright + `@axe-core/playwright`, desktop + mobile + disclosures expanded   | `deploy.yml` **hard gate**                      |
| 3. Rendered (htmlcs) | Pa11y-CI, HTML_CodeSniffer engine                                              | `deploy.yml` **hard gate**                      |
| 4. AI review         | `claude-a11y-review.sh`                                                        | **local only** (no AI creds in CI)              |

There are **no separate PR or cron workflows** — this site has no PRs/releases and
deploys on push to `master`. Enforcement points are the **pre-commit hook** and the
**hard gate inside `.github/workflows/deploy.yml`** (runs before publishing; a
violation blocks the deploy).

## Commands

```bash
npm run a11y          # full audit: build → serve → axe + pa11y  (lint included)
npm run a11y:lint     # lint layer only
npm run a11y:doctor   # verify the harness files/syntax are intact
bash scripts/a11y-audit.sh --no-lint            # rendered checks only
bash scripts/a11y-audit.sh --claude             # + local AI review
bash scripts/a11y-audit.sh --url https://www.backyardbullies-wc.com  # test a live URL
```

`scripts/a11y-audit.sh` builds Tailwind, serves the site on a local port, and runs
the tools against it. CI serves the assembled `_site` (`--serve-dir=_site`).

## Two scoping decisions — these are NOT rule suppressions

We enforce **every WCAG 2.2 AA rule on our own markup**. `ignore` is empty and no
rules are baselined. Two deliberate scoping choices keep the gate honest and green:

1. **Third-party embeds are excluded from the scan** — the TikTok feed
   (`.tiktok-embed`, which injects its own untitled `__tt_embed__` iframe) and the
   cross-origin Google Maps / Calendar iframes. We don't author their markup and
   can't remediate it, so gating on it would be meaningless. Mirrored in both
   `tests/wcag-audit.spec.js` (axe `.exclude(...)`) and `configs/.pa11yci.cjs`
   (`hideElements`). This excludes _content we don't control_ — not rules.

2. **Pa11y runs the `htmlcs` engine only; Playwright owns `axe`.** Playwright's axe
   integration runs axe comprehensively and correctly treats axe "incomplete /
   cantTell" results (e.g. text over the hero gradient or the translucent header,
   where axe literally cannot auto-measure contrast) as non-failing. Pa11y's axe
   integration instead reports those _manual-review_ cases as hard errors. Running
   axe in both tools duplicated coverage and turned indeterminate results into ~46
   false contrast failures. HTML_CodeSniffer is a genuine _second engine_ that
   still checks contrast and catches things axe misses. Override with
   `A11Y_RUNNERS=axe,htmlcs` to run both.

> The hero/header text that axe marks "incomplete" was manually verified legible
> (white/cyan on a 90%-opaque near-black header). If you change those backgrounds,
> re-verify by eye — the scanners can't.

## When you change the site

- New Tailwind classes only take effect after `npm run build:css` — the audit
  rebuilds, but rebuild before previewing.
- Adding/removing a third-party embed? Update the exclude/hide lists in both
  `tests/wcag-audit.spec.js` and `configs/.pa11yci.cjs`.
- `configs/a11y-urls.json` is the single source of test URLs (one page here).
