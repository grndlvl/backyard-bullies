const { defineConfig, devices } = require("@playwright/test");

/**
 * Accessibility testing Playwright configuration for the Backyard Bullies site.
 *
 * Runs axe-core WCAG 2.2 AA audits across representative desktop, tablet,
 * phone, and zoom-proxy viewports against a locally served build. BASE_URL is
 * provided by ../scripts/a11y-audit.sh, which builds Tailwind and serves the
 * site before invoking Playwright.
 */
function getBaseUrl() {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  return "http://127.0.0.1:8181";
}

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["html", { open: "never", outputFolder: "reports/playwright-report" }], ["list"]],
  use: {
    baseURL: getBaseUrl(),
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "Desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "Desktop 200% zoom proxy",
      use: { ...devices["Desktop Chrome"], viewport: { width: 640, height: 800 } },
    },
    {
      name: "Tablet",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "Phone",
      use: { ...devices["Pixel 5"], viewport: { width: 375, height: 667 } },
    },
    {
      name: "Mobile 400% zoom proxy",
      use: { ...devices["Pixel 5"], viewport: { width: 320, height: 568 } },
    },
  ],
  outputDir: "reports/playwright-output",
});
