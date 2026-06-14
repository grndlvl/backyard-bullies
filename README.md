# Backyard Bullies Wrestling Club — Website

Single-page website for **Backyard Bullies Wrestling Club** (Augusta, GA / CSRA).
Plain HTML + [Tailwind CSS Play CDN](https://tailwindcss.com) + a little vanilla JS. **No build step** — it's just static files, ready for GitHub Pages.

## Files

```
index.html          The entire site (one page, scroll sections)
images/             Logo, hero/cover, gallery photos, favicons, OG share image
.nojekyll           Tells GitHub Pages to serve files as-is
CNAME               (optional) custom domain — see below
README.md           This file
```

## Edit the content

Everything lives in `index.html`. Common edits:

| What | Where to look |
|------|---------------|
| Phone number | Search for `7062500186` (and the display text `706-250-0186`) |
| Address | Search for `Bobby Jones Expressway` |
| Schedule times | The **Weekly Training Schedule** section |
| Programs | The **Programs** section cards |
| Tournament results | The **On the Podium** section |
| Social links | Search for `facebook.com`, `instagram.com`, `tiktok.com` |

## 💳 Square payments — IMPORTANT (action needed)

The **Membership & Payments** section has buttons that currently point to a placeholder
(`https://square.link/u/REPLACE_ME`). To make them work:

1. Log in to your **Square Dashboard** → **Online** → **Payment Links** (or **Checkout Links**).
2. Create a payment link for each item (e.g. *Monthly Membership*, *Drop-In Class*). Square gives you a URL like `https://square.link/u/abc123`.
3. In `index.html`, find each `data-square-link` button and replace `https://square.link/u/REPLACE_ME` with your real link.
4. Update the prices: find `data-price="monthly"` / `data-price="dropin"` and replace the `—` with the dollar amount.

> If you have a full **Square Online store**, you can instead point the "Open Square Store"
> button to your `*.square.site` URL.

## Photos

Photos in `images/` were pulled from the club's Facebook page. The gallery thumbnails
(`g1`–`g8.jpg`) are low-resolution (160×160). For a sharper gallery, drop in higher-res
photos with the same filenames, or replace `cover.jpg` (hero) and `action1.jpg` (about section).

## Deploy to GitHub Pages

1. Create a new GitHub repository (e.g. `backyard-bullies-site`).
2. Push these files to the `main` branch:
   ```bash
   git init
   git add .
   git commit -m "Initial site"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo>.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   select **`main` / root**, save.
4. Your site goes live at `https://<your-username>.github.io/<repo>/` within a minute or two.

### Custom domain (optional)

1. Edit the `CNAME` file to contain only your domain (e.g. `backyardbullieswc.com`).
2. At your domain registrar, add DNS records pointing to GitHub Pages
   ([GitHub's guide](https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site)).
3. In **Settings → Pages**, enter the custom domain and enable **Enforce HTTPS**.

> Also update the `<link rel="canonical">`, `og:url`, and the JSON-LD `image`/`sameAs`
> URLs in `index.html` to match your final domain.

## Notes

- **Accessibility:** semantic landmarks, skip link, keyboard-operable mobile menu, alt text,
  visible focus rings, AA-contrast colors, and `prefers-reduced-motion` support are built in.
- **Performance tip (optional):** the Tailwind Play CDN compiles styles in the browser. For
  the fastest possible load you can later pre-compile with the Tailwind CLI, but it's not
  required and the site is plenty fast for its size.
