import { defineConfig } from "vitest/config";

// content-i18n-lint is a standalone plain-node tool (no build step), kept out
// of the pnpm workspace like its sibling utilities/i18n-content-extract. Its
// checks are pure key-set / JSON comparisons — it imports neither
// @keyboard-studio/contracts nor any TS module — so, unlike the sibling's
// config, no `paths` alias is needed here.
export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    passWithNoTests: true,
  },
});
