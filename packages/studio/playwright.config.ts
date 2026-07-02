// Playwright configuration for the studio SPA.
//
// RUNNER: global Playwright CLI only — invoke with `npx playwright test`.
//   @playwright/test is NOT a devDependency (by design); the global CLI binary
//   resolves the runtime import. Specs and this file import from "playwright/test"
//   (the "@playwright/test" specifier does not resolve to the global CLI in this
//   environment). Do NOT add @playwright/test to package.json.
//
// CI LANES: this file and e2e/** are intentionally EXCLUDED from both:
//   - vitest (packages/studio/vitest.config.ts exclude: ["e2e/**"])
//   - tsc typecheck (packages/studio/tsconfig.json include does not cover
//     playwright.config.ts or e2e/**)
//   Browser tests run in a separate manual/CD step, never in the unit CI lane.
//
// Browser binaries: run `npx playwright install` once before running E2E.
// E2E specs live under packages/studio/e2e/. carve.spec.ts is LIVE (not skipped)
// and passes against the global CLI; copy-edit.spec.ts and import-improve.spec.ts
// remain .skip-ped pending their lanes. See each spec header for details.

import { defineConfig } from "playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  use: {
    baseURL: "http://localhost:5273",
  },
  webServer: {
    command: "pnpm dev",
    port: 5273,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
