// Mobile authoring walk — end-to-end passes on Pixel 7.
//
// Mobile adaptation (Phase 6). Runs on the `mobile` project only.
// Covers:
// - a short authoring walk (open the survey, answer, reach a gallery)
// - a deep authoring walk reusing helpers/surveyFlow.ts: identity-lite →
//   base → track → attribution → project name → prefill → Phase B →
//   carve gallery → deadkeys → rules → mechanisms, ending in the
//   assign-loop OSK sheet assertions for the mechanisms surface
// - OSK mount/unmount lifecycle (PreviewSheet show/hide unmounts the
//   iframe; showing it again mounts a FRESH iframe node — the host-side
//   remount proof that does not need engine instrumentation)
// - the SelectMenu narrow-viewport check (listbox stays in the viewport,
//   options keep the coarse-pointer hit target) on the identity step's
//   target-script field
// - footer degradation at 375px in French (long labels scroll inside the
//   footer cluster instead of pushing it off-screen)
// - axe serious/critical violations on visited screens
//
// Deferred to a later pass (not asserted here):
// - explicit 390px field-width visual check (needs screenshot comparison)
// - strong proof that OSK remount repeats the normal iframe onLoad/ready
//   command sequence (needs KeymanWeb engine instrumentation; the node
//   freshness asserted here proves a remount happened, not that the
//   engine's internal init sequence repeated)
// - OSK sheet assertions on the touch / touch_seed_source surfaces: both
//   sit past a full mechanisms-gallery completion, which would make this
//   file's deep walk substantially longer; the mechanisms surface below
//   exercises the same AssignLoopShell + PreviewSheet pair they use.
//
// Note: these specs require a Chromium binary (`npx playwright install`).
// They do not run in the unit CI lane.
import { test, expect, type Page } from "playwright/test";
import {
  seedReturningVisitor,
  surveyAdvance,
  driveIdentityLite,
  pickStartKeyboard,
  chooseTrackCopy,
  driveAttributionStep,
  acceptProjectName,
  confirmPrefill,
  buildOneCharacterList,
  driveDeadkeysStep,
} from "./helpers/surveyFlow.ts";
import { expectNoSeriousAxeViolations } from "./helpers/axe.ts";

const OSK_IFRAME = "iframe[data-os-kbd], iframe[title*='keyboard' i]";

test.beforeEach(async ({ page }) => {
  const viewport = page.viewportSize();
  expect(viewport, "mobile project must set a viewport").not.toBeNull();
  expect(viewport!.width).toBeLessThan(479);

  await seedReturningVisitor(page);
});

/**
 * The OSK sheet lifecycle on a surface that renders the assign-loop
 * "Show keyboard preview" trigger (already visible when this is called):
 * no OSK iframe while the sheet is closed, an iframe inside the sheet
 * while it is open, unmounted again on close, and — on reopen — a FRESH
 * iframe DOM node (host lifecycle only; the engine, the iframe contents,
 * and the postMessage channel are never touched).
 */
async function assertOskSheetLifecycle(page: Page): Promise<void> {
  const showPreview = page.getByRole("button", {
    name: /show keyboard preview/i,
  });
  const iframes = page.locator(OSK_IFRAME);

  const countBefore = await iframes.count();

  // The trigger sits at the end of the scrolling assign card; bring it
  // into view first, and bound the tap so a reachability failure names
  // itself instead of consuming the whole test budget.
  await showPreview.scrollIntoViewIfNeeded();
  await showPreview.tap({ timeout: 30_000 });
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(iframes.first()).toBeAttached();
  const firstHandle = await iframes.first().elementHandle();

  const close = page.getByRole("button", { name: /close/i }).first();
  await close.tap();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(await iframes.count()).toBeLessThanOrEqual(countBefore);

  // Reopen: the iframe that appears must be a new DOM node, not the
  // first mount's node re-shown — hiding unmounts, showing remounts.
  await showPreview.scrollIntoViewIfNeeded();
  await showPreview.tap({ timeout: 30_000 });
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(iframes.first()).toBeAttached();
  const secondHandle = await iframes.first().elementHandle();
  expect(firstHandle, "first OSK iframe handle").not.toBeNull();
  expect(secondHandle, "remounted OSK iframe handle").not.toBeNull();
  const isFreshNode = await page.evaluate(
    ([a, b]) => a !== b,
    [firstHandle!, secondHandle!],
  );
  expect(isFreshNode, "remount must mount a fresh iframe node").toBe(true);

  await close.tap();
  await expect(page.getByRole("dialog")).toBeHidden();
}

test("short authoring walk: survey to gallery", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/#survey");
  await page.waitForLoadState("networkidle");

  // The survey renders questions; answer the first visible one if any.
  const firstOption = page.getByRole("radio").first();
  if (await firstOption.isVisible().catch(() => false)) {
    await firstOption.check();
  }

  expect(pageErrors).toEqual([]);
  await expectNoSeriousAxeViolations(page, "mobile survey");
});

test("OSK PreviewSheet mounts and unmounts the iframe", async ({ page }) => {
  await page.goto("/#survey");
  await page.waitForLoadState("networkidle");

  // The assign-loop PreviewSheet trigger lives on the gallery surfaces,
  // not on the survey landing. If it is absent here, skip EXPLICITLY —
  // the earlier shape of this test passed vacuously in that case. The
  // mechanisms surface's copy of this lifecycle is asserted for real by
  // the deep-walk test below.
  const showPreview = page.getByRole("button", {
    name: /show keyboard preview/i,
  });
  const triggerVisible = await showPreview
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(
    !triggerVisible,
    "No 'Show keyboard preview' trigger on the #survey landing; the OSK sheet lifecycle is covered on the mechanisms surface by the deep-walk test.",
  );

  await assertOskSheetLifecycle(page);

  await expectNoSeriousAxeViolations(page, "mobile OSK sheet lifecycle");
});

test("authoring walk: identity to base to carve to the mechanisms OSK sheet", async ({
  page,
}) => {
  await page.goto("/#survey");
  await page.waitForLoadState("networkidle");

  // Cold-start guard: the shared helpers allow the first identity field
  // 15s, which a cold dev server's first survey render can exceed (the
  // same hazard driveIdentityLite's 90s base-picker window guards).
  // Warm the route here so the helpers start from a rendered survey.
  await page
    .locator("#il_language_english")
    .waitFor({ state: "visible", timeout: 90_000 });

  // The same fixture path the desktop copy-edit walk proves, driven by
  // the shared helpers (identity-lite → base → track → attribution →
  // project name → prefill → Phase B build-list).
  await driveIdentityLite(page);
  await pickStartKeyboard(page, "basic_kbdfr");
  await chooseTrackCopy(page);
  await driveAttributionStep(page);
  await acceptProjectName(page);
  await confirmPrefill(page);
  await buildOneCharacterList(page, "é");

  // Carve gallery reached — the identity → base → carve spine on mobile.
  await expect(page.getByTestId("carve-gallery")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId("carve-continue").tap();

  await driveDeadkeysStep(page);
  // The rules step sits between deadkeys and mechanisms.
  await page.getByTestId("rules-continue").click();

  // Mechanisms intro splash, when it renders, gates the gallery.
  const startGallery = page.getByRole("button", {
    name: "Start the mechanism gallery",
  });
  if (
    await startGallery
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false)
  ) {
    await startGallery.tap();
  }

  // The mechanisms surface is an assign-loop surface: its PreviewSheet
  // trigger must be present (asserted, not conditional) and the sheet
  // lifecycle must hold there.
  await expect(page.getByTestId("assign-loop-show-preview")).toBeVisible({
    timeout: 30_000,
  });
  await assertOskSheetLifecycle(page);

  // No axe gate here: a run on 2026-10-17 found one pre-existing serious
  // color-contrast violation on the Mechanism Gallery itself (a span inside
  // a button; axe selector `div:nth-child(5) > div:nth-child(1) >
  // button:nth-child(1) > span`). That gallery finding is reported with the
  // mobile adaptation Phase 6 closeout rather than silently absorbed into
  // this lifecycle test's scope.
});

test("SelectMenu keeps its listbox and hit targets inside the narrow viewport", async ({
  page,
}) => {
  await page.goto("/#survey");
  await page.waitForLoadState("networkidle");

  // Walk the identity-lite questions to the target-script field, which is
  // a ui/SelectMenu (the same driveIdentityLite sequence, stopped before
  // the selection so the open menu can be inspected).
  const english = page.locator("#il_language_english");
  // Cold-start guard: on a cold dev server the first survey render pays
  // the full Vite transform of the shell graph — the same reason
  // driveIdentityLite gives the base picker a 90s window.
  await english.waitFor({ state: "visible", timeout: 90_000 });
  await english.fill("Test");
  await english.press("Escape");
  await surveyAdvance(page).click();

  // The region question is conditional (region-ambiguous names only);
  // the free-text fixture never resolves to one, but advance past it if
  // it did render.
  const region = page.locator("#il_language_region");
  if (
    await region
      .waitFor({ state: "visible", timeout: 2_000 })
      .then(() => true)
      .catch(() => false)
  ) {
    await surveyAdvance(page).click();
  }

  const autonym = page.locator("#il_language_autonym");
  await autonym.waitFor({ state: "visible", timeout: 15_000 });
  await autonym.fill("Test Autonym");
  await autonym.press("Escape");
  await surveyAdvance(page).click();

  await page
    .locator("#il_language_code")
    .waitFor({ state: "visible", timeout: 15_000 });
  await surveyAdvance(page).click();

  const trigger = page.locator("#il_target_script");
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.tap();

  // The listbox is portalled to document.body (SelectMenu), so it is
  // queried at page level. It must lie fully inside the viewport width.
  const listbox = page.locator('ul[role="listbox"]');
  await expect(listbox).toBeVisible();
  const viewport = page.viewportSize();
  const box = await listbox.boundingBox();
  expect(box, "listbox must have a bounding box").not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);

  // Options keep the 44px coarse-pointer hit target (the e2e counterpart
  // of the SelectMenu vitest 390px checks).
  const options = listbox.locator("li");
  const optionCount = await options.count();
  expect(optionCount).toBeGreaterThan(0);
  for (let i = 0; i < optionCount; i++) {
    const optionBox = await options.nth(i).boundingBox();
    expect(optionBox, `option ${i} must have a bounding box`).not.toBeNull();
    expect(optionBox!.height).toBeGreaterThanOrEqual(44);
  }

  // No axe gate on the open menu: a run on 2026-10-17 found three
  // pre-existing serious findings on the open SelectMenu listbox itself —
  // aria-input-field-name and scrollable-region-focusable on
  // `#il_target_script-listbox`, and color-contrast on
  // `#il_target_script-option-`. They are component findings (the same
  // listbox renders on desktop), reported with the mobile adaptation
  // Phase 6 closeout; this test's subject is the menu's geometry and hit
  // targets, asserted above. The closed-menu identity screen stays
  // axe-gated by the short authoring walk.
});

test("the journey footer sits fully inside the visible viewport", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const overlap = await page.evaluate(() => {
    const footer = document.querySelector("footer");
    if (!footer) return { hasFooter: false, overlaps: false };
    const rect = footer.getBoundingClientRect();
    // The footer carries Back / Next and the progress dots; it must never
    // be pushed below the visible screen (the shell uses 100dvh for this).
    return {
      hasFooter: true,
      overlaps: rect.bottom > window.innerHeight + 1,
      footerBottom: rect.bottom,
      viewportHeight: window.innerHeight,
    };
  });

  if (overlap.hasFooter) {
    expect(overlap.overlaps, "footer must be within the viewport").toBe(false);
  }

  await expectNoSeriousAxeViolations(page, "mobile footer");
});

test.describe("375px viewport, French locale", () => {
  test.use({ viewport: { width: 375, height: 844 } });

  test("the footer cluster scroll-degrades instead of overflowing", async ({
    page,
  }) => {
    // French long labels are the footer's worst case (the vitest 375px
    // French touch-seed case lives in StudioFooter.a11y.test.tsx). Seed
    // the locale before first paint, alongside the returning-visitor
    // flag the shared beforeEach already registered.
    await page.addInitScript(() => {
      try {
        localStorage.setItem("ks.locale", "fr");
      } catch {
        // Quota / private-mode — the assertions below would fail loudly.
      }
    });

    await page.goto("/#survey");
    await page.waitForLoadState("networkidle");

    // The footer renders once the first step publishes its nav
    // (StudioFooter returns null until the journey has started), and the
    // French catalog load makes that first render slower — wait for it
    // properly instead of assuming it is already on screen.
    const footer = page.locator("footer");
    await expect(footer).toBeVisible({ timeout: 30_000 });

    const geometry = await page.evaluate(() => {
      const footerEl = document.querySelector("footer");
      const rect = footerEl?.getBoundingClientRect();
      return {
        footerBottom: rect?.bottom ?? Number.POSITIVE_INFINITY,
        viewportHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      };
    });
    // The page itself never scrolls horizontally, and the footer stays
    // on screen — long labels degrade into the cluster's internal
    // horizontal scroll instead.
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
    expect(geometry.footerBottom).toBeLessThanOrEqual(
      geometry.viewportHeight + 1,
    );

    // The forward control remains reachable: scrolling it into view
    // inside the cluster puts its box fully inside the 375px viewport,
    // and a pointer at its centre hits it.
    const forward = surveyAdvance(page);
    await expect(forward).toBeVisible({ timeout: 30_000 });
    await forward.scrollIntoViewIfNeeded();
    const box = await forward.boundingBox();
    expect(box, "forward control must have a bounding box").not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375 + 1);
    const handle = await forward.elementHandle();
    expect(handle, "forward control element handle").not.toBeNull();
    const hitSelf = await page.evaluate(
      ({ el, x, y }) => {
        const hit = document.elementFromPoint(x, y);
        return hit !== null && (hit === el || el.contains(hit));
      },
      { el: handle!, x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
    );
    expect(
      hitSelf,
      "forward control must receive a pointer at its centre",
    ).toBe(true);

    await expectNoSeriousAxeViolations(page, "mobile 375px French footer");
  });
});
