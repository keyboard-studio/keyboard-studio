// E2E: spec 060 (crash reporting) — T045, US4, Test Surface "Chunk-graph
// confidence".
//
// WHY A BROWSER TEST WHEN TWO OTHERS ALREADY COVER THIS.
//
// The claim under test is "the app shell — and the reporter inside it — still
// renders and can file when the lazy engine chunk is unreachable". Three things
// could establish that, and only one of them actually does:
//
//   1. engine-reachability.test.ts walks the SOURCE import graph. It proves no
//      module under src/crash/ imports the engine. It cannot prove how Vite
//      actually SPLIT those modules into chunks — and if the bundler hoisted a
//      crash module into the same chunk as the engine, the source graph would
//      still be clean while the runtime guarantee was gone.
//   2. send.test.ts runs in jsdom with the engine simply never imported. It
//      proves the code path works, but it never loads a real chunk graph, so it
//      cannot see a bundling mistake either.
//   3. This spec blocks the real network request for the real built chunk in a
//      real browser. It is the only one of the three that can fail when the
//      bundler is what is wrong.
//
// The spec flags this confidence level as "inferred from minified output" —
// this test is what raises it to observed.
//
// Run:
//   cd packages/studio && npx playwright test crash-engine-chunk-blocked.spec.ts

import { test, expect } from "playwright/test";

/**
 * Matches the lazily-imported engine chunk in a built or dev-served graph.
 *
 * Deliberately loose on the hash: the whole point of a content hash is that it
 * changes, and a test pinned to one would silently stop blocking anything after
 * the next engine edit — passing for the wrong reason forever.
 */
const ENGINE_CHUNK = /\/assets\/.*engine.*\.js(\?.*)?$/i;

test.describe("engine chunk unreachable", () => {
  test("the app shell and the crash reporter still work", async ({ page }) => {
    const blocked: string[] = [];
    await page.route(ENGINE_CHUNK, async (route) => {
      blocked.push(route.request().url());
      await route.abort("failed");
    });

    // Report POSTs are intercepted so the test never depends on the crash App,
    // the crash-reports repository, or the network being reachable.
    const reports: unknown[] = [];
    await page.route("**/report/crash", async (route) => {
      reports.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          issueUrl: "https://github.com/keyboard-studio/crash-reports/issues/1",
          issueNumber: 1,
          action: "created",
        }),
      });
    });

    await page.goto("/?e2e=1");

    // The shell renders even though the engine chunk cannot load.
    await expect(page.locator("#root")).not.toBeEmpty();
    await page.waitForFunction(() => window.__ksE2E__ !== undefined);

    // The reporter is resident and able to file. If a bundling change had
    // hoisted a crash module into the engine chunk, the hook would be missing
    // or this evaluate would throw — which is the failure this spec exists for.
    await page.evaluate(() => {
      window.dispatchEvent(
        new PromiseRejectionEvent("unhandledrejection", {
          promise: Promise.reject(new Error("chunk-blocked probe")),
          reason: new Error("chunk-blocked probe"),
        }),
      );
    });

    await expect.poll(() => reports.length, { timeout: 10_000 }).toBeGreaterThan(0);

    const first = reports[0] as { message: string; appVersion: string };
    expect(first.message).toContain("chunk-blocked probe");
    // SC-011: no report ships without a build identifier, on any path.
    expect(first.appVersion).toBeTruthy();
  });

  test("blocking is actually in effect (guards against a vacuous pass)", async ({
    page,
  }) => {
    // If the route pattern stops matching — a chunk rename, an inlined engine —
    // the test above would pass while blocking nothing at all.
    let matched = 0;
    await page.route(ENGINE_CHUNK, async (route) => {
      matched += 1;
      await route.abort("failed");
    });

    await page.goto("/?e2e=1");
    await page.waitForFunction(() => window.__ksE2E__ !== undefined);

    // Drive the app far enough to trigger the lazy engine import.
    await page.evaluate(() => {
      void import(/* @vite-ignore */ "@keyboard-studio/engine").catch(() => {});
    });

    await expect
      .poll(() => matched, { timeout: 10_000 })
      .toBeGreaterThan(0);
  });
});
