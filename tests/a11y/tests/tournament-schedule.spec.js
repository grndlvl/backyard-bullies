const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const { readFile } = require("node:fs/promises");

const visibleRows = (page) => page.locator(".tournament-entry:visible");
const checkbox = (page, type) => page.locator(`#tournament-controls input[value="${type}"]`);
const normalizeCalendar = (text) => text.replace(/^DTSTAMP:[^\r\n]+/gm, "DTSTAMP:STAMP");
const downloadText = async (download) => readFile(await download.path(), "utf8");

async function sortSchedule(page, value) {
  const select = page.getByLabel("Sort schedule");
  if (await select.isVisible()) return select.selectOption(value);
  if (value === "date") return page.locator("#tournament-sort-date").click();
  const expected = value === "distance-asc" ? "ascending" : "descending";
  for (
    let i = 0;
    i < 2 &&
    (await page.locator("#tournament-distance-heading").getAttribute("aria-sort")) !== expected;
    i++
  ) {
    await page.locator("#tournament-sort-distance").click();
  }
  await expect(page.locator("#tournament-distance-heading")).toHaveAttribute("aria-sort", expected);
}

test.beforeEach(async ({ page }) => {
  await page.route(/googletagmanager|tiktok\.com|google\.com\/(maps|calendar)/, (route) =>
    route.abort(),
  );
  await page.goto("/#tournament-schedule", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#tournament-controls")).toBeVisible();
  await expect(page.locator("#tournament-filter-panel")).not.toHaveAttribute("open");
  await page.locator("#tournament-filter-panel summary").click();
});

test("tournament schedule is grouped under Events, separate from weekly training", async ({
  page,
}) => {
  await expect(page.locator("#camps #tournament-schedule")).toHaveCount(1);
  await expect(page.locator("#schedule #tournament-schedule")).toHaveCount(0);
  const eventNavigation = page.getByRole("navigation", { name: "Event sections" });
  await expect(eventNavigation.getByRole("link", { name: "Tournament schedule" })).toHaveAttribute(
    "href",
    "#tournament-schedule",
  );
});

test("multiple types use OR, keep overlap once, and support keyboard and history", async ({
  page,
}) => {
  await expect(visibleRows(page)).toHaveCount(21);
  await checkbox(page, "hammer").focus();
  await page.keyboard.press("Space");
  await expect(visibleRows(page)).toHaveCount(5);
  await checkbox(page, "first-year").focus();
  await page.keyboard.press("Space");
  await expect(visibleRows(page)).toHaveCount(10);
  await expect(visibleRows(page).filter({ hasText: "Iron Tiger Rumble" })).toHaveCount(1);
  await expect(page.locator("#tournament-status")).toHaveText(
    "Showing 10 of 21 schedule entries · 10 tournaments to export",
  );
  await page.goBack();
  await expect(visibleRows(page)).toHaveCount(5);
  await expect(checkbox(page, "first-year")).not.toBeChecked();
  await page.goForward();
  await expect(visibleRows(page)).toHaveCount(10);
  await page.reload();
  await page.locator("#tournament-filter-panel summary").click();
  await expect(checkbox(page, "hammer")).toBeChecked();
  await expect(checkbox(page, "first-year")).toBeChecked();
  await page.getByRole("button", { name: "All types", exact: true }).click();
  await expect(visibleRows(page)).toHaveCount(21);
});

test("existing schedule priority links open a filtered list, move focus, and survive a fresh load", async ({
  page,
}) => {
  const link = page
    .locator("#tournament-schedule")
    .getByRole("link", { name: "SC USAW/Palmetto", exact: true });
  await expect(page.locator("footer [data-tournament-link]")).toHaveCount(0);
  const href = await link.getAttribute("href");
  await link.click();
  await expect(visibleRows(page)).toHaveCount(3);
  await expect(page.locator("#tournament-heading")).toBeFocused();
  await expect(visibleRows(page).filter({ hasText: "Palmetto League Championship" })).toHaveCount(
    1,
  );
  await page.goto(href);
  await expect(checkbox(page, "palmetto")).toBeChecked();
  await expect(visibleRows(page)).toHaveCount(3);
});

test("distance sorting is global, shows years, and restores month grouping", async ({ page }) => {
  await expect(page.locator(".tournament-year:visible")).toHaveCount(0);
  await sortSchedule(page, "distance-asc");
  await expect(visibleRows(page).first()).toContainText("White Knoll Open");
  await expect(page.locator(".tournament-year:visible")).toHaveCount(21);
  await expect(page.locator("[data-tournament-month]:visible")).toHaveCount(0);
  await page.goBack();
  await expect(page.locator("#tournament-date-heading")).toHaveAttribute("aria-sort", "ascending");
  await page.goForward();
  await expect(page.locator("#tournament-distance-heading")).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await sortSchedule(page, "distance-desc");
  await expect(visibleRows(page).first()).toContainText("Preseason Nationals");
  const tail = await visibleRows(page).evaluateAll((rows) =>
    rows.slice(-5).map((row) => row.cells[4].textContent.trim()),
  );
  expect(tail.every((text) => text === "—" || text === "Varies")).toBe(true);
  await checkbox(page, "first-year").check();
  await expect(visibleRows(page)).toHaveCount(6);
  await expect(visibleRows(page).first()).toContainText("Iron Tiger Rumble");
  await sortSchedule(page, "date");
  await expect(page.locator("[data-tournament-month]:visible")).toHaveCount(2);
  await expect(visibleRows(page).first()).toContainText("Life U Kid 1st Year");
  await expect(page.locator(".tournament-year:visible")).toHaveCount(0);
});

test("type tooltips work with keyboard, hover, tap, and Escape without losing focus", async ({
  page,
}, testInfo) => {
  const trigger = page.locator(
    '.tournament-entry:visible button[aria-label="About USAW National"]:visible',
  );
  const tooltip = page.locator("#tournament-tip-usaw-national");
  await trigger.scrollIntoViewIfNeeded();
  await trigger.focus();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();
  await expect(trigger).toBeFocused();
  if (testInfo.project.use.hasTouch) await trigger.tap();
  else await trigger.click();
  await expect(tooltip).toBeVisible();
  await page.locator("#tournament-heading").click();
  await expect(tooltip).toBeHidden();
  if (!testInfo.project.use.hasTouch) {
    await trigger.hover();
    await expect(tooltip).toBeVisible();
    await tooltip.hover();
    await expect(tooltip).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tooltip).toBeHidden();
  }
});

test("all and filtered calendars preserve dates and exclude rest and duplicates", async ({
  page,
}) => {
  const allDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download all tournaments" }).click();
  const all = await downloadText(await allDownload);
  expect(all.match(/BEGIN:VEVENT/g)).toHaveLength(17);
  const currentDownload = page.waitForEvent("download");
  await page.locator("#tournament-export").click();
  const current = await downloadText(await currentDownload);
  expect(normalizeCalendar(current)).toBe(normalizeCalendar(all));
  expect(current).toContain("DTSTART;VALUE=DATE:20261028\r\nDTEND;VALUE=DATE:20261102");
  expect(current).toContain("DTSTART;VALUE=DATE:20270227\r\nDTEND;VALUE=DATE:20270301");
  await checkbox(page, "hammer").check();
  await checkbox(page, "first-year").check();
  const filteredDownload = page.waitForEvent("download");
  await page.locator("#tournament-export").click();
  const filtered = await downloadText(await filteredDownload);
  expect(filtered.match(/BEGIN:VEVENT/g)).toHaveLength(10);
  expect(new Set(filtered.match(/^UID:.+/gm)).size).toBe(10);
  expect(filtered).not.toContain("SUMMARY:Preseason Nationals");
  await page.getByRole("button", { name: "All types", exact: true }).click();
  await checkbox(page, "rest").check();
  await expect(visibleRows(page)).toHaveCount(4);
  await expect(page.locator("#tournament-export")).toBeDisabled();
});

test("filtered controls and visible tooltip have no axe violations or horizontal overflow", async ({
  page,
}) => {
  await checkbox(page, "hammer").check();
  await checkbox(page, "first-year").check();
  await sortSchedule(page, "distance-asc");
  await page.locator(".tournament-entry:visible .tournament-type:visible").first().focus();
  const scan = await new AxeBuilder({ page })
    .include("#tournament-schedule")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(scan.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test("without JavaScript the full schedule and complete calendar remain available", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(`${baseURL}/?tournament-type=hammer#tournament-schedule`, {
      waitUntil: "domcontentloaded",
    });
    await expect(visibleRows(page)).toHaveCount(21);
    await expect(page.locator("#tournament-controls")).toBeHidden();
    const response = await page.request.get(`${baseURL}/2026-27-tournament-schedule.ics`);
    expect(response.ok()).toBe(true);
    expect((await response.text()).match(/BEGIN:VEVENT/g)).toHaveLength(17);
  } finally {
    await context.close();
  }
});

test("schema matches the complete tentative schedule and expired event is removed", async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const schema = JSON.parse(document.getElementById("tournament-schema").textContent);
    const rows = [...document.querySelectorAll(".tournament-entry")].filter(
      (row) => !row.dataset.tournamentTypes.split(" ").includes("rest"),
    );
    return {
      schema,
      entries: rows.map((row) => ({
        name: row.cells[1].querySelector("p").textContent.trim(),
        dates: [...row.cells[0].querySelectorAll("time")].map((time) => time.dateTime),
        place: row.cells[2].textContent.trim(),
        state: row.cells[3].textContent.trim(),
        kind: row.dataset.tournamentKind,
      })),
    };
  });
  expect(result.schema.numberOfItems).toBe(17);
  expect(result.schema.itemListElement).toHaveLength(17);
  result.schema.itemListElement.forEach(({ item, position }, index) => {
    const entry = result.entries[index];
    expect(position).toBe(index + 1);
    expect(item["@type"]).toBe("SportsEvent");
    expect(item.name).toBe(entry.name);
    expect(item.startDate).toBe(entry.dates[0]);
    expect(item.endDate).toBe(entry.dates.at(-1));
    expect(item.location.name).toBe(entry.place);
    expect(item.location.address.addressRegion).toBe(entry.state);
    expect(item.description).toContain(entry.kind);
    expect(item.description).toContain("Tentative");
    expect(item.eventStatus).toBeUndefined();
  });
  expect(await page.content()).not.toMatch(/trunk.?or.?treat/i);
  await page
    .locator("#tournament-schedule")
    .getByRole("link", { name: "Protected", exact: true })
    .click();
  await expect(visibleRows(page)).toHaveCount(5);
  await expect(page.locator("#tournament-filter-summary")).toHaveText("1 type selected");
});
