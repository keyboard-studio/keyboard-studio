// Playwright configuration for the studio SPA.
//
// RUNNER: global Playwright CLI only — invoke with `npx playwright test`.
//   @playwright/test is NOT a devDependency (by design); the global CLI binary
//   resolves this import at runtime.  Do NOT add it to package.json.
//
// CI LANES: this file and e2e/** are intentionally EXCLUDED from both:
//   - vitest (packages/studio/vitest.config.ts exclude: ["e2e/**"])
//   - tsc typecheck (packages/studio/tsconfig.json include does not cover
//     playwright.config.ts or e2e/**)
//   Browser tests run in a separate manual/CD step, never in the unit CI lane.
//
// Browser binaries: run `npx playwright install` once before running E2E.
// E2E specs live under packages/studio/e2e/ and are currently .skip-ped
// pending Track 2 liveness confirmation. See each spec header for the unblock
// recipe.

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
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
