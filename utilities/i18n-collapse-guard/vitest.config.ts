import { defineConfig } from "vitest/config";

// i18n-collapse-guard is a standalone plain-node module (no build step), kept
// out of the pnpm workspace like its siblings utilities/content-i18n-lint and
// utilities/i18n-content-extract. git-baseline.test.ts shells out to a real,
// local-only git repo (no network) rather than mocking child_process, so
// these tests run slower than a typical unit test -- they are still fast in
// absolute terms (each spins up one or two tiny repos).
export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    passWithNoTests: true,
  },
});
