#!/usr/bin/env node
// i18n-catalog-sort — keeps the Tier A Lingui catalogs
// (packages/studio/src/locales/<locale>/messages.json) ordered by message ID.
//
// WHY THIS EXISTS
// ----------------
// Lingui's default `orderBy` is `"message"` — the catalogs came out sorted by
// English TEXT. Under that order a new string lands wherever its English sorts,
// which is next to whatever unrelated area happens to read similarly, so two
// branches that each add one string routinely land in the same hunk and every
// merge is a hand-resolved "keep both sides". Worse, the resolution is
// invisible: both sides are additions, so git reports a conflict on a file
// where nothing was actually contested.
//
// packages/studio/lingui.config.ts now sets `orderBy: "messageId"`, so
// `messages:extract` emits ID order and independent features insert in
// different regions of the file (`editor.*` never collides with `survey.*`).
// This script is the enforcement half: `messages:extract` is not the only thing
// that writes these files — the Crowdin download does too, and so does a hand
// edit — and an out-of-order catalog silently reintroduces the conflicts.
//
// Two entry points, following the sibling split of content-i18n-normalize (a
// fix) vs content-i18n-lint (a check):
//   • `node utilities/i18n-catalog-sort/index.js`           → sorts in place
//   • `node utilities/i18n-catalog-sort/index.js --check`    → reports, exit 1
// The check is also called from utilities/i18n-catalog-lint (which is in
// `pnpm lint`) via the exported `checkKeyOrder`, so there is exactly one
// comparator and one definition of "sorted" in the repo.
//
// THE COMPARATOR IS NOT ARBITRARY. It mirrors Lingui's own `orderByMessageId`
// (`@lingui/cli/dist/api/catalog.js`: `a.messageId.localeCompare(b.messageId)`)
// — plain `localeCompare`, default locale, exactly as Lingui calls it. Using
// anything else (codepoint sort, for instance, which orders `L` before `a` and
// so disagrees on our camelCase segments) would make this script and
// `messages:extract` fight each other forever. If Lingui's comparator or the
// `orderBy` setting changes, change this in the same commit.

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CATALOG_DIR = path.join(REPO_ROOT, "packages", "studio", "src", "locales");
const CATALOG_FILE = "messages.json";

/** @see the comparator note in the header — this must match Lingui's. */
function compareMessageIds(a, b) {
  return a.localeCompare(b);
}

/** Message ids of `catalog`, in the order Lingui's `orderBy: "messageId"` emits. */
function sortedKeys(catalog) {
  return Object.keys(catalog).sort(compareMessageIds);
}

/**
 * @returns {{sorted: boolean, firstOutOfOrder: string | null}} `firstOutOfOrder`
 *   is the first id that follows an id sorting after it — the line to look at,
 *   which is far more useful in an error than "this file is unsorted".
 */
function inspectKeyOrder(catalog) {
  const keys = Object.keys(catalog);
  for (let i = 1; i < keys.length; i++) {
    if (compareMessageIds(keys[i - 1], keys[i]) > 0) {
      return { sorted: false, firstOutOfOrder: keys[i] };
    }
  }
  return { sorted: true, firstOutOfOrder: null };
}

/**
 * The shape utilities/i18n-catalog-lint consumes (mirrors i18n-collapse-guard's
 * `checkEnglishCollapse`): `{ problem }` is a ready-to-print string, or null.
 *
 * @param {{catalog: object, locale: string}} args
 */
function checkKeyOrder({ catalog, locale }) {
  const { sorted, firstOutOfOrder } = inspectKeyOrder(catalog);
  if (sorted) return { problem: null };
  return {
    problem:
      `[${locale}] catalog is not sorted by message id ` +
      `(first out-of-order id: ${firstOutOfOrder}).`,
  };
}

/** A new catalog object with the same entries in message-id order. */
function sortCatalog(catalog) {
  const out = {};
  for (const key of sortedKeys(catalog)) out[key] = catalog[key];
  return out;
}

/**
 * Sort every `<locale>/messages.json` under `catalogDir` in place. Writes only
 * the files whose order actually changed, and preserves the exact byte format
 * Lingui's minimal JSON formatter emits (2-space indent, trailing newline), so
 * a run on already-sorted catalogs is a no-op diff.
 *
 * @returns {Array<{locale: string, sorted: boolean}>} per-file report; `sorted`
 *   is true when the file was rewritten.
 */
function sortCatalogDir(catalogDir) {
  const report = [];
  if (!fs.existsSync(catalogDir)) return report;

  const locales = fs
    .readdirSync(catalogDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const locale of locales) {
    const file = path.join(catalogDir, locale, CATALOG_FILE);
    if (!fs.existsSync(file)) continue;

    const catalog = JSON.parse(fs.readFileSync(file, "utf8"));
    const { sorted } = inspectKeyOrder(catalog);
    report.push({ locale, sorted: !sorted });
    if (!sorted) {
      fs.writeFileSync(file, JSON.stringify(sortCatalog(catalog), null, 2) + "\n");
    }
  }

  return report;
}

function checkCatalogDir(catalogDir) {
  const problems = [];
  if (!fs.existsSync(catalogDir)) return problems;

  const locales = fs
    .readdirSync(catalogDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const locale of locales) {
    const file = path.join(catalogDir, locale, CATALOG_FILE);
    if (!fs.existsSync(file)) continue;
    const catalog = JSON.parse(fs.readFileSync(file, "utf8"));
    const { problem } = checkKeyOrder({ catalog, locale });
    if (problem) problems.push(problem);
  }

  return problems;
}

function main() {
  if (process.argv.includes("--check")) {
    const problems = checkCatalogDir(CATALOG_DIR);
    if (problems.length > 0) {
      console.error("[ERROR] i18n-catalog-sort: message catalogs are not in message-id order.");
      for (const p of problems) console.error("  - " + p);
      console.error("\nFix: pnpm run i18n-catalog-sort");
      process.exit(1);
    }
    console.log("[OK] i18n-catalog-sort: message catalogs are in message-id order.");
    return;
  }

  const rewritten = sortCatalogDir(CATALOG_DIR).filter((r) => r.sorted);
  if (rewritten.length === 0) {
    console.log("[OK] i18n-catalog-sort: catalogs already in message-id order.");
    return;
  }
  console.log("[OK] i18n-catalog-sort: reordered catalogs by message id.");
  for (const { locale } of rewritten) console.log(`  - [${locale}] ${CATALOG_FILE}`);
}

module.exports = {
  compareMessageIds,
  sortedKeys,
  inspectKeyOrder,
  checkKeyOrder,
  sortCatalog,
  sortCatalogDir,
  checkCatalogDir,
};

if (require.main === module) main();
