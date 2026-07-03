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
].map((page) => ({ ...page, html: readFileSync(page.url, "utf8") }));
const homepage = pages[0].html;
const errors = [];

// 1) JSON-LD validity
const blocks = pages.flatMap((page) =>
  [...page.html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (match) => ({ page: page.name, raw: match[1] }),
  ),
);
if (blocks.length === 0) errors.push("No JSON-LD blocks found in <head>");

let faqMarkupCount = null;
blocks.forEach((block, i) => {
  try {
    const data = JSON.parse(block.raw);
    if (data["@type"] === "FAQPage") faqMarkupCount = (data.mainEntity || []).length;
  } catch (e) {
    errors.push(`${block.page} JSON-LD block ${i + 1} is invalid JSON: ${e.message}`);
  }
});

// 2) FAQ parity (visible cards vs FAQPage markup)
const faqStart = homepage.indexOf('id="faq"');
let visibleFaq = null;
if (faqStart !== -1) {
  const slice = homepage.slice(faqStart, homepage.indexOf("</section>", faqStart));
  visibleFaq = (slice.match(/<h3/g) || []).length;
  if (faqMarkupCount !== null && faqMarkupCount !== visibleFaq) {
    errors.push(
      `FAQ mismatch: FAQPage markup has ${faqMarkupCount} questions but the page shows ${visibleFaq} FAQ cards`,
    );
  }
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
  `✓ Content checks passed — ${blocks.length} JSON-LD block(s), FAQ ${visibleFaq}=${faqMarkupCount}, ${anchorCount} anchors resolve across ${pages.length} pages`,
);
