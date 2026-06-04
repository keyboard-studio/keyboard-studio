import { defineConfig } from "vitest/config";

// Root vitest config is intentionally empty of `include` patterns so that
// `vitest` invoked directly at the repo root does NOT pick up package test
// files (which would re-run them with the wrong resolution context and a
// stale config). All real testing goes through `pnpm -r test`, which invokes
// each package's own vitest.config.ts (e.g. packages/contracts/vitest.config.ts).
export default defineConfig({
  test: {
    include: [],
    passWithNoTests: true,
  },
});
