#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = resolve(projectRoot, getOption("--config") ?? "redirects.json");
const shouldSync = process.argv.includes("--sync");
const shouldCheck = process.argv.includes("--check");

if (shouldSync === shouldCheck) {
  fail("Use exactly one mode: --check or --sync");
}

let config;
try {
  config = JSON.parse(readFileSync(configPath, "utf8"));
} catch (error) {
  fail(`Unable to read ${configPath}: ${error.message}`);
}

const redirects = validateConfig(config);
console.log(`✓ Redirect configuration is valid — ${redirects.length} redirect(s)`);

if (shouldCheck) {
  process.exit(0);
}

if (redirects.length === 0 && !config.allowEmpty) {
  console.log("○ Cloudflare sync skipped — set allowEmpty to true to intentionally clear the list");
  process.exit(0);
}

const accountId = requireEnvironmentVariable("CLOUDFLARE_ACCOUNT_ID");
const apiToken = requireEnvironmentVariable("CLOUDFLARE_API_TOKEN");
const apiBase = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;

const listsResponse = await cloudflareRequest(`${apiBase}/rules/lists`);
const matchingLists = listsResponse.result.filter(
  (list) => list.name === config.cloudflareList && list.kind === "redirect",
);
if (matchingLists.length !== 1) {
  fail(
    `Expected exactly one redirect list named "${config.cloudflareList}", found ${matchingLists.length}`,
  );
}
const list = matchingLists[0];

console.log(
  `Synchronizing ${redirects.length} redirect(s) to Cloudflare list "${config.cloudflareList}"…`,
);

const updateResponse = await cloudflareRequest(`${apiBase}/rules/lists/${list.id}/items`, {
  method: "PUT",
  body: JSON.stringify(redirects),
});

await waitForOperation(updateResponse.result.operation_id);
console.log(`✓ Cloudflare redirect list synchronized — ${redirects.length} redirect(s)`);

function validateConfig(value) {
  const errors = [];

  if (!value || Array.isArray(value) || typeof value !== "object") {
    fail("redirects.json must contain an object");
  }

  if (typeof value.allowEmpty !== "boolean") {
    errors.push("allowEmpty must be true or false");
  }
  if (typeof value.cloudflareList !== "string" || !/^[a-z0-9_]{1,50}$/.test(value.cloudflareList)) {
    errors.push(
      "cloudflareList must contain 1–50 lowercase letters, numbers, or underscore characters",
    );
  }
  if (!Array.isArray(value.redirects)) {
    errors.push("redirects must be an array");
  }
  if (errors.length) fail(errors.join("\n"));

  if (value.redirects.length > 10_000) {
    errors.push("The Cloudflare Free plan supports at most 10,000 redirect items");
  }

  const sources = new Set();
  const allowedKeys = new Set([
    "source",
    "target",
    "statusCode",
    "preserveQueryString",
    "includeSubdomains",
    "subpathMatching",
    "preservePathSuffix",
    "comment",
  ]);

  const items = value.redirects.map((item, index) => {
    const label = `redirects[${index}]`;
    if (!item || Array.isArray(item) || typeof item !== "object") {
      errors.push(`${label} must be an object`);
      return null;
    }

    for (const key of Object.keys(item)) {
      if (!allowedKeys.has(key)) errors.push(`${label} contains unknown property "${key}"`);
    }

    const sourceUrl = validateSource(item.source, label, errors);
    const targetUrl = validateTarget(item.target, label, errors);

    if (typeof item.source === "string") {
      const normalizedSource = item.source.toLowerCase();
      if (sources.has(normalizedSource)) errors.push(`${label}.source duplicates "${item.source}"`);
      sources.add(normalizedSource);
    }

    const statusCode = item.statusCode ?? 301;
    if (![301, 302, 307, 308].includes(statusCode)) {
      errors.push(`${label}.statusCode must be 301, 302, 307, or 308`);
    }

    for (const key of [
      "preserveQueryString",
      "includeSubdomains",
      "subpathMatching",
      "preservePathSuffix",
    ]) {
      if (item[key] !== undefined && typeof item[key] !== "boolean") {
        errors.push(`${label}.${key} must be true or false`);
      }
    }

    if (item.preservePathSuffix && !item.subpathMatching) {
      errors.push(`${label}.preservePathSuffix requires subpathMatching`);
    }
    if (item.preserveQueryString && targetUrl?.search) {
      errors.push(`${label}.target cannot contain a query string when preserveQueryString is true`);
    }
    if (item.subpathMatching && sourceUrl) {
      const slashCount = [...sourceUrl.pathname].filter((character) => character === "/").length;
      if (slashCount > 16) {
        errors.push(`${label}.source path exceeds Cloudflare's 16-slash subpath limit`);
      }
    }
    if (item.comment !== undefined && (typeof item.comment !== "string" || !item.comment.trim())) {
      errors.push(`${label}.comment must be a non-empty string`);
    }

    const redirect = {
      source_url: item.source,
      target_url: item.target,
      status_code: statusCode,
      preserve_query_string: item.preserveQueryString ?? false,
      include_subdomains: item.includeSubdomains ?? false,
      subpath_matching: item.subpathMatching ?? false,
      preserve_path_suffix: item.preservePathSuffix ?? false,
    };

    return item.comment ? { redirect, comment: item.comment } : { redirect };
  });

  if (errors.length) fail(errors.join("\n"));
  return items;
}

function validateSource(source, label, errors) {
  if (typeof source !== "string" || !source.trim()) {
    errors.push(`${label}.source must be a non-empty URL`);
    return null;
  }
  if (source.includes("?") || source.includes("#")) {
    errors.push(`${label}.source cannot contain a query string or fragment`);
  }

  try {
    const url = new URL(source.includes("://") ? source : `https://${source}`);
    if (!["http:", "https:"].includes(url.protocol)) {
      errors.push(`${label}.source must use HTTP, HTTPS, or omit the scheme`);
    }
    if (url.username || url.password || url.port) {
      errors.push(`${label}.source cannot contain credentials or a port`);
    }
    if (!["backyardbullies-wc.com", "www.backyardbullies-wc.com"].includes(url.hostname)) {
      errors.push(`${label}.source must use the Backyard Bullies domain`);
    }
    return url;
  } catch {
    errors.push(`${label}.source is not a valid URL`);
    return null;
  }
}

function validateTarget(target, label, errors) {
  if (typeof target !== "string" || !target.trim()) {
    errors.push(`${label}.target must be a non-empty URL`);
    return null;
  }

  try {
    const url = new URL(target);
    if (url.protocol !== "https:") errors.push(`${label}.target must use HTTPS`);
    return url;
  } catch {
    errors.push(`${label}.target is not a valid absolute URL`);
    return null;
  }
}

async function cloudflareRequest(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  } catch (error) {
    fail(`Cloudflare API request failed: ${error.message}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    fail(`Cloudflare API returned HTTP ${response.status} with a non-JSON response`);
  }

  if (!response.ok || !payload.success) {
    const details = (payload.errors ?? [])
      .map((error) => error.message ?? JSON.stringify(error))
      .join("; ");
    fail(`Cloudflare API returned HTTP ${response.status}: ${details || "Unknown error"}`);
  }
  return payload;
}

async function waitForOperation(operationId) {
  if (!operationId) fail("Cloudflare did not return a bulk operation ID");

  const statusUrl = `${apiBase}/rules/lists/bulk_operations/${operationId}`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await cloudflareRequest(statusUrl);
    const status = response.result.status;

    if (status === "completed") return;
    if (status === "failed") fail(`Cloudflare bulk operation ${operationId} failed`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
  }
  fail(`Timed out waiting for Cloudflare bulk operation ${operationId}`);
}

function getOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  if (!process.argv[index + 1]) fail(`${name} requires a value`);
  return process.argv[index + 1];
}

function requireEnvironmentVariable(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} is required for --sync`);
  return value;
}

function fail(message) {
  console.error(`✖ Redirect sync failed:\n${message}`);
  process.exit(1);
}
