import { defineConfig } from "vitest/config";

// content-i18n-normalize is a standalone plain-node tool (no build step), kept
// out of the pnpm workspace like its sibling utilities/content-i18n-lint. Its
// logic is pure JSON key/value comparison -- no TS module or
// @keyboard-studio/contracts import -- so no `paths` alias is needed here.
export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    passWithNoTests: true,
  },
});
