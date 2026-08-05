import { defineConfig } from "vitest/config";

// i18n-catalog-sort is a standalone plain-node tool (no build step), kept out of
// the pnpm workspace like its siblings utilities/content-i18n-normalize and
// utilities/i18n-catalog-lint. Its logic is pure key-order comparison over flat
// JSON -- no TS module or @keyboard-studio/contracts import -- so no `paths`
// alias is needed here.
export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    passWithNoTests: true,
  },
});
