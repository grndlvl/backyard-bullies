export const typeKeys = [
  "hammer",
  "first-year",
  "palmetto",
  "national",
  "open",
  "championship",
  "qualifier",
  "state",
  "rest",
  "gausa",
  "protected",
];

export function travelMinutes(value) {
  const range = value.match(/(\d+)\s*[–-]\s*(\d+)\s*hr/);
  if (range) return ((Number(range[1]) + Number(range[2])) / 2) * 60;
  const hours = value.match(/(\d+)\s*hr/);
  const minutes = value.match(/(\d+)\s*min/);
  return hours || minutes ? Number(hours?.[1] || 0) * 60 + Number(minutes?.[1] || 0) : null;
}

export function selectEvents(events, types = [], sort = "date") {
  return events
    .filter((event) => !types.length || types.some((type) => event.types.includes(type)))
    .sort((a, b) => {
      if (sort.startsWith("distance-")) {
        if (a.minutes === null && b.minutes !== null) return 1;
        if (b.minutes === null && a.minutes !== null) return -1;
        const difference = (a.minutes ?? 0) - (b.minutes ?? 0);
        if (difference) return sort === "distance-desc" ? -difference : difference;
      }
      return a.start.localeCompare(b.start) || a.index - b.index;
    });
}

export function viewFromUrl(url) {
  return {
    types: [
      ...new Set(
        url.searchParams.getAll("tournament-type").filter((type) => typeKeys.includes(type)),
      ),
    ],
    sort: ["distance-asc", "distance-desc"].includes(url.searchParams.get("tournament-sort"))
      ? url.searchParams.get("tournament-sort")
      : "date",
  };
}

function calendarText(value) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

// RFC 5545 §§3.1 and 3.6.1: fold at 75 octets; all-day DTEND is exclusive.
// https://www.rfc-editor.org/rfc/rfc5545.html
function foldLine(line) {
  const encoder = new TextEncoder();
  let result = "";
  let bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) {
      result += "\r\n ";
      bytes = 1;
    }
    result += character;
    bytes += size;
  }
  return result;
}

export function buildCalendar(events, generatedAt = new Date()) {
  const stamp = generatedAt
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Backyard Bullies Wrestling Club//Tournament Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Backyard Bullies 2026-27 Tournaments",
  ];
  for (const event of events.filter((event) => !event.types.includes("rest"))) {
    const end = new Date(`${event.end}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    const slug = event.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    let description =
      `Tentative working schedule. Type: ${event.kind}. Estimated travel: ${event.travel}. ` +
      "All-day entry; confirm event times, registration, and club attendance with coaches.";
    if (event.name === "North Paulding Hammer")
      description += " Primary club selection for January 31.";
    if (event.name === "Beginner's Bash")
      description +=
        " January 31 first-year option; North Paulding Hammer is the primary club selection.";
    lines.push(
      "BEGIN:VEVENT",
      `UID:bybwc-${event.start}-${slug}@backyardbullies-wc.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${event.start.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replace(/-/g, "")}`,
      `SUMMARY:${calendarText(event.name)}`,
      `LOCATION:${calendarText(event.location)}`,
      `DESCRIPTION:${calendarText(description)}`,
      "STATUS:TENTATIVE",
      "TRANSP:TRANSPARENT",
      "URL:https://www.backyardbullies-wc.com/#tournament-schedule",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function readSchedule(table) {
  return [...table.querySelectorAll(".tournament-entry")].map((row, index) => {
    const dates = [...row.cells[0].querySelectorAll("time")].map((time) => time.dateTime);
    const place = row.cells[2].textContent.trim();
    const state = row.cells[3].textContent.trim();
    const travel = row.cells[4].textContent.trim();
    return {
      row,
      home: row.parentElement,
      index,
      start: dates[0],
      end: dates.at(-1),
      name: row.cells[1].querySelector("p").textContent.trim(),
      location: place === state ? place : `${place}, ${state}`,
      travel,
      minutes: travelMinutes(travel),
      kind: row.dataset.tournamentKind,
      types: row.dataset.tournamentTypes.split(" "),
    };
  });
}

function installTooltips() {
  let activeButton;
  let activeTip;
  let timer;
  function close() {
    clearTimeout(timer);
    if (activeTip) activeTip.hidden = true;
    activeButton = activeTip = null;
  }
  function show(button) {
    close();
    activeButton = button;
    activeTip = document.getElementById(button.dataset.tournamentTooltip);
    activeTip.hidden = false;
    position();
  }
  function position() {
    if (!activeButton) return;
    const bounds = activeButton.getBoundingClientRect();
    if (
      (bounds.bottom < 0 || bounds.top > window.innerHeight) &&
      document.activeElement !== activeButton
    ) {
      deferClose();
      return;
    }
    const tip = activeTip.getBoundingClientRect();
    const left = Math.max(8, Math.min(bounds.left, window.innerWidth - tip.width - 8));
    const preferredTop =
      bounds.bottom + 8 + tip.height < window.innerHeight
        ? bounds.bottom + 8
        : Math.max(8, bounds.top - tip.height - 8);
    activeTip.style.left = `${left}px`;
    activeTip.style.top = `${Math.max(8, Math.min(preferredTop, window.innerHeight - tip.height - 8))}px`;
  }
  function deferClose() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (
        activeButton &&
        document.activeElement !== activeButton &&
        !activeButton.matches(":hover") &&
        !activeTip.matches(":hover")
      )
        close();
    }, 150);
  }
  document.querySelectorAll("[data-tournament-tooltip]").forEach((button) => {
    button.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "touch") show(button);
    });
    button.addEventListener("pointerleave", deferClose);
    button.addEventListener("focus", () => show(button));
    button.addEventListener("blur", deferClose);
    button.addEventListener("click", () => show(button));
  });
  document.querySelectorAll(".tournament-tooltip").forEach((tip) => {
    tip.addEventListener("pointerenter", () => clearTimeout(timer));
    tip.addEventListener("pointerleave", deferClose);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!activeButton?.contains(event.target) && !activeTip?.contains(event.target)) close();
  });
  window.addEventListener("scroll", position, { passive: true });
  window.addEventListener("resize", position);
  return close;
}

function initializeSchedule() {
  const table = document.getElementById("tournament-table");
  if (!table) return;
  const events = readSchedule(table);
  const controls = document.getElementById("tournament-controls");
  const checkboxes = [...controls.querySelectorAll('input[name="tournament-type"]')];
  const sortSelect = document.getElementById("tournament-sort");
  const dateHeading = document.getElementById("tournament-date-heading");
  const distanceHeading = document.getElementById("tournament-distance-heading");
  const dateButton = document.getElementById("tournament-sort-date");
  const distanceButton = document.getElementById("tournament-sort-distance");
  const allButton = document.getElementById("tournament-all");
  const exportButton = document.getElementById("tournament-export");
  const status = document.getElementById("tournament-status");
  const sortedBody = document.getElementById("tournament-sorted");
  const months = [...table.querySelectorAll("[data-tournament-month]")];
  const closeTooltips = installTooltips();
  let selection = [];

  function apply({ types, sort }) {
    closeTooltips();
    checkboxes.forEach((checkbox) => {
      checkbox.checked = types.includes(checkbox.value);
    });
    sortSelect.value = sort;
    dateHeading.setAttribute("aria-sort", sort === "date" ? "ascending" : "none");
    distanceHeading.setAttribute(
      "aria-sort",
      sort === "date" ? "none" : sort === "distance-asc" ? "ascending" : "descending",
    );
    dateButton.querySelector("[data-sort-icon]").textContent = sort === "date" ? "↑" : "↕";
    distanceButton.querySelector("[data-sort-icon]").textContent =
      sort === "date" ? "↕" : sort === "distance-asc" ? "↑" : "↓";
    distanceButton.setAttribute(
      "aria-label",
      sort === "distance-asc" ? "Sort by longest travel time" : "Sort by shortest travel time",
    );
    document.getElementById("tournament-filter-summary").textContent = types.length
      ? `${types.length} type${types.length === 1 ? "" : "s"} selected`
      : "All types";
    allButton.setAttribute("aria-pressed", String(!types.length));
    selection = selectEvents(events, types, sort);
    const visible = new Set(selection);
    events.forEach((event) => {
      event.row.hidden = !visible.has(event);
      event.row.querySelector(".tournament-year").hidden = sort === "date";
    });
    if (sort === "date") {
      events.forEach((event) => event.home.append(event.row));
      sortedBody.hidden = true;
      months.forEach((month) => {
        month.hidden = !events.some((event) => event.home === month && visible.has(event));
      });
    } else {
      sortedBody.replaceChildren(...selectEvents(events, [], sort).map((event) => event.row));
      sortedBody.hidden = false;
      months.forEach((month) => {
        month.hidden = true;
      });
    }
    const count = selection.filter((event) => !event.types.includes("rest")).length;
    status.textContent = `Showing ${selection.length} of ${events.length} schedule entries · ${count} tournament${count === 1 ? "" : "s"} to export`;
    if (sort !== "date")
      status.textContent +=
        sort === "distance-asc" ? " · Shortest travel first" : " · Longest travel first";
    exportButton.disabled = count === 0;
    exportButton.textContent = `Download selection (${count} event${count === 1 ? "" : "s"}, ICS)`;
  }

  function update() {
    const types = checkboxes
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => checkbox.value);
    const sort = sortSelect.value;
    const url = new URL(window.location.href);
    url.searchParams.delete("tournament-type");
    types.forEach((type) => url.searchParams.append("tournament-type", type));
    url.searchParams.delete("tournament-sort");
    if (sort !== "date") url.searchParams.set("tournament-sort", sort);
    url.hash = "tournament-schedule";
    if (url.href !== window.location.href) window.history.pushState(null, "", url);
    apply({ types, sort });
  }
  controls.addEventListener("change", update);
  sortSelect.addEventListener("change", update);
  dateButton.addEventListener("click", () => {
    sortSelect.value = "date";
    update();
  });
  distanceButton.addEventListener("click", () => {
    sortSelect.value = sortSelect.value === "distance-asc" ? "distance-desc" : "distance-asc";
    update();
  });
  allButton.addEventListener("click", () => {
    checkboxes.forEach((checkbox) => {
      checkbox.checked = false;
    });
    update();
  });
  exportButton.addEventListener("click", () => {
    const blob = new Blob([buildCalendar(selection)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "backyard-bullies-2026-27-selection.ics";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  document.querySelectorAll("[data-tournament-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      event.preventDefault();
      const url = new URL(link.href);
      window.history.pushState(null, "", url);
      apply(viewFromUrl(url));
      const heading = document.getElementById("tournament-heading");
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      document.getElementById("tournament-schedule").scrollIntoView();
    });
  });
  window.addEventListener("popstate", () => apply(viewFromUrl(new URL(window.location.href))));
  apply(viewFromUrl(new URL(window.location.href)));
  controls.hidden = false;
  document.getElementById("tournament-mobile-sort").hidden = false;
}

if (typeof document !== "undefined") initializeSchedule();
