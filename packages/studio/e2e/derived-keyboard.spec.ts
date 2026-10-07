/**
 * E2E: spec 093 SC-001 — the US1 walk, in the LIVE wizard (`pnpm dev`).
 *
 * Change `windows-layout` AFTER carve and mechanisms, and check both
 * halves of the recalculation contract:
 *
 *   SURVIVALS — the author's asked work is untouched by the change:
 *   the carve deletion of U+14EC (ᓬ, rules rule#18/rule#20 on
 *   bj_cree_woods) still stands in the working copy's deleted-item
 *   overlay and in the carve gallery on revisit, and the saved draft's
 *   `carved-layout` decision record is byte-identical before and after.
 *
 *   REFRESHES — the change itself lands and downstream readers follow:
 *   the draft's `windows-layout` decision records the newly picked
 *   layout (origin "overturned"), the layout step's why-line flips to
 *   its "You chose" branch, and every other decision recorded before
 *   the change is still present after the round trip (the re-walk's
 *   re-completions are idempotent — nothing is silently dropped or
 *   re-asked). Suggestion-level refresh (carve/mechanism proposals are
 *   layoutFamily-derived from this decision) is pinned at store level
 *   by src/lib/layoutFamily tests + src/decisions/recalculate suites;
 *   this live leg pins the decision change and the survivals end to end.
 *
 * CI-GATED: per the owner's ruling, live captures run in CI; the sandbox
 * cannot navigate Playwright to localhost. Two mechanics in this walk
 * are grounded in source but exercised for the first time here, and the
 * first CI run is their verification: (1) the spine back-navigation loop
 * reaching the layout step (the same survey-back loop
 * switch-base-rebase.spec.ts uses to reach the base picker — the layout
 * step is the spine step immediately before it, steps/manifest.ts);
 * (2) the tolerant revisit driver below, which clicks whichever
 * confirm/continue surface each already-completed step re-renders
 * (grounded per-step in helpers/surveyFlow.ts's own drivers).
 */
import { test, expect, type Page } from "playwright/test";
import {
  seedReturningVisitor,
  driveIdentityLite,
  pickBaseKeyboard,
  chooseAdaptTrack,
  acceptProjectName,
  confirmPrefill,
  buildOneCharacterList,
  carveCharacter,
  driveMechanismsGallery,
  surveyAdvance,
} from "./helpers/surveyFlow";

// window.__ksE2E__ typing — mirrors src/lib/e2eHook.ts, declared locally
// (not imported) exactly as carve.spec.ts does, so this spec has no
// compile-time coupling to studio's src/ internals beyond the documented
// window contract.
interface KsE2EHook {
  getDeletedItemIds(): string[];
}

declare global {
  interface Window {
    __ksE2E__?: KsE2EHook;
  }
}

const BASE_KEYBOARD_ID = "bj_cree_woods";
// The two literal rules producing U+14EC on this fixture (see
// carve.spec.ts's port note — verified sole producers).
const TARGET_RULE_IDS = ["rule#18", "rule#20"];
const CARVED_CHAR = "ᓬ"; // U+14EC

interface DraftShape {
  version: number;
  decisions?: Record<string, { value: unknown; provenance: string } | undefined>;
}

async function readSavedDraft(page: Page): Promise<DraftShape> {
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key === null || !key.startsWith("ks.draft.") || !key.endsWith(".v2")) continue;
      if (key.includes("__pending__")) continue;
      const raw = localStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw) as DraftShape;
    }
    throw new Error("no saved .v2 draft found in localStorage");
  });
}

function layoutIdOf(draft: DraftShape): string {
  const value = draft.decisions?.["windows-layout"]?.value as
    | { layoutId?: unknown }
    | undefined;
  if (typeof value?.layoutId !== "string") {
    throw new Error("draft carries no windows-layout layoutId");
  }
  return value.layoutId;
}

/** Spine back-navigation until the layout step renders (bounded). */
async function backToLayoutStep(page: Page): Promise<void> {
  const layoutStep = page.getByTestId("layout-step");
  for (let i = 0; i < 16; i++) {
    if (await layoutStep.isVisible().catch(() => false)) return;
    await page.getByTestId("survey-back").click();
    await page.waitForTimeout(400);
  }
  await expect(layoutStep).toBeVisible({ timeout: 15_000 });
}

/**
 * Revisit driver: from the characters step's re-entry surface forward to
 * the carve gallery, clicking whichever confirm/continue control each
 * already-completed step re-renders. Every testid here is the same one
 * helpers/surveyFlow.ts's per-step drivers use on the first pass.
 */
async function forwardToCarve(page: Page): Promise<void> {
  const carveGallery = page.getByTestId("carve-gallery");
  const revisitControls = [
    "prefill-confirm",
    "phase-b-done",
    "marks-continue",
    "punctuation-done",
    "invisibles-continue",
    "convenience-continue",
  ];
  for (let i = 0; i < 24; i++) {
    if (await carveGallery.isVisible().catch(() => false)) return;
    let clicked = false;
    for (const testId of revisitControls) {
      const control = page.getByTestId(testId);
      if (await control.isVisible().catch(() => false)) {
        await control.click();
        clicked = true;
        break;
      }
    }
    if (!clicked) await page.waitForTimeout(500);
  }
  await expect(carveGallery).toBeVisible({ timeout: 30_000 });
}

test("spec 093 SC-001: changing windows-layout after carve + mechanisms — survivals and refreshes", async ({
  page,
}) => {
  await seedReturningVisitor(page);
  await page.goto("/?e2e=1");

  // ---- Build the state: identity -> layout (suggestion accepted) ->
  // base -> track -> copyright -> project name -> characters (é) ->
  // carve (discard ᓬ) -> rules -> mechanisms (place é). ----
  await driveIdentityLite(page, {
    english: "Test",
    autonym: "Nehiyawewin",
    script: "other",
    // Spec 092: the copyright question arrives after the track choice.
    deferCopyright: true,
  });
  await pickBaseKeyboard(page, BASE_KEYBOARD_ID);
  await chooseAdaptTrack(page);

  // The post-track copyright question (spec 092 US1): leave blank (D1
  // defaults it to the author) and advance.
  const copyrightField = page.locator("#il_copyright_holder");
  await copyrightField.waitFor({ state: "visible", timeout: 15_000 });
  await surveyAdvance(page).click();
  await expect(copyrightField).toBeHidden({ timeout: 15_000 });

  await acceptProjectName(page);
  await confirmPrefill(page);
  await buildOneCharacterList(page, "é");

  // Carve: discard ᓬ (U+14EC); the cascade records both producing rules
  // in the working copy's deleted-item overlay (carve.spec.ts AC2).
  await carveCharacter(page, CARVED_CHAR);
  await expect
    .poll(() => page.evaluate(() => window.__ksE2E__?.getDeletedItemIds() ?? []), {
      timeout: 5_000,
    })
    .toEqual(expect.arrayContaining(TARGET_RULE_IDS));
  await page.getByTestId("carve-continue").click();

  // Rules step (spec 082) sits between carve and mechanisms.
  await page.getByTestId("rules-continue").click();

  // Mechanisms: place every character the gallery walks (é + its marks
  // companions). Completion lands on the touch step's seed panel.
  await driveMechanismsGallery(page);
  await expect(page.getByTestId("seed-source-confirm")).toBeVisible({
    timeout: 30_000,
  });

  // ---- Snapshot the decision state the change must preserve. ----
  await page.waitForTimeout(1_500); // autosave
  const before = await readSavedDraft(page);
  const layoutBefore = layoutIdOf(before);
  const carvedBefore = before.decisions?.["carved-layout"];
  expect(carvedBefore).toBeDefined();
  const decisionIdsBefore = Object.keys(before.decisions ?? {}).sort();

  // ---- The change: back to the layout step, pick a different layout. ----
  await backToLayoutStep(page);
  await page.getByTestId("layout-picker-input").click();
  await expect(page.getByTestId("layout-picker-list")).toBeVisible({
    timeout: 15_000,
  });
  const options = page.locator('[data-testid^="layout-option-"]');
  const optionCount = await options.count();
  let picked = false;
  for (let i = 0; i < optionCount; i++) {
    const testId = await options.nth(i).getAttribute("data-testid");
    if (testId !== null && testId !== `layout-option-${layoutBefore}`) {
      await options.nth(i).click();
      picked = true;
      break;
    }
  }
  expect(picked, "a layout option other than the recorded one exists").toBe(true);
  // The why-line's "You chose" branch (LayoutStep.tsx) proves the pick
  // registered as an overturn of the suggestion.
  await expect(page.getByTestId("layout-step-why")).toContainText("You chose");
  await page.getByTestId("layout-continue").click();

  // ---- Forward again through the re-completions. ----
  await pickBaseKeyboard(page, BASE_KEYBOARD_ID);
  await chooseAdaptTrack(page);
  const copyrightAgain = page.locator("#il_copyright_holder");
  await copyrightAgain.waitFor({ state: "visible", timeout: 15_000 });
  await surveyAdvance(page).click();
  await expect(copyrightAgain).toBeHidden({ timeout: 15_000 });
  await acceptProjectName(page);
  await forwardToCarve(page);

  // SURVIVAL (UI level): the carved character is still discarded.
  const label = "U+14EC";
  const cells = page
    .getByTestId("carve-gallery")
    .locator(`button[aria-label*="— ${label}"]`);
  await expect(cells.first()).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("carve-continue").click();
  await page.getByTestId("rules-continue").click();

  // SURVIVAL (mechanisms): the gallery's characters are still covered —
  // the driver completes immediately and the touch seed panel returns.
  await driveMechanismsGallery(page);
  await expect(page.getByTestId("seed-source-confirm")).toBeVisible({
    timeout: 30_000,
  });

  // ---- Final assertions on the saved draft + live working copy. ----
  await page.waitForTimeout(1_500); // autosave
  const after = await readSavedDraft(page);

  // REFRESH: the layout decision now records the new pick.
  expect(layoutIdOf(after)).not.toBe(layoutBefore);

  // SURVIVAL (decision level): the carve record is byte-identical, and
  // no decision recorded before the change was lost in the round trip.
  expect(after.decisions?.["carved-layout"]).toEqual(carvedBefore);
  for (const id of decisionIdsBefore) {
    expect(after.decisions?.[id], `decision ${id} survives the layout change`).toBeDefined();
  }

  // SURVIVAL (working-copy level): both carved rules are still in the
  // deleted-item overlay after the rebuild the change triggered.
  await expect
    .poll(() => page.evaluate(() => window.__ksE2E__?.getDeletedItemIds() ?? []), {
      timeout: 5_000,
    })
    .toEqual(expect.arrayContaining(TARGET_RULE_IDS));
});
