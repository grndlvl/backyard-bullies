const fs = require("fs");
const path = require("path");

// Dynamically find a Chrome binary from the Puppeteer cache or a Playwright
// installation. Avoids version-mismatch errors between Pa11y's bundled Puppeteer
// and whatever Chromium is actually installed (locally or in CI).
function findChromeBinary() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const cacheDir =
    process.env.PUPPETEER_CACHE_DIR || path.join(require("os").homedir(), ".cache", "puppeteer");
  const chromeDir = path.join(cacheDir, "chrome");
  if (fs.existsSync(chromeDir)) {
    const versions = fs.readdirSync(chromeDir).sort().reverse();
    for (const ver of versions) {
      const bin = path.join(chromeDir, ver, "chrome-linux64", "chrome");
      if (fs.existsSync(bin)) return bin;
    }
  }

  const pwCache = path.join(require("os").homedir(), ".cache", "ms-playwright");
  if (fs.existsSync(pwCache)) {
    const dirs = fs
      .readdirSync(pwCache)
      .filter((d) => d.startsWith("chromium-"))
      .sort()
      .reverse();
    for (const dir of dirs) {
      const bin = path.join(pwCache, dir, "chrome-linux", "chrome");
      if (fs.existsSync(bin)) return bin;
    }
  }

  const systemPaths = [
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ];
  for (const p of systemPaths) {
    if (fs.existsSync(p)) return p;
  }

  return undefined;
}

// BASE_URL: where the locally served build is reachable (set by a11y-audit.sh).
// A11Y_SCOPE: 'pr' or 'full' — identical for this single-page site.
// A11Y_RUNNERS: comma-separated subset of 'axe,htmlcs'. Default both.
const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:8181";
const SCOPE = process.env.A11Y_SCOPE || "full";
const RUNNERS = (process.env.A11Y_RUNNERS || "axe,htmlcs")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const chromePath = findChromeBinary();

const config = {
  defaults: {
    standard: "WCAG2AA",
    runners: RUNNERS,
    timeout: 30000,
    wait: 2000,
    chromeLaunchConfig: {
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    },
    // Third-party embeds we don't author / can't remediate (TikTok injects its
    // own untitled iframe; Maps/Calendar are cross-origin). Hidden before the
    // scan so the gate measures our own markup only — mirrors the axe excludes
    // in ../tests/wcag-audit.spec.js.
    hideElements:
      '.tiktok-embed, iframe[src*="google.com/maps"], iframe[src*="calendar.google.com"]',
    // No suppressions — every WCAG 2.2 AA rule is enforced on our own markup.
    ignore: [],
  },
  urls: [],
};

const urlsConfigPath = path.join(__dirname, "a11y-urls.json");
let urlsConfig;
try {
  urlsConfig = require(urlsConfigPath);
} catch (err) {
  throw new Error(
    `Could not read the URL list at ${urlsConfigPath}. ` +
      `Ensure a11y-urls.json exists alongside this config and is valid JSON. ` +
      `Original error: ${err.message}`,
  );
}
const pages = urlsConfig[SCOPE];
if (!pages) {
  throw new Error(
    `Unknown A11Y_SCOPE='${SCOPE}'. Valid scopes: ${Object.keys(urlsConfig)
      .filter((k) => !k.startsWith("_"))
      .join(", ")}`,
  );
}

// Slash-safe join: tolerate a trailing slash on BASE_URL or a missing leading slash on path.
const base = BASE_URL.replace(/\/+$/, "");
config.urls = pages.map((p) => `${base}${p.path.startsWith("/") ? p.path : "/" + p.path}`);

if (chromePath) {
  config.defaults.chromeLaunchConfig.executablePath = chromePath;
}

module.exports = config;
