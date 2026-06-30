// Playwright configuration for the studio SPA.
//
// RUNNER: invoke with `npx playwright test` (or via `pnpm --filter
//   @keyboard-studio/studio exec playwright test`).
//   @playwright/test IS required as a workspace-root devDependency: the global
//   CLI binary alone cannot resolve the `import { defineConfig } from
//   "@playwright/test"` below inside a pnpm workspace, so the package must be
//   present in node_modules. It lives at the repo root (shared, version-pinned),
//   NOT in packages/studio/package.json — keep it at the root.
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
