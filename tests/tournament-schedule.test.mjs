import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCalendar,
  selectEvents,
  travelMinutes,
  viewFromUrl,
} from "../assets/tournament-schedule.mjs";

const event = {
  name: "Test Tournament",
  start: "2026-12-31",
  end: "2027-01-02",
  index: 0,
  kind: "Hammer / 1st Year GAUSA",
  types: ["hammer", "first-year"],
  location: "Example HS, GA",
  travel: "~2 hr 45 min",
  minutes: 165,
};

test("multi-select uses OR and includes overlapping events only once", () => {
  const firstYear = { ...event, index: 1, types: ["first-year"] };
  const national = { ...event, index: 2, types: ["national"] };
  assert.deepEqual(selectEvents([event, firstYear, national], ["hammer", "first-year"]), [
    event,
    firstYear,
  ]);
  assert.equal(selectEvents([event, firstYear, national]).length, 3);
});

test("travel sorting uses range midpoints and always places unknown estimates last", () => {
  assert.equal(travelMinutes("~1–2 hr"), 90);
  assert.equal(travelMinutes("~2 hr 45 min"), 165);
  assert.equal(travelMinutes("~13 hr"), 780);
  assert.equal(travelMinutes("Varies"), null);
  assert.equal(travelMinutes("—"), null);
  const unknown = { ...event, minutes: null };
  const near = { ...event, minutes: 90 };
  const far = { ...event, minutes: 780 };
  assert.deepEqual(selectEvents([unknown, near, far], [], "distance-asc"), [near, far, unknown]);
  assert.deepEqual(selectEvents([unknown, near, far], [], "distance-desc"), [far, near, unknown]);
});

test("share URLs accept multiple known types and discard invalid values", () => {
  assert.deepEqual(
    viewFromUrl(
      new URL(
        "https://example.com/?tournament-type=hammer&tournament-type=first-year&tournament-type=hammer&tournament-type=bogus&tournament-sort=distance-desc",
      ),
    ),
    {
      types: ["hammer", "first-year"],
      sort: "distance-desc",
    },
  );
  assert.deepEqual(
    viewFromUrl(new URL("https://example.com/?tournament-type=all&tournament-sort=bogus")),
    { types: [], sort: "date" },
  );
});

test("calendar date ranges end on the following day, including year and leap-day boundaries", () => {
  const calendar = buildCalendar([
    event,
    { ...event, name: "Leap day", start: "2028-02-29", end: "2028-02-29" },
  ]);
  assert.match(calendar, /DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270103/);
  assert.match(calendar, /DTSTART;VALUE=DATE:20280229\r\nDTEND;VALUE=DATE:20280301/);
  assert.match(calendar, /STATUS:TENTATIVE/);
  assert.doesNotMatch(calendar, /TZID=/);
});

test("calendar excludes rest and keeps event identifiers stable across exports", () => {
  const rest = { ...event, types: ["rest"] };
  const first = buildCalendar([event, rest], new Date("2026-10-29T12:00:00Z"));
  const second = buildCalendar([event], new Date("2026-11-01T12:00:00Z"));
  assert.equal((first.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.equal(first.match(/UID:[^\r]+/)[0], second.match(/UID:[^\r]+/)[0]);
  assert.equal((buildCalendar([rest]).match(/BEGIN:VEVENT/g) || []).length, 0);
});

test("ICS escapes text, uses CRLF, and folds UTF-8 without breaking characters", () => {
  const name = "Équipe 🏆 ".repeat(15) + ", A; B\\C\nNew line";
  const calendar = buildCalendar([{ ...event, name }]);
  for (const line of calendar.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75);
  assert.equal(calendar.replace(/\r\n/g, "").includes("\n"), false);
  const unfolded = calendar.replace(/\r\n /g, "");
  assert.ok(unfolded.includes("Équipe 🏆 ".repeat(15)));
  assert.ok(unfolded.includes("\\, A\\; B\\\\C\\nNew line"));
  assert.ok(calendar.endsWith("END:VCALENDAR\r\n"));
});
