#!/usr/bin/env node
/**
 * Adds a copyright/license comment to source files, referring to LICENSE at repo root.
 * Usage: node scripts/add-license-headers.mjs [--dry-run]
 *
 * Excludes: node_modules, dist, .turbo, .git, and paths in EXCLUDE_PATHS.
 * Skips files that already contain the license marker.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");

const LICENSE_LINE_JS =
  "// Copyright (c) mia.cx. See LICENSE at repository root.";
const LICENSE_LINE_HTML =
  "<!-- Copyright (c) mia.cx. See LICENSE at repository root. -->";
const MARKER = "See LICENSE at repository root";

const SOURCE_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".svelte",
  ".vue",
]);

const IGNORE_DIRS = new Set(["node_modules", "dist", ".turbo", ".git", ".svartz"]);

/** Paths (or path segments) to exclude from processing. */
const EXCLUDE_PATHS = [
  "worker-configuration.d.ts", // generated/vendor
  "packages/reference",        // reference code; remove if you want headers there too
  ".obsidian/plugins",        // vendored Obsidian plugin code in fixtures
];

function shouldExclude(filePath) {
  const rel = relative(ROOT, filePath);
  return EXCLUDE_PATHS.some((p) => rel.includes(p));
}

function* walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue;
      yield* walk(full);
    } else if (e.isFile()) {
      const ext = join(dir, e.name).slice(join(dir, e.name).lastIndexOf("."));
      if (SOURCE_EXTS.has(ext)) yield full;
    }
  }
}

function hasLicenseComment(content) {
  const head = content.slice(0, 512);
  return head.includes(MARKER) || head.includes("SPDX-License-Identifier");
}

function getComment(ext) {
  if (ext === ".svelte" || ext === ".vue") return LICENSE_LINE_HTML;
  return LICENSE_LINE_JS;
}

function addHeader(content, ext) {
  const comment = getComment(ext);
  const lines = content.split(/\r?\n/);
  const hasShebang = lines[0]?.startsWith("#!");
  const insert = hasShebang ? [lines[0], "", comment, ""] : [comment, ""];
  const rest = hasShebang ? lines.slice(1) : lines;
  return [...insert, ...rest].join("\n");
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  let updated = 0;
  let skipped = 0;

  for (const filePath of walk(ROOT)) {
    if (shouldExclude(filePath)) {
      skipped++;
      continue;
    }
    const content = readFileSync(filePath, "utf8");
    if (hasLicenseComment(content)) {
      skipped++;
      continue;
    }
    const ext = filePath.slice(filePath.lastIndexOf("."));
    const newContent = addHeader(content, ext);
    if (!dryRun) writeFileSync(filePath, newContent, "utf8");
    updated++;
    console.log(dryRun ? "[dry-run] " : "", relative(ROOT, filePath));
  }

  console.log("");
  console.log(
    dryRun
      ? `Would add header to ${updated} file(s). Skipped ${skipped}. Run without --dry-run to apply.`
      : `Added header to ${updated} file(s). Skipped ${skipped}.`
  );
}

main();
