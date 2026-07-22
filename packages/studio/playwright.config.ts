// Playwright configuration for the studio SPA.
//
// RUNNER: the `playwright` devDependency of this package — invoke with
//   `npx playwright test` from packages/studio, which resolves to the local
//   node_modules binary. Specs and this file import from "playwright/test"
//   (the `playwright` package's test entry). Do NOT add @playwright/test as a
//   second dependency — one runner package only; "playwright/test" is the
//   canonical import specifier throughout e2e/**.
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
  // Full authoring walks are long: the first test also pays a cold ../keyboards
  // catalog enumeration (BaseResolution's listAll over the whole local clone) plus
  // a kmcmplib WASM compile before download. 240s gives headroom; the dev server
  // caches the catalog after the first request so later tests are much faster.
  timeout: 240_000,
  use: {
    baseURL: "http://localhost:5273",
  },
  webServer: {
    command: "pnpm dev",
    port: 5273,
    reuseExistingServer: true,
    // engine build + Vite cold start can exceed 120s on a fresh checkout.
    timeout: 240_000,
  },
});
