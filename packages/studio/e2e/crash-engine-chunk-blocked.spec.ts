// E2E: spec 060 (crash reporting) — T045, US4, Test Surface "Chunk-graph
// confidence".
//
// WHY A BROWSER TEST WHEN TWO OTHERS ALREADY COVER THIS.
//
// The claim under test is "the app shell — and the reporter inside it — still
// renders and can file when the engine is unreachable".
//
//   1. engine-reachability.test.ts walks the SOURCE import graph of
//      `src/crash/**`. It proves no module under there imports the engine. It
//      cannot see anything about the graph that BOOTSTRAPS those modules.
//   2. send.test.ts runs in jsdom with the engine simply never imported. It
//      proves the code path works once it is running.
//   3. This spec makes the engine's real network request fail in a real browser.
//      It is the only one of the three that observes the whole graph as served.
//
// ---------------------------------------------------------------------------
// WHAT THIS SPEC FOUND, AND WHY ONE CASE IS `test.fail()`
// ---------------------------------------------------------------------------
//
// The first honest run of this spec — see the pattern note below for why earlier
// runs were not honest — showed that **the studio renders nothing at all when the
// engine module cannot be fetched.** `#root` stays empty, no crash report is
// filed, and there is no page error: the entry module graph simply never
// executes.
//
// The mechanism, traced rather than guessed:
//
//   main.tsx  --static-->  lib/services.ts:29-30        --static--> engine
//   main.tsx  --static-->  lib/persistWorkingCopy.ts:54 --static--> engine
//
// Those are plain `import { … } from "@keyboard-studio/engine"` statements, not
// the `await import()` calls further down services.ts. A failed static import
// aborts the whole entry graph, so `main.tsx` never runs — and
// `installGlobalCrashHandlers()` sits at that file's top level, so the reporter
// is never installed either. Nor is the FR-062 pre-mount fallback, for the same
// reason.
//
// So the reporter's CODE is engine-free (that part of research D6 holds, and
// engine-reachability.test.ts still proves it), while the reporter's
// INSTALLATION is not. That is precisely the gap a source-graph walk scoped to
// `src/crash/**` cannot see, and it is why this spec exists.
//
// It is recorded as `test.fail()` rather than deleted, weakened, or left red:
//
//   - Deleting it would erase the finding.
//   - Weakening the assertion (asserting only that *something* is on the page, or
//     scoping the block to something the app does not actually request) would
//     manufacture a green that means nothing — the exact failure mode the second
//     case in this file exists to catch.
//   - `test.fail()` is a live assertion in BOTH directions: Playwright fails the
//     run if the case starts passing, so whoever fixes the bootstrap graph is told
//     to flip this back rather than leaving a stale expectation behind.
//
// FIXING IT is a bootstrap-graph change, not a crash-reporting one: `main.tsx`
// would need `lib/services.ts` and `lib/persistWorkingCopy.ts` behind dynamic
// imports (or their engine-touching parts split out), so the eager graph reaches
// the engine nowhere. That is the discipline `src/crash/**` already follows,
// applied one level out, and it belongs to whoever owns bootstrap.
//
// ---------------------------------------------------------------------------
// WHAT THIS SPEC MATCHES, AND WHY THE PATTERN CHANGED
// ---------------------------------------------------------------------------
//
// The original pattern was `/\/assets\/.*engine.*\.js/i`, and it matched NOTHING
// in either lane:
//
//   - Against the configured `webServer` (`pnpm dev`, playwright.config.ts) there
//     is no `/assets/` chunk graph at all. Vite serves the workspace engine from
//     `/@fs/<abs>/packages/engine/dist/index.js`.
//   - Against a production build there is no chunk with "engine" in its name
//     either: Rollup names a chunk after its entry module, and the engine's entry
//     is `index.js`, so it lands in `assets/index-<hash>.js` among several others
//     also named index.
//
// So every earlier run blocked zero requests and passed vacuously — which is
// exactly what the second case here detects, and it duly failed. The pattern
// below matches what the dev lane actually serves.
//
// STILL NOT COVERED, stated plainly rather than implied: the bundler-hoisting
// question — "did Vite put a `src/crash/**` module in the same chunk as the
// engine?" — is only answerable against a production build, and this spec no
// longer claims to answer it. That needs a second Playwright project served by
// `vite preview` over a real `pnpm build`, plus a way to identify the engine chunk
// that does not depend on its filename. That lane does not exist yet.
//
// Run:
//   cd packages/studio && npx playwright test crash-engine-chunk-blocked.spec.ts

import { test, expect } from "playwright/test";

/**
 * Matches every engine module request the dev server serves.
 *
 * Keyed on the PATH SEGMENT `packages/engine/dist/`, not on a filename or a
 * content hash: hashes change by design, and a pattern pinned to one stops
 * blocking anything after the next engine edit while still passing.
 *
 * In practice exactly one request matches — the engine's entry — because nothing
 * downstream of it is ever requested once the entry fails.
 */
const ENGINE_MODULE = /\/packages\/engine\/dist\/.*\.js(\?.*)?$/i;

test.describe("engine chunk unreachable", () => {
  test("the app shell and the crash reporter still work", async ({ page }) => {
    // KNOWN FAILURE, mechanism traced in the header above: the engine sits in
    // main.tsx's EAGER static graph, so blocking it stops the entry module from
    // executing and the reporter is never installed. Remove this line when the
    // bootstrap graph stops statically importing the engine.
    //
    // Declared INSIDE the test body, not as `test.fail()` in the describe body —
    // the latter applies to every subsequent case in the block, which would also
    // mark the vacuous-pass guard below as expected-to-fail and turn its passing
    // into a run failure.
    test.fail();

    const blocked: string[] = [];
    await page.route(ENGINE_MODULE, async (route) => {
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

    // THIS is the assertion that currently fails: `#root` is empty.
    await expect(page.locator("#root")).not.toBeEmpty();

    // DELIBERATELY NOT `waitForFunction(() => window.__ksE2E__ !== undefined)`.
    //
    // `installE2eHook` reaches into `useWorkingCopyStore` and
    // `projectWorkingCopyForOutput` (src/lib/e2eHook.ts), both of which
    // value-import the engine — so the hook is one of the things that cannot be
    // installed when the engine is unreachable. Waiting on it is waiting on the
    // failure being injected, and it is what made the first honest run of this
    // spec time out at 240 s rather than fail on the claim.
    //
    // The hook's absence is not itself a defect: nothing the product does depends
    // on it. The reporter's handlers are installed by `globalHandlers.ts`, which
    // is engine-free by construction — so a dispatched rejection should be
    // captured with no hook in sight, which is a strictly stronger demonstration
    // of the claim than the hook-mediated version was.
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

    // Asserted here too, not only in the guard below: a reader running this case
    // alone must not come away with a result that blocked nothing.
    expect(
      blocked.length,
      "the engine was never actually blocked — this result would be vacuous",
    ).toBeGreaterThan(0);
  });

  test("blocking is actually in effect (guards against a vacuous pass)", async ({
    page,
  }) => {
    // If the route pattern stops matching — a module move, a rename, an engine
    // inlined into the entry — the case above would report a clean expected
    // failure while blocking nothing at all, and the finding it documents would
    // quietly stop being tested. This case earned its keep twice over: it is what
    // caught the original pattern matching zero requests in both lanes.
    let matched = 0;
    await page.route(ENGINE_MODULE, async (route) => {
      matched += 1;
      await route.abort("failed");
    });

    await page.goto("/?e2e=1");

    // The app's OWN request is what has to be observed, not one the test issues.
    // A `page.evaluate(() => import("@keyboard-studio/engine"))` cannot stand in
    // for it: a bare specifier is not resolvable in the browser at runtime, so it
    // requests `/@keyboard-studio/engine`, matches nothing, and would measure only
    // that the test made a request the app never makes.
    await expect.poll(() => matched, { timeout: 30_000 }).toBeGreaterThan(0);
  });
});
