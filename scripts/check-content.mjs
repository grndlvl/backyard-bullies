#!/usr/bin/env node
// Content integrity checks for index.html:
//  1. Every JSON-LD block is valid JSON
//  2. The FAQPage markup has the same number of Q&As as the visible FAQ cards
//  3. Every in-page anchor (href="#id") resolves to a real element id
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const errors = [];

// 1) JSON-LD validity
const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
  (m) => m[1],
);
if (blocks.length === 0) errors.push("No JSON-LD blocks found in <head>");

let faqMarkupCount = null;
blocks.forEach((raw, i) => {
  try {
    const data = JSON.parse(raw);
    if (data["@type"] === "FAQPage") faqMarkupCount = (data.mainEntity || []).length;
  } catch (e) {
    errors.push(`JSON-LD block ${i + 1} is invalid JSON: ${e.message}`);
  }
});

// 2) FAQ parity (visible cards vs FAQPage markup)
const faqStart = html.indexOf('id="faq"');
let visibleFaq = null;
if (faqStart !== -1) {
  const slice = html.slice(faqStart, html.indexOf("</section>", faqStart));
  visibleFaq = (slice.match(/<h3/g) || []).length;
  if (faqMarkupCount !== null && faqMarkupCount !== visibleFaq) {
    errors.push(
      `FAQ mismatch: FAQPage markup has ${faqMarkupCount} questions but the page shows ${visibleFaq} FAQ cards`,
    );
  }
}

// 3) Internal anchor integrity
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
for (const a of anchors) {
  if (!ids.has(a)) errors.push(`Dangling anchor: href="#${a}" has no matching element id`);
}

if (errors.length) {
  console.error("✖ Content checks failed:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(
  `✓ Content checks passed — ${blocks.length} JSON-LD block(s), FAQ ${visibleFaq}=${faqMarkupCount}, ${anchors.length} anchors resolve`,
);
