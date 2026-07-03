const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const fs = require("fs");
const path = require("path");

/**
 * WCAG 2.2 AA accessibility audit for the Backyard Bullies single-page site.
 *
 * The URL list is read from ../configs/a11y-urls.json (single source of truth,
 * shared with Pa11y and a11y-audit.sh). A11Y_SCOPE selects 'pr' or 'full' — they
 * are identical for this single-page site.
 *
 * Playwright projects cover representative desktop, tablet, phone, and
 * 200%/400% zoom-proxy viewports.
 */
const SCOPE = process.env.A11Y_SCOPE || "full";

const urlsConfigPath = path.join(__dirname, "..", "configs", "a11y-urls.json");
let urlsConfig;
try {
  urlsConfig = JSON.parse(fs.readFileSync(urlsConfigPath, "utf-8"));
} catch (err) {
  throw new Error(
    `Could not read the URL list at ${urlsConfigPath}. ` +
      `Ensure tests/a11y/configs/a11y-urls.json exists and is valid JSON. ` +
      `Original error: ${err.message}`,
  );
}
const PAGES = urlsConfig[SCOPE];
if (!PAGES) {
  throw new Error(
    `Unknown A11Y_SCOPE='${SCOPE}'. Valid scopes: ${Object.keys(urlsConfig)
      .filter((k) => !k.startsWith("_"))
      .join(", ")}`,
  );
}

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

// Third-party embeds we don't author and can't remediate (TikTok injects its own
// untitled iframe + controls; Google Maps/Calendar are cross-origin so axe can
// only flag frame-tested). Excluded from the gate so it measures OUR code only.
const THIRD_PARTY_EXCLUDES = [
  ".tiktok-embed",
  'iframe[src*="google.com/maps"]',
  'iframe[src*="calendar.google.com"]',
];

// No baselined/ignored rules — the gate enforces every WCAG 2.2 AA rule on our
// own markup. (Third-party embeds are excluded above because we can't remediate
// their markup, NOT because the rules are waived.)
const BASELINE_RULES = new Set();

// Reflow (1.4.10) is tested at representative viewport widths. The 640px case
// approximates a 1280px desktop viewport at 200% zoom; 320px approximates 1280px
// at 400% zoom.
const BASELINE_REFLOW = false;
const REFLOW_VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "phone", width: 375, height: 667 },
  { name: "desktop 200% zoom proxy", width: 640, height: 800 },
  { name: "desktop 400% zoom proxy", width: 320, height: 568 },
];

function buildAxe(browserPage) {
  let builder = new AxeBuilder({ page: browserPage }).withTags(WCAG_TAGS);
  for (const sel of THIRD_PARTY_EXCLUDES) builder = builder.exclude(sel);
  return builder;
}

function logViolations(violations, label) {
  for (const violation of violations) {
    console.log(`\n${label}[${violation.impact}] ${violation.id}: ${violation.description}`);
    console.log(`  WCAG: ${violation.tags.filter((t) => t.startsWith("wcag")).join(", ")}`);
    console.log(`  Help: ${violation.helpUrl}`);
    for (const node of violation.nodes.slice(0, 8)) {
      console.log(`  → ${node.target.join(" > ")}`);
      if (node.failureSummary) console.log(`     ${node.failureSummary.replace(/\n/g, " | ")}`);
    }
  }
}

// Partition into gating vs. baselined-debt, log both, return the gating set.
function gatingViolations(results) {
  const blocking = results.violations.filter((v) => !BASELINE_RULES.has(v.id));
  const baselined = results.violations.filter((v) => BASELINE_RULES.has(v.id));
  if (baselined.length) logViolations(baselined, "BASELINE (non-gating) ");
  if (blocking.length) logViolations(blocking, "");
  return blocking;
}

test.describe("WCAG 2.2 AA Compliance", () => {
  for (const page of PAGES) {
    test(`${page.name} (${page.path}) has no WCAG 2.2 AA violations`, async ({
      page: browserPage,
    }) => {
      await browserPage.goto(page.path);
      await browserPage.waitForLoadState("networkidle");

      const results = await buildAxe(browserPage).analyze();
      expect(gatingViolations(results)).toEqual([]);
    });
  }
});

// This site is disclosure-heavy: the mobile nav, the desktop "More" menu, coach
// bios, and the collapsible live calendar are all native <details>/<summary>.
// Their expanded content is hidden from axe on initial load, so open every
// disclosure and re-scan the fully-expanded DOM. Runs at both viewports.
test.describe("WCAG 2.2 AA Compliance — disclosures expanded", () => {
  for (const page of PAGES) {
    test(`${page.name} (${page.path}) has no violations with all disclosures open`, async ({
      page: browserPage,
    }) => {
      await browserPage.goto(page.path);
      await browserPage.waitForLoadState("networkidle");

      const opened = await browserPage.evaluate(() => {
        const els = Array.from(document.querySelectorAll("details"));
        els.forEach((d) => {
          d.open = true;
        });
        return els.length;
      });
      test.skip(opened === 0, "page has no disclosure widgets");

      await browserPage.waitForTimeout(300);

      const results = await buildAxe(browserPage).analyze();
      expect(gatingViolations(results)).toEqual([]);
    });
  }
});

test.describe("WCAG 1.4.10 Reflow", () => {
  for (const page of PAGES) {
    for (const viewport of REFLOW_VIEWPORTS) {
      test(`${page.name} (${page.path}) has no horizontal scroll at ${viewport.name} (${viewport.width}px)`, async ({
        page: browserPage,
      }, testInfo) => {
        test.skip(testInfo.project.name !== "Desktop", "reflow viewport matrix runs once");

        await browserPage.setViewportSize({ width: viewport.width, height: viewport.height });
        await browserPage.goto(page.path, { waitUntil: "domcontentloaded" });
        await browserPage.evaluate(() => {
          if (document.fonts && document.fonts.ready) return document.fonts.ready;
          return Promise.resolve();
        });
        await browserPage.waitForTimeout(300);

        const dimensions = await browserPage.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        const hasHorizontalScroll = dimensions.scrollWidth > dimensions.clientWidth;
        if (BASELINE_REFLOW) {
          if (hasHorizontalScroll) {
            console.warn(
              `BASELINE (non-gating): horizontal scroll at ${viewport.name} (${viewport.width}px) — ` +
                `scrollWidth=${dimensions.scrollWidth}, clientWidth=${dimensions.clientWidth}`,
            );
          }
        } else {
          expect(
            hasHorizontalScroll,
            `${viewport.name} (${viewport.width}px) overflowed: ` +
              `scrollWidth=${dimensions.scrollWidth}, clientWidth=${dimensions.clientWidth}`,
          ).toBe(false);
        }
      });
    }
  }
});

test.describe("WCAG 2.3.3 Reduced Motion", () => {
  for (const page of PAGES) {
    test(`${page.name} (${page.path}) respects prefers-reduced-motion`, async ({
      page: browserPage,
    }) => {
      await browserPage.emulateMedia({ reducedMotion: "reduce" });
      await browserPage.goto(page.path);
      await browserPage.waitForLoadState("networkidle");

      const runningAnimations = await browserPage.evaluate(() => {
        const allElements = document.querySelectorAll("*");
        let animating = 0;
        for (const el of allElements) {
          const style = window.getComputedStyle(el);
          if (
            style.animationName !== "none" &&
            style.animationPlayState === "running" &&
            style.animationDuration !== "0s"
          ) {
            animating++;
          }
        }
        return animating;
      });

      expect(runningAnimations).toBe(0);
    });
  }
});
