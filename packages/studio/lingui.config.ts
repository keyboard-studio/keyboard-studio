import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-json";

// i18n spike (Lingui v6). Catalogs are JSON in "minimal" style — a flat
// { "<explicit-id>": "<source text>" } map — so Crowdin treats the id as the
// string identifier and the English text as the *value* it fingerprints. That
// is what recovers the drift signal the stable-id scheme would otherwise lose:
// changing the English under an unchanged id is a value edit, so Crowdin resets
// approvals ("needs review") while keeping the translation linked to the id.
// See docs/i18n-spike.md for the full rationale.
// The drift checker (utilities/i18n-catalog-lint) sets LINGUI_CATALOG_CHECK_DIR
// to an absolute temp dir so it can extract a fresh catalog WITHOUT touching the
// committed one, then diff the two. Unset in normal use → the committed path.
const catalogDir =
  process.env["LINGUI_CATALOG_CHECK_DIR"] ?? "<rootDir>/src/locales";

export default defineConfig({
  sourceLocale: "en",
  locales: ["en", "fr"],
  catalogs: [
    {
      path: `${catalogDir}/{locale}/messages`,
      include: ["src"],
      exclude: ["**/*.test.*", "**/node_modules/**"],
    },
  ],
  format: formatter({ style: "minimal" }),
});
