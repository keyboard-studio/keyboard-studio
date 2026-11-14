// Playwright config for the spec 115 manual walk ONLY
// (specs/115-dialect-language-tags/walk/, T061).
//
// Runs the single walk spec against a dev server. Port 5273 is the studio
// default; pass WALK_PORT (and WALK_BASE_URL) when it is taken — e.g. another
// crew's dev server — and the runner reuses a server already listening there
// instead of starting its own.
//
//   WALK_PORT=5274 npx playwright test --config playwright.walk.config.ts
//
// The walk spec is archived in the walk dir as dialect-walk.spec.ts.txt; to
// re-run it, copy that file to e2e/spec-115-dialect-walk.spec.ts first.
import { defineConfig, devices } from "playwright/test";

const port = Number(process.env["WALK_PORT"] ?? 5273);
const baseURL = process.env["WALK_BASE_URL"] ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "e2e",
  testMatch: "spec-115-dialect-walk.spec.ts",
  timeout: 400_000,
  workers: 1,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx vite --port ${port} --strictPort`,
    port,
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
