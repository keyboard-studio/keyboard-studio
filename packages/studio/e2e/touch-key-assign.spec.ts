// E2E: spec 063 (touch key editor) — T089, SC-004.
//
// Proves the keyboard-only "assign a character to an existing touch key" walk
// through the By-key mode's grid + AssignPanel (T085-T089 composition):
//
//   Tab (into the grid's single roving-tabindex stop), arrows (move to the
//   target key), Enter (jump straight into AssignPanel's character field —
//   the composition's own bridge, see TouchGallery.tsx
//   handleKeyModeGridKeyDown), type "U+025B", Enter (submit the form) —
//   assigns U+025B (ɛ) to the selected touch key.
//
// The assertion is the ACTION COUNT and the ABSENCE of pointer events across
// that sequence, plus a real check that the live preview now types the
// assigned character — never a wall-clock "under two minutes" (that framing
// is narrative only, per the task).
//
// Fixture: bambara (Mande, Mali — see docs/keyboard-index.md), the SAME base
// touch-derivation-us1.spec.ts / touch-derivation-us2.spec.ts already use.
// "Reseed from desktop" (Case A) is chosen explicitly at the touch_seed_source
// fork (mirrors touch-derivation-us2.spec.ts's chooseReseedExplicitly): the
// freshly-scaffolded touch layout is a deterministic, in-memory grid this spec
// can navigate without depending on the exact shape of bambara's shipped
// `.keyman-touch-layout`.
//
// U+025B (ɛ) is the task's own worked example, and it is also the DEFAULT,
// ruleless path AssignPanel documents ("The proposal shows the default
// (U_025B, no rule required)") — no case-triple checkbox (bambara's .kmn never
// references CAPS/NCAPS — confirmed by source inspection), no opaque-fragment
// gate (a ruleless commit never needs one), so the default radio option
// (already pre-selected) commits on the very first Enter with no extra
// keystrokes to steer the proposal.
//
// Run:
//   cd packages/studio && npx playwright test touch-key-assign.spec.ts

import { test, expect, type Page, type FrameLocator } from "playwright/test";
import {
  driveIdentityLite as driveIdentityLiteBase,
  pickBaseKeyboard,
  chooseAdaptTrack,
  confirmPrefill,
  buildOneCharacterList,
  seedReturningVisitor,
} from "./helpers/surveyFlow";

// ---------------------------------------------------------------------------
// Fixture constants
// ---------------------------------------------------------------------------

const BASE_KEYBOARD_ID = "bambara";

/**
 * M (>=1) placed letter — same role touch-derivation-us1.spec.ts's PLACED_CHAR
 * plays: a new character Phase B adds that bambara does not already produce,
 * so Mechanisms (Phase C) needs a placement before the desktop locks. Not
 * otherwise touched by this spec's own assign — it only exists to make the
 * characters -> carve -> mechanisms spine walkable.
 *
 * Deliberately NOT a decomposable accented letter (e.g. "é" = e + U+0301):
 * bambara's own alphabet already covers plain a-z, so a decomposable letter
 * would trigger the marks series (spec 046) and its own combining-mark
 * placement, which is unrelated to this spec's own focus. "ø" has no NFD
 * decomposition (an atomic letter — `isDecomposableAccented("ø")` is false),
 * so Phase B's marks-series gate skips entirely and Mechanisms sees exactly
 * one new base character plus its derived uppercase counterpart ("Ø").
 *
 * bambara's `.kmn` already covers the full base US layout (every KEY_OPTIONS
 * entry — confirmed by source inspection), so neither new character has a
 * free zero-layer key to land on; both are placed on a RIGHT-ALT (AltGr)
 * layer instead — a layer bambara's own `.kmn` never uses on K_W/K_X
 * (confirmed by source inspection: bambara's only RALT rules are on
 * BKSLASH/COLON/COMMA/EQUAL/HYPHEN/LBRKT/PERIOD/QUOTE/RBRKT/SLASH).
 */
const PLACED_CHAR = "ø";
const PLACED_CHAR_UPPER = "Ø";
const PLACED_CHAR_HOST_KEY = "K_W";
const PLACED_CHAR_UPPER_HOST_KEY = "K_X";

/** The task's own worked example — U+025B, assigned via AssignPanel's field. */
const ASSIGNED_CHAR = "ɛ";
const ASSIGNED_NOTATION = "U+025B";
/** AssignPanel's deterministic default-path key id for a single BMP codepoint
 *  with no case-triple/alternative chosen (key-id-policy.md §2.1). */
const ASSIGNED_KEY_ID = "U_025B";

const OSK_FRAME_SELECTOR = 'iframe[src="/osk-frame.html"]';

/**
 * A currently-OPEN modal, anywhere on the page. `ConfirmDialog.tsx` always
 * MOUNTS its native `<dialog role="alertdialog">` (toggling visibility
 * imperatively via `showModal()`/`close()` in an effect keyed on its `open`
 * prop) — so `[role="alertdialog"]` alone is present in the DOM regardless of
 * whether the dialog is actually showing, and is not a usable "is a modal
 * open" test by itself. The native `open` HTML attribute (which the browser
 * sets/clears exactly on `showModal()`/`close()`) is the real signal for that
 * element; `AccountControl.tsx`'s `role="dialog"` sign-in panel, by contrast,
 * is conditionally rendered (`{open && (...)}`) and therefore doesn't need
 * the same `[open]` qualifier.
 */
function openModalLocator(page: Page) {
  return page.locator('dialog[open], [role="dialog"]');
}

// ---------------------------------------------------------------------------
// Page-object helpers (mirrors touch-derivation-us1/us2.spec.ts's own local
// helpers — not re-exported from surveyFlow.ts since they are one-off shapes
// for this walk, same precedent those two specs already set)
// ---------------------------------------------------------------------------

async function driveIdentityLite(page: Page): Promise<void> {
  await driveIdentityLiteBase(page, {
    english: "Test",
    autonym: "Bamanankan",
    script: "Latn",
  });
  await expect(page.getByTestId("base-picker")).toBeVisible({ timeout: 15_000 });
}

/** Carve gallery — nothing is carved for this walk; the survivor set is
 *  irrelevant to an assign-only spec. Just advances. */
async function skipCarve(page: Page): Promise<void> {
  await expect(page.getByTestId("carve-gallery")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("carve-continue").click();
}

/**
 * Places one Mechanisms character via the "Assign to a key" method on a
 * Right-Alt (AltGr) layer + `hostKey` — neither bambara's `.kmn` nor this
 * walk's OWN earlier placement (for the case counterpart) ever reuses the
 * same host key, so each call targets a distinct, genuinely free combo. A
 * no-op past the layer/key pickers when Apply is already enabled (mirrors
 * touch-derivation-us1.spec.ts's own §3c "already enabled" short-circuit for
 * a decomposable letter — not this fixture's path, but the same defensive
 * shape).
 */
async function placeMechanismCharacter(page: Page, char: string, hostKey: string): Promise<void> {
  const applyButton = page.getByRole("button", { name: `Apply method for ${char}` });
  await expect(applyButton).toBeVisible({ timeout: 15_000 });
  if (await applyButton.isDisabled()) {
    await page.getByRole("button", { name: "Add another layer" }).click();
    await page.getByRole("button", { name: "Layer 1 for layer-switch combo" }).click();
    await page.locator('ul[role="listbox"]').locator('li[data-value="RALT"]').click();
    await page.getByRole("button", { name: "Physical key for Assign to a key" }).click();
    await page.locator('ul[role="listbox"]').locator(`li[data-value="${hostKey}"]`).click();
  }
  await expect(applyButton).toBeEnabled();
  await applyButton.click();
}

/** Mechanisms gallery (Phase C, desktop) — places PLACED_CHAR ("ø") and its
 *  derived uppercase counterpart ("Ø"), both added to the inventory
 *  automatically alongside "ø" (PhaseB.tsx's own caseCounterpart augmentation
 *  — see the "0 of 2 added" progress this fixture actually shows). Completing
 *  this step is what fires lockDesktop() (reducer.ts MECHANISMS_STEP_ID
 *  case) — "the desktop locks at the end of Mechanisms" is this walk, not a
 *  separate assertable UI state. */
async function driveMechanisms(page: Page): Promise<void> {
  const startButton = page.getByRole("button", { name: "Start the mechanism gallery" });
  if (await startButton.isVisible().catch(() => false)) {
    await startButton.click();
  }
  await placeMechanismCharacter(page, PLACED_CHAR, PLACED_CHAR_HOST_KEY);
  await page.getByRole("button", { name: /^(Next character|Done)$/ }).click();
  await placeMechanismCharacter(page, PLACED_CHAR_UPPER, PLACED_CHAR_UPPER_HOST_KEY);
  await page.getByRole("button", { name: /^(Next character|Done)$/ }).click();
}

/**
 * touch_seed_source fork step — explicitly choose "Reseed from desktop"
 * (bambara's own default is "Import & adapt", since it ships a usable base
 * layout — mirrors touch-derivation-us2.spec.ts's chooseReseedExplicitly).
 */
async function chooseReseedExplicitly(page: Page): Promise<void> {
  await expect(page.getByTestId("seed-source-preview")).toBeVisible({ timeout: 15_000 });
  const reseed = page.getByTestId("seed-source-reseed");
  await reseed.click();
  await expect(reseed).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("seed-source-confirm").click();
}

/** Dismisses the touch gallery's one-time intro splash (if shown) and
 *  switches to the By-key mode. */
async function enterTouchKeyMode(page: Page): Promise<void> {
  const startButton = page.getByRole("button", { name: "Start the touch gallery" });
  if (await startButton.isVisible().catch(() => false)) {
    await startButton.click();
  }
  await page.getByTestId("touch-mode-tab-key").click();
  await expect(page.getByTestId("key-grid")).toBeVisible({ timeout: 15_000 });
}

/** Poll the OSK iframe's rendered on-screen keys for one whose KMW-internal
 *  `keyId` expando (set by KMW's own link() helper — not a DOM attribute, so
 *  it must be read via evaluate) matches `keyId`. True once the freshly
 *  compiled keyboard (reflecting the just-committed key edit) has loaded and
 *  rendered — the actual "the live preview types the character" precondition,
 *  not a fixed sleep. */
async function oskHasKeyId(oskFrame: FrameLocator, keyId: string): Promise<boolean> {
  return oskFrame.locator(".kmw-key").evaluateAll(
    (els, id) => els.some((el) => (el as unknown as { keyId?: string }).keyId === id),
    keyId,
  );
}

/** Click the on-screen key whose KMW-internal `keyId` matches `keyId`. */
async function clickOskKeyById(oskFrame: FrameLocator, keyId: string): Promise<void> {
  const keys = oskFrame.locator(".kmw-key");
  const count = await keys.count();
  for (let i = 0; i < count; i++) {
    const isMatch = await keys.nth(i).evaluate(
      (el, id) => (el as unknown as { keyId?: string }).keyId === id,
      keyId,
    );
    if (isMatch) {
      await keys.nth(i).click();
      return;
    }
  }
  throw new Error(`OSK key with keyId "${keyId}" was not found in the rendered preview`);
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

test.describe("Touch key AssignPanel — keyboard-only assign (spec 063 SC-004)", () => {
  test("Tab, arrows, Enter, type U+025B, Enter assigns ɛ within 12 keyboard actions, with no pointer event, no modal, and the live preview types it", async ({
    page,
  }) => {
    await seedReturningVisitor(page);
    await page.goto("/");

    // --- Navigation to the touch stage (not counted — SC-004 measures the
    //     assign action itself, not the survey walk to reach it). ---
    await driveIdentityLite(page);
    await pickBaseKeyboard(page, BASE_KEYBOARD_ID);
    await chooseAdaptTrack(page);
    await confirmPrefill(page);
    await buildOneCharacterList(page, PLACED_CHAR);
    await skipCarve(page);
    await driveMechanisms(page);
    await chooseReseedExplicitly(page);
    await enterTouchKeyMode(page);

    // Position focus on a known, already-focusable element immediately
    // before the grid in DOM order via the DOM API directly, NOT a click:
    // `.focus()` dispatches no pointer event at all, so this is pure setup for
    // the keyboard-only measurement below, not a discrete action of its own and
    // not a pointer event to be measured against.
    //
    // That element is the "Find a key" toggle, not "Continue": spec 065
    // T013-T015 inserted the layer selector and the add / remove / find key
    // commands between Continue and the grid. Setup only — the 12-action budget
    // counts `press()` calls, and this is not one of them.
    await page.getByTestId("touch-key-mode-find-toggle").focus();

    // --- Instrumentation: no pointer event anywhere in the counted sequence,
    //     and no modal detour. Installed AFTER navigation/setup so neither is
    //     charged against the assign action's own budget. ---
    // Listens for genuine POINTER-device events only (pointerdown/pointerup,
    // and the mousedown/mouseup a real click also dispatches) — deliberately
    // NOT a generic "click" listener: a browser's own implicit form
    // submission on Enter (the LAST counted action below) dispatches a
    // synthetic click at the submit button per the HTML spec, with no
    // pointer device involved at all, and that must not read as a pointer
    // event here.
    await page.evaluate(() => {
      const w = window as unknown as { __ksPointerEventCount: number };
      w.__ksPointerEventCount = 0;
      const bump = () => {
        w.__ksPointerEventCount += 1;
      };
      window.addEventListener("pointerdown", bump, true);
      window.addEventListener("pointerup", bump, true);
      window.addEventListener("mousedown", bump, true);
      window.addEventListener("mouseup", bump, true);
    });

    let actionCount = 0;
    async function press(key: string): Promise<void> {
      await page.keyboard.press(key);
      actionCount += 1;
    }

    // 1. Tab — focus enters the grid's single roving-tabindex stop.
    await press("Tab");
    await expect(page.locator('[role="gridcell"]:focus')).toBeVisible();

    // 2. Arrows — move from the first cell to the target key.
    await press("ArrowRight");

    // 3. F2 — jump straight into AssignPanel's character field.
    //    Spec 061 split the two keys: Enter opens the property panel (FR-020b),
    //    F2 edits the value, which is the grid convention and what keeps this
    //    walk's action budget honest now that the assign surface sits behind a
    //    disclosure. Still ONE action, so the count below is unchanged.
    await press("F2");
    const charField = page.getByLabel("Character or code point");
    await expect(charField).toBeFocused();

    // 4. Type "U+025B" — six discrete keystrokes.
    for (const ch of ASSIGNED_NOTATION) {
      await press(ch);
    }
    await expect(page.getByTestId("assign-panel-proposal")).toBeVisible();
    await expect(page.getByTestId("assign-panel-confirm")).toBeEnabled();

    // 5. Enter — submit the form (native <form> submit-on-Enter from a
    //    focused text field, no click on the Confirm button).
    await press("Enter");

    // ---------------------------------------------------------------------
    // Assertions: action count, no pointer event, no modal detour.
    // ---------------------------------------------------------------------
    expect(actionCount, "discrete keyboard actions for the assign sequence").toBeLessThanOrEqual(12);

    const pointerEventCount = await page.evaluate(
      () => (window as unknown as { __ksPointerEventCount: number }).__ksPointerEventCount,
    );
    expect(pointerEventCount, "no pointer event during the keyboard-only assign").toBe(0);

    const openModalCount = await openModalLocator(page).count();
    expect(openModalCount, "no modal detour during the assign").toBe(0);

    // The field resets on a successful commit (AssignPanel.tsx's own
    // post-commit reset) — a real signal the submit actually landed, not
    // just that Enter was pressed.
    await expect(charField).toHaveValue("");

    // ---------------------------------------------------------------------
    // The payoff: the live preview types the assigned character. A real
    // assertion against the rendered on-screen keyboard + its typed-text
    // output, not a proxy over internal store state.
    // ---------------------------------------------------------------------
    const oskFrame = page.frameLocator(OSK_FRAME_SELECTOR);
    await expect
      .poll(() => oskHasKeyId(oskFrame, ASSIGNED_KEY_ID), {
        message: "the newly assigned key never appeared in the live preview",
        timeout: 30_000,
      })
      .toBe(true);

    await clickOskKeyById(oskFrame, ASSIGNED_KEY_ID);

    const oskTarget = oskFrame.locator("#osk-target");
    await expect(oskTarget).toHaveValue(new RegExp(ASSIGNED_CHAR));
  });
});
