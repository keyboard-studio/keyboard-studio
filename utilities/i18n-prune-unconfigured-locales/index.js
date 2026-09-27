#!/usr/bin/env node
// i18n-prune-unconfigured-locales — drops Crowdin-downloaded catalogs for
// locales the app does not support (#1844).
//
// WHY THIS EXISTS
// ----------------
// The Crowdin download writes one directory per target language in the
// Crowdin project — including languages nobody configured here. The moment
// someone starts an es-ES translation in Crowdin, the next scheduled sync
// commits packages/studio/src/locales/es-ES/ and content/i18n/es-ES/, and
// `pnpm lint` fails at utilities/i18n-catalog-lint with "[es-ES] committed
// catalog is not a configured locale (orphan)" (seen for real on PR #1842).
// The Tier A catalog is then also 100% English source text (0% translated),
// which would trip the collapse guard next — the guard telling the truth
// about an untranslated catalog, per the note on skip_untranslated_strings
// in crowdin.yml.
//
// The answer is not to translate it under duress or to loosen the guard: an
// unconfigured locale simply must not be committed. This script is the seam,
// run in crowdin-download-translations.yml between the Crowdin download and
// the commit/push step (same slot as the Tier B normalize and the Tier A
// sort): it deletes every locale directory under the two catalog trees that
// is not a configured locale. To retire a locale on purpose, do exactly what
// this script does by hand and stop there — a catalog this tooling no longer
// sees is not checked (see the matching note in
// utilities/i18n-collapse-guard/index.js).
//
// THE ALLOWLIST
// -------------
// CONFIGURED_LOCALES below is a copied literal, in the repo's usual style
// for a genuinely-shared value (cf. GITHUB_OAUTH_CLIENTS): it must match, in
// the same commit,
//   • `locales` in packages/studio/lingui.config.ts (Tier A extraction),
//   • SUPPORTED_LOCALES in packages/studio/src/lib/i18n.ts (runtime), and
//   • both `languages_mapping.locale` blocks in crowdin.yml (download paths).
// The drift guard in index.test.ts fails the suite when they diverge, so
// adding a locale means touching all four places at once. (Adding a
// region-qualified locale like pt-BR needs no crowdin.yml mapping entry —
// see the note there — but it still needs the other three.)
//
// Run: `node utilities/i18n-prune-unconfigured-locales/index.js` (called
// from crowdin-download-translations.yml; also safe to run by hand —
// idempotent, and a no-op when every directory on disk is configured).

const { existsSync, readdirSync, rmSync } = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const TIER_A_DIR = path.join(REPO_ROOT, "packages", "studio", "src", "locales");
const TIER_B_DIR = path.join(REPO_ROOT, "content", "i18n");
const SOURCE_LOCALE = "en";

// See THE ALLOWLIST above — the drift guard in index.test.ts pins this to
// lingui.config.ts, SUPPORTED_LOCALES, and crowdin.yml in the same commit.
const CONFIGURED_LOCALES = ["en", "fr"];

/**
 * Delete every locale directory directly under `catalogDir` whose name is
 * not in `configuredLocales`. Only directories are considered (stray files
 * are left alone), and a missing `catalogDir` prunes nothing.
 *
 * @returns {Array<{tier: string, locale: string}>} one entry per removed
 *   directory, in readdir order.
 */
function pruneUnconfiguredLocales(catalogDir, configuredLocales, tier) {
  const pruned = [];
  if (!existsSync(catalogDir)) return pruned;
  const configured = new Set(configuredLocales);
  for (const entry of readdirSync(catalogDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (configured.has(entry.name)) continue;
    rmSync(path.join(catalogDir, entry.name), { recursive: true, force: true });
    pruned.push({ tier, locale: entry.name });
  }
  return pruned;
}

/**
 * Prune both catalog trees (Tier A Lingui catalogs, Tier B content
 * sidecars) against CONFIGURED_LOCALES.
 *
 * @returns {Array<{tier: string, locale: string}>} every removed directory.
 */
function pruneAllCatalogTrees(repoRoot = REPO_ROOT) {
  return [
    ...pruneUnconfiguredLocales(
      path.join(repoRoot, "packages", "studio", "src", "locales"),
      CONFIGURED_LOCALES,
      "tier-a",
    ),
    ...pruneUnconfiguredLocales(
      path.join(repoRoot, "content", "i18n"),
      CONFIGURED_LOCALES,
      "tier-b",
    ),
  ];
}

function main() {
  if (!CONFIGURED_LOCALES.includes(SOURCE_LOCALE)) {
    console.error(
      `[ERROR] i18n-prune-unconfigured-locales: CONFIGURED_LOCALES is missing ` +
        `the source locale "${SOURCE_LOCALE}" — refusing to run rather than ` +
        `deleting the English catalogs. Fix the allowlist (see the header).`,
    );
    process.exit(1);
  }
  const pruned = pruneAllCatalogTrees();
  if (pruned.length === 0) {
    console.log("[OK] i18n-prune-unconfigured-locales: every locale directory is configured, nothing to prune.");
    return;
  }
  console.log("[OK] i18n-prune-unconfigured-locales: dropped catalogs for unconfigured locales.");
  for (const { tier, locale } of pruned) {
    console.log(`  - [${locale}] (${tier})`);
  }
}

module.exports = { CONFIGURED_LOCALES, pruneUnconfiguredLocales, pruneAllCatalogTrees };

if (require.main === module) main();
