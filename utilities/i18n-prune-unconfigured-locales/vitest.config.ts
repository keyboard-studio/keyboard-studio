import { defineConfig } from "vitest/config";

// i18n-prune-unconfigured-locales is a standalone plain-node tool (no build
// step), kept out of the pnpm workspace like its sibling
// utilities/content-i18n-normalize. Its logic is pure filesystem pruning --
// no TS module or @keyboard-studio/contracts import -- so no `paths` alias
// is needed here.
export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    passWithNoTests: true,
  },
});
