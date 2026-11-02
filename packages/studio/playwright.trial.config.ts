// Playwright configuration for the FR-070 compile trial (spec 108 Phase 7).
//
// The trial must run against the PRODUCTION BUILD: the dev server serves kmc-ldml unbundled and
// unminified, so it proves nothing about chunk splitting, the asset set, or the built compile.
// This config serves `dist/` with `vite preview` on its own port and runs only the trial spec.
// Build first: `pnpm --filter @keyboard-studio/studio build`. Run with
//   npx playwright test --config playwright.trial.config.ts
// The default config ignores the trial spec, so the dev-server lane never runs it.

import { defineConfig, devices } from "playwright/test";

const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: "e2e",
  testMatch: /ldml-compile-trial\.spec\.ts/,
  timeout: 240_000,
  workers: 1,
  reporter: "list",
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
  use: {
    baseURL: "http://localhost:5274",
    launchOptions: chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : undefined,
  },
  webServer: {
    command: "pnpm exec vite preview --port 5274 --strictPort",
    port: 5274,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
