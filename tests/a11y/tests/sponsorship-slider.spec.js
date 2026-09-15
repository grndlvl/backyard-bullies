const { test, expect } = require("@playwright/test");

test.describe("Sponsorship level slider", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/sponsorship/", { waitUntil: "domcontentloaded" });
  });

  test("supports keyboard selection and concise announcements", async ({ page }) => {
    const range = page.getByLabel("Choose a sponsorship level");
    const badge = page.locator("#sponsor-tier-badge");

    await expect(range).toHaveAttribute("aria-valuetext", "Gold Sponsor, $1,000");
    await expect(badge).toHaveText("Most Popular");

    await range.focus();
    await range.press("ArrowRight");

    await expect(range).toHaveAttribute("aria-valuetext", "Platinum Sponsor, $2,500");
    await expect(page.locator("#sponsor-tier-name")).toHaveText("Platinum Sponsor");
    await expect(badge).toBeHidden();
    await expect(page.locator("#sponsor-tier-benefits li")).toHaveCount(7);
    await expect(page.locator("#sponsor-tier-status")).toContainText(
      "Selected Platinum Sponsor at $2,500",
    );

    await range.press("End");
    await expect(range).toHaveAttribute("aria-valuetext", "Diamond Sponsor, $5,000");
    await expect(badge).toHaveText("Maximum Impact");
    await expect(page.locator("#sponsor-tier-benefits li")).toHaveCount(8);

    await range.press("Home");
    await expect(range).toHaveAttribute("aria-valuetext", "Bronze Sponsor, $250");
    await expect(page.locator("#sponsor-tier-benefits li")).toHaveCount(3);
  });

  test("updates the tier-specific contact link", async ({ page }) => {
    const range = page.getByLabel("Choose a sponsorship level");
    await range.focus();
    await range.press("End");

    const email = page.locator("#sponsor-tier-email");
    await expect(email).toHaveText("Ask about Diamond sponsorship");
    await expect(email).toHaveAttribute("href", /Diamond%20Sponsor%20Interest/);
  });

  test("provides a 44 pixel minimum slider target", async ({ page }) => {
    const box = await page.getByLabel("Choose a sponsorship level").boundingBox();
    expect(box).not.toBeNull();
    expect(box.height).toBeGreaterThanOrEqual(44);
  });
});
