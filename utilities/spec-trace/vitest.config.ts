import { defineConfig } from "vitest/config";

// spec-trace is a standalone plain-node tool (no build step), kept out of the
// pnpm workspace like its sibling utilities. search.js is pure -- no
// filesystem policy, no @keyboard-studio/contracts import -- so no `paths`
// alias is needed here.
export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    passWithNoTests: true,
  },
});
