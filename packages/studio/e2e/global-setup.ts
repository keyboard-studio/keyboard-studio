// Global setup — warms the local-keyboards Vite plugin's catalog cache
// (vite-plugins/localKeyboards.ts's in-process `catalogCache`, a 927-keyboard
// enumeration of ../keyboards) with ONE request before any worker spawns.
//
// Runs after webServer is confirmed up (Playwright starts webServer plugins
// before globalSetup — see the runner's task order) and before test workers
// start, so this request is always the single, deterministic first payer the
// plugin's own cache model assumes. Without it, N parallel workers each hit
// the endpoint cold at once — see #1438, where that thundering herd (not 15
// product bugs) blew past the per-test 240s timeout on trivial specs.
import type { FullConfig } from "playwright/test";

async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:5273";
  const url = `${baseURL}/local-kbd-api/list`;
  const started = Date.now();
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `global-setup: ${url} returned HTTP ${res.status} while warming the local-keyboards catalog cache`,
    );
  }
  const catalog = (await res.json()) as unknown[];
  // eslint-disable-next-line no-console
  console.log(
    `[global-setup] warmed local-keyboards catalog cache (${catalog.length} keyboards) in ${Date.now() - started}ms`,
  );
}

export default globalSetup;
