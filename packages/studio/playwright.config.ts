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
//   Browser tests never run in the unit CI lane. They run in their own
//   NON-BLOCKING `e2e` job in .github/workflows/ci.yml (boot-smoke +
//   copy-edit to start), and manually/locally for the rest.
//
// Browser binaries: run `npx playwright install` once before running E2E.
// E2E specs live under packages/studio/e2e/. Which specs are live and which are
// skipped is listed in docs/tooling.md ("Spec status"); each skipped spec carries
// its un-skip recipe in its header.

import { defineConfig } from "playwright/test";

export default defineConfig({
  testDir: "e2e",
  // Full authoring walks are long: a test also pays a cold ../keyboards catalog
  // enumeration (BaseResolution's listAll over the whole local clone) plus a
  // kmcmplib WASM compile before download. 240s gives headroom.
  timeout: 240_000,
  // global-setup.ts warms the catalog cache with one request before any
  // worker starts (see its header), but that only holds the "one payer"
  // model if workers stay serial — with the default (half of CPU cores) as
  // many concurrent full-authoring-walk specs (each its own heavy WASM
  // compile + Vite transform pass) contend for the same machine regardless
  // of the cache. #1438: on a 12-core box the default 6 workers turned a
  // trivial boot-smoke spec into a 3.8-minute run. This suite is a manual/CD
  // step, never the blocking unit-CI lane (see the file header), so trading
  // wall-clock for reliability here is the right call.
  workers: 1,
  // CI (the ci.yml `e2e` job) adds: `github` (each failing test becomes a
  // check-run annotation, readable without the Actions log), `html` (uploaded
  // as the playwright-report artifact on failure, with the retained traces),
  // and `json` (read by the job's step-summary step). Locally: plain list
  // output, no traces.
  reporter: process.env["CI"]
    ? [
        ["list"],
        ["github"],
        ["html", { open: "never" }],
        ["json", { outputFile: "test-results/results.json" }],
      ]
    : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:5273",
    trace: process.env["CI"] ? "retain-on-failure" : "off",
  },
  webServer: {
    command: "pnpm dev",
    port: 5273,
    reuseExistingServer: true,
    // engine build + Vite cold start can exceed 120s on a fresh checkout.
    timeout: 240_000,
  },
});
