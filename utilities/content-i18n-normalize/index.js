#!/usr/bin/env node
// content-i18n-normalize — turns a Crowdin-exported Tier B target value that
// is byte-identical to its English source back into the empty string.
//
// WHY THIS EXISTS
// ----------------
// crowdin.yml runs with skip_untranslated_strings: false project-wide, because
// Tier A (packages/studio/src/locales/*/messages.json, Lingui-compiled) has no
// runtime fallback of its own -- an untranslated id must arrive filled with
// English source text, or it renders blank (see the long note in crowdin.yml
// and #1458). `true` was tried instead and turned out to DELETE untranslated
// keys outright for this project's JSON file format, breaking key-set parity
// -- see fix(process) af64121b, "revert skip_untranslated_strings to false".
//
// Tier B (content/i18n/<locale>/*.json) is different: packages/studio/src/lib
// /contentI18n.ts's resolveContentString() already falls back to the English
// value at RENDER time whenever the stored value is empty or missing. So Tier
// B wants the opposite representation for "not translated yet" -- empty, not
// English source text -- and content-i18n-lint's collapse guard
// (../i18n-collapse-guard) enforces exactly that: a target catalog whose
// values are (mostly or entirely) byte-identical to English fails the gate,
// specifically so a Crowdin export with no real French isn't mistaken for one.
//
// One project-wide Crowdin setting can't give Tier A and Tier B opposite
// untranslated-string representations at once. This script is the seam: run
// it on the downloaded content/i18n/ tree, per key, before committing --
// wherever a target value is present and byte-identical to its English
// source, replace it with "". A key that differs from English (a real
// translation, however short) is left untouched. Tier A's messages.json is
// out of scope entirely -- it is never read or written here.
//
// Safe by construction: resolveContentString treats "" and "missing" the same
// (both fall back to English), so this is a pure representation change with
// no runtime effect on anything already collapsed -- it only changes whether
// the *committed catalog* records that value as "translated (== English)" or
// "not yet translated". The latter is what the runtime and the lint both
// already expect.
//
// Run: `node utilities/content-i18n-normalize/index.js` (called from
// crowdin-download-translations.yml between the Crowdin download and the
// commit/push step -- see that workflow for why they can't be one action
// invocation).

const { readFileSync, readdirSync, writeFileSync, existsSync } = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CONTENT_I18N_DIR = path.join(REPO_ROOT, "content", "i18n");
const SOURCE_LOCALE = "en";

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

/**
 * Normalize one target catalog against its English source: any non-empty
 * value byte-identical to the source value for the same key becomes "".
 * Keys missing from either side, or already differing, are untouched.
 *
 * @returns {{catalog: object, changed: number}} the normalized catalog (a new
 *   object; the input is not mutated) and how many keys were rewritten.
 */
function normalizeCatalog(en, target) {
  let changed = 0;
  const out = { ...target };
  for (const key of Object.keys(target)) {
    const value = target[key];
    if (typeof value !== "string" || value === "") continue;
    if (key in en && en[key] === value) {
      out[key] = "";
      changed++;
    }
  }
  return { catalog: out, changed };
}

/**
 * Walk every non-English locale directory under content/i18n/, normalizing
 * each catalog file that also exists under content/i18n/en/. Writes back only
 * the files that actually changed. Returns a per-file report for logging.
 */
function normalizeContentI18nDir(contentI18nDir) {
  const englishDir = path.join(contentI18nDir, SOURCE_LOCALE);
  const report = [];
  if (!existsSync(englishDir)) return report;

  const locales = readdirSync(contentI18nDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== SOURCE_LOCALE)
    .map((d) => d.name);

  for (const locale of locales) {
    const localeDir = path.join(contentI18nDir, locale);
    const files = readdirSync(localeDir, { withFileTypes: true })
      .filter((f) => f.isFile() && path.extname(f.name) === ".json")
      .map((f) => f.name);

    for (const name of files) {
      const enFile = path.join(englishDir, name);
      if (!existsSync(enFile)) continue; // no English source to compare against

      const en = readJson(enFile);
      const target = readJson(path.join(localeDir, name));
      const { catalog, changed } = normalizeCatalog(en, target);
      report.push({ locale, name, changed });
      if (changed > 0) {
        writeFileSync(path.join(localeDir, name), JSON.stringify(catalog, null, 2) + "\n");
      }
    }
  }

  return report;
}

function main() {
  const report = normalizeContentI18nDir(CONTENT_I18N_DIR);
  const touched = report.filter((r) => r.changed > 0);

  if (touched.length === 0) {
    console.log("[OK] content-i18n-normalize: nothing to normalize.");
    return;
  }

  console.log("[OK] content-i18n-normalize: rewrote English-identical values to empty.");
  for (const { locale, name, changed } of touched) {
    console.log(`  - [${locale}] ${name}: ${changed} value(s) reset to ""`);
  }
}

module.exports = { normalizeCatalog, normalizeContentI18nDir };

if (require.main === module) main();
