#!/usr/bin/env node
// Content integrity checks for public HTML pages:
//  1. Every JSON-LD block is valid JSON
//  2. The FAQPage markup has the same number of Q&As as the visible FAQ cards
//  3. Every in-page anchor (href="#id") resolves to a real element id
import { readFileSync } from "node:fs";

const pages = [
  { name: "index.html", url: new URL("../index.html", import.meta.url) },
  {
    name: "parents-night-out/index.html",
    url: new URL("../parents-night-out/index.html", import.meta.url),
  },
  {
    name: "homeschool-functional-fitness/index.html",
    url: new URL("../homeschool-functional-fitness/index.html", import.meta.url),
  },
  {
    name: "scholarship/index.html",
    url: new URL("../scholarship/index.html", import.meta.url),
  },
].map((page) => ({ ...page, html: readFileSync(page.url, "utf8") }));
const errors = [];

// 1) JSON-LD validity
const blocks = pages.flatMap((page) =>
  [...page.html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (match) => ({ page, raw: match[1] }),
  ),
);
if (blocks.length === 0) errors.push("No JSON-LD blocks found in <head>");

blocks.forEach((block, i) => {
  try {
    const data = JSON.parse(block.raw);
    if (data["@type"] === "FAQPage") block.page.faqMarkupCount = (data.mainEntity || []).length;
  } catch (e) {
    errors.push(`${block.page.name} JSON-LD block ${i + 1} is invalid JSON: ${e.message}`);
  }
});

// 2) FAQ parity, per page (visible cards vs that page's FAQPage markup)
const faqSummary = [];
for (const page of pages) {
  const faqStart = page.html.indexOf('id="faq"');
  if (faqStart === -1 && page.faqMarkupCount === undefined) continue;
  if (faqStart === -1) {
    errors.push(`${page.name} has FAQPage markup but no visible FAQ section (id="faq")`);
    continue;
  }
  const slice = page.html.slice(faqStart, page.html.indexOf("</section>", faqStart));
  const visibleFaq = (slice.match(/<h3/g) || []).length;
  if (page.faqMarkupCount === undefined) {
    errors.push(`${page.name} has a visible FAQ section but no FAQPage JSON-LD`);
    continue;
  }
  if (page.faqMarkupCount !== visibleFaq) {
    errors.push(
      `${page.name} FAQ mismatch: FAQPage markup has ${page.faqMarkupCount} questions but the page shows ${visibleFaq} FAQ cards`,
    );
  }
  faqSummary.push(`${page.name} ${visibleFaq}=${page.faqMarkupCount}`);
}

// 3) Internal anchor integrity
let anchorCount = 0;
for (const page of pages) {
  const ids = new Set([...page.html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  const anchors = [...page.html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
  anchorCount += anchors.length;
  for (const anchor of anchors) {
    if (!ids.has(anchor)) {
      errors.push(`${page.name} dangling anchor: href="#${anchor}" has no matching element id`);
    }
  }
}

if (errors.length) {
  console.error("✖ Content checks failed:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(
  `✓ Content checks passed — ${blocks.length} JSON-LD block(s), FAQ parity ${faqSummary.join(", ")}, ${anchorCount} anchors resolve across ${pages.length} pages`,
);
