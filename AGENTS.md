# Backyard Bullies Wrestling Club — Agent Guide

Guidance for AI coding agents (Claude Code, Codex, etc.) working in this repo.

## What this is

A single-page **static marketing site** for a youth-to-adult wrestling club in Augusta, GA (the CSRA). Plain HTML + compiled Tailwind CSS + a little inline vanilla JS. **No framework.** Deploys to GitHub Pages on push to `master`, served at https://www.backyardbullies-wc.com.

## Stack & layout

- `index.html` — the entire site. One page; sections are delimited by `<!-- ============ NAME ============ -->` comments.
- `src/input.css` — Tailwind entry point plus custom classes (`.hero-overlay`, `.logo-badge`, `.section-rule`, reduced-motion reset).
- `tailwind.config.js` — theme tokens. Colors: `ink` / `ink-soft` / `ink-card` / `ink-line` (darks) and `brand` / `brand-dark` / `brand-deep` (cyan `#3FC8F4`). Fonts: `font-display` (Anton), `font-head` (Oswald), `font-body` (Inter). `content` scans `./index.html` only.
- `assets/tailwind.css` — **compiled output, gitignored.** Built locally by `npm run build:css` and freshly at deploy time.
- `robots.txt`, `sitemap.xml`, `llms.txt` — search/AI discovery files (kept in sync with the page).
- `images/` — assets; optimized WebP under `images/optimized/`, sponsor/store logos in subfolders.
- `.github/workflows/deploy.yml` — CI: `npm ci`, assemble `_site/`, compile Tailwind minified, deploy to Pages (copies `CNAME` + `.nojekyll`).

## Local development

```bash
npm ci                 # install
npm run build:css      # compile assets/tailwind.css (REQUIRED before previewing)
npm run watch:css      # rebuild on change while editing
npm run lint           # all checks: html + css + content (see below)
npm run format         # prettier --write (auto-format)
python3 -m http.server 8000   # then open http://127.0.0.1:8000
```

### Linting & formatting

`npm run lint` is an umbrella over three checks; CI (`deploy.yml`) runs it **plus
`npm run format:check` before the build**, so any failure blocks the deploy. Run
`npm run lint` (and `npm run format` to fix style) before committing.

- `lint:html` — **html-validate** (`.htmlvalidate.json`): malformed markup,
  duplicate IDs, broken ARIA, missing `alt`, heading order, void-element style.
- `lint:css` — **stylelint** (`stylelint-config-standard`, `.stylelintrc.json`)
  over `src/**/*.css`; the Tailwind at-rules (`@tailwind`/`@apply`/`@layer`) are
  whitelisted. Use `npx stylelint "src/**/*.css" --fix` to auto-fix.
- `lint:content` — `scripts/check-content.mjs`: every JSON-LD block parses, the
  FAQPage markup count equals the visible FAQ-card count, and every `href="#id"`
  resolves to a real element id.
- **Prettier** (`.prettierrc.json`) formats everything except the files in
  `.prettierignore` — note **`index.html` is intentionally excluded** (its
  hand-tuned markup must not be reflowed) along with build output and assets.

A **Husky pre-commit hook** (`.husky/pre-commit` → `lint-staged`) runs
automatically on `git commit`: it formats staged files with Prettier, runs
`stylelint --fix` on staged CSS, and validates `index.html` (html-validate +
content check). The hook installs via the `prepare` script on `npm ci`/`npm install`.

Serve over HTTP — don't open via `file://` (relative assets and the map/calendar iframes need a real origin).

## Critical: the CSS is compiled

Any **new** Tailwind class added to `index.html` — including arbitrary values (`h-[460px]`) and variants (`group-open:hidden`, `sm:*`) — only takes effect after a rebuild. The committed HTML is the source of truth (deploy rebuilds from scratch), but **always run `npm run build:css` and visually verify locally before committing.** A class that wasn't generated renders as a silent no-op — this already shipped a transparent mobile menu once (`bg-ink/98` was never compiled).

## Structured data — keep in sync, mind the policy

- Two JSON-LD blocks in `<head>`: `SportsActivityLocation` (`#business`) and `FAQPage` (`#faq`).
- The FAQPage Q&As must match the **visible** FAQ cards (Google guideline). Edit both together. Keep the visible FAQ an **even count** (it's a 2-column grid).
- **Do NOT add `aggregateRating` / `Review` markup** for the "Rated 5.0 from 18 reviews" claim — Google prohibits self-serving review markup. That claim stays as visible text only.

## Content consistency

Club facts (address, phone, email, schedule times, prices, coach credentials, age range) live in `index.html` (visible copy + JSON-LD) **and** `llms.txt`. When a fact changes, update all of them so search engines and AI assistants don't surface contradictions.

## Accessibility patterns (preserve them)

- Skip link targets `<main tabindex="-1">`; global `:focus-visible` brand outline; `prefers-reduced-motion` disables transitions/animations (in `src/input.css`).
- Disclosure menus use native `<details>/<summary>` (desktop "More", mobile nav, coach bios, the collapsible live calendar) with JS handling focusout / outside-click / Escape + focus restore. **Don't** convert these to `role="menu"`.
- Every `target="_blank"` link carries an sr-only "(opens in new window)" cue (or it's appended to the `aria-label`). Keep new external links consistent.
- Decorative images/emoji use `alt=""` / `aria-hidden="true"`. Coach avatars are `aria-hidden` monogram tiles.

## Calendar links (easy to confuse)

- **Book a private lesson** → appointment page `https://calendar.app.google/YWEA7KkwjzbzRbXF7`
- **View Live Calendar** → public calendar embed `https://calendar.google.com/calendar/embed?src=backyardbullieswc%40gmail.com&ctz=America/New_York` (collapsible iframe in the Schedule section + an open-in-new-tab link).

These are **different URLs** — don't merge them.

## Section order & nav

Section order (top to bottom): `hero, about, mission, programs, schedule, pricing, coaches, faq, reviews, contact, store, feed, sponsors`. Section backgrounds **alternate** `ink` / `bg-ink-soft` (the store section is a gradient) — preserve the alternation if you reorder. Keep the desktop and mobile nav order in sync with the scroll order.

## Commits & deploy

- Work directly on `master`; **pushing deploys to production** via GitHub Actions.
- Commit style matches existing history: short, capitalized, imperative subject, **no** ticket or Conventional-Commits prefix (e.g. `Fix transparent mobile menu`).
- Never commit build output (`assets/tailwind.css`), `_site/`, lighthouse JSON, or preview screenshots — they're gitignored or transient.
