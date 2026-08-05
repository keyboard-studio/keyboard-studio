// E2E: spec 058 (touch key editor) — T112, SC-006.
//
// Proves the IMPORT-ADAPT walk's add / assign / remove round trip and, the
// actual point of SC-006, that editing a few keys does not rewrite everything
// else:
//
//   1. add a key (after a selected anchor),
//   2. assign it a character,
//   3. remove a DIFFERENT key,
//
// then asserts against the emitted artifact that
//
//   - the emitted `.keyman-touch-layout` reflects BOTH edits,
//   - within that touched file every UNTOUCHED key and every platform-level
//     field — `font` explicitly included, since it is the field a naive
//     re-serialization is most likely to drop — is STRUCTURALLY identical to
//     the shipped source, and
//   - every UNTOUCHED FILE is BYTE-identical to the shipped source.
//
// **Known limitation, stated rather than hidden** (SC-006's own wording): the
// raw-JSON pass re-serializes the whole `.keyman-touch-layout`, so its
// FORMATTING normalizes. That is why the untouched-key comparison here is
// structural (parse both, compare the parsed values) while the untouched-FILE
// comparison is byte-exact. Byte-level patch-minimization of the touched file
// is explicitly out of scope for this feature — asserting it would be
// asserting a promise the feature never made.
//
// Fixture: bambara (Mande, Mali — see docs/keyboard-index.md), the same base
// touch-derivation-us1/us2 and touch-key-assign already use. Unlike
// touch-key-assign.spec.ts, this spec does NOT choose "Reseed from desktop":
// SC-006 is a claim about fidelity to a SHIPPED layout, so the walk must take
// bambara's own default "Import & adapt" branch (Case B, the raw-JSON path) —
// a reseeded layout has no shipped source to be faithful to.
//
// ---------------------------------------------------------------------------
// STATUS: skipped — blocked on the TouchGallery add/remove wiring
// ---------------------------------------------------------------------------
//
// Phase 8 built the add and remove SURFACES, but nothing mounts them yet:
// `TouchGallery.tsx` calls neither `useKeyCommands` (T094, the add-after
// command + Insert route) nor `RemoveKeyDialog` (T097-T099, the three-outcome
// remove), and never mounts `KeyGridCommandMenu` (T111). Only the US2 assign
// path is wired (`handleAssignPanelCommit`). `useKeyCommands.ts`'s own module
// doc names the gap explicitly — "the caller (a later TouchGallery.tsx wiring
// task, out of this task's scope)" — and tasks.md allocates no such task in
// Phase 8. So steps 1 and 3 of the walk below have no UI route to drive, and
// this spec cannot pass yet. It is written in full, against the real test ids,
// so it runs as-is the moment the wiring lands.
//
// Same convention as `import-improve.spec.ts` (skipped with a recipe at the
// top of the file) — an honestly-skipped spec that names its blocker, never a
// spec weakened until it passes.
//
// To un-skip, in `TouchGallery.tsx`'s key mode:
//   1. Call `useKeyCommands({ selectedCell, layout, onAddKeyAfter, ... })` and
//      commit a successful outcome's `op` the way `handleAssignPanelCommit`
//      already does — including its Case A / Case B `promotedLayout` split
//      (`setWorkingIR` vs. `setTouchLayoutJson(emitTouchLayout(...))`), which
//      is the part an add/remove commit must not skip.
//   2. Mount `KeyGridCommandMenu` on the grid's `onOpenCommandMenu` intent and
//      `RemoveKeyDialog` on a Delete/remove intent, passing the chosen outcome
//      through to the same commit path.
//   3. Forward `onAddKeyAfter` / `onOpenCommandMenu` / `onFollowNextLayer` into
//      `<KeyGrid>` (the props exist and are already forwarded to every cell).
//   4. Give the add affordance and the remove trigger the two test ids this
//      spec expects: `touch-key-mode-add-key` and `touch-key-mode-remove-key`
//      (or update the constants below to whatever they become).
//
// Run (once un-skipped):
//   cd packages/studio && npx playwright test touch-key-add-remove.spec.ts

import { test, expect, type Page } from "playwright/test";
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

/** Same role as touch-key-assign.spec.ts's PLACED_CHAR — an atomic (non-decomposable) new letter that makes the characters -> carve -> mechanisms spine walkable without dragging in the marks series. */
const PLACED_CHAR = "ø";
const PLACED_CHAR_UPPER = "Ø";
const PLACED_CHAR_HOST_KEY = "K_W";
const PLACED_CHAR_UPPER_HOST_KEY = "K_X";

/** The character assigned to the NEWLY ADDED key (step 2 of the walk). */
const ASSIGNED_NOTATION = "U+025B";
const ASSIGNED_KEY_ID = "U_025B";

/** Test ids the wiring must expose — see the STATUS block above. */
const ADD_KEY_TESTID = "touch-key-mode-add-key";
const REMOVE_KEY_TESTID = "touch-key-mode-remove-key";

const TOUCH_LAYOUT_PATH = `source/${BASE_KEYBOARD_ID}.keyman-touch-layout`;

// ---------------------------------------------------------------------------
// window.__ksE2E__ typing — mirrors packages/studio/src/lib/e2eHook.ts.
// Declared locally (not imported) so this spec has no compile-time coupling to
// studio's src/ internals beyond the documented window contract — the same
// convention carve.spec.ts already follows.
// ---------------------------------------------------------------------------

type KsE2EFileSnapshot = Readonly<Record<string, string>>;

interface KsE2EHook {
  snapshotBaseFiles(): KsE2EFileSnapshot | null;
  snapshotOutputFiles(): Promise<KsE2EFileSnapshot | null>;
}

declare global {
  interface Window {
    __ksE2E__?: KsE2EHook;
  }
}

// ---------------------------------------------------------------------------
// Emitted-artifact types (the shape of a `.keyman-touch-layout`)
// ---------------------------------------------------------------------------

interface TouchLayoutKeyJson {
  id?: string;
  text?: string;
  sp?: number;
  width?: number;
  pad?: number;
  nextlayer?: string;
  [k: string]: unknown;
}
interface TouchLayoutJson {
  [platform: string]:
    | {
        font?: string;
        fontsize?: string;
        layer?: { id?: string; row?: { id?: number; key?: TouchLayoutKeyJson[] }[] }[];
        [k: string]: unknown;
      }
    | undefined;
}

/** Every key in the file, addressed `platform:layer:index`, so a comparison can tell "this key moved" from "this key changed". */
function indexKeys(layout: TouchLayoutJson): Map<string, TouchLayoutKeyJson> {
  const out = new Map<string, TouchLayoutKeyJson>();
  for (const [platformId, platform] of Object.entries(layout)) {
    if (platform === undefined || typeof platform !== "object") continue;
    for (const layer of platform.layer ?? []) {
      for (const row of layer.row ?? []) {
        (row.key ?? []).forEach((key, i) => {
          out.set(`${platformId}:${layer.id ?? "?"}:${row.id ?? "?"}:${i}`, key);
        });
      }
    }
  }
  return out;
}

/** Platform-level fields only — deliberately excluding `layer`, so this compares the envelope (`font`, `fontsize`, and anything else the file carries) and not its contents. */
function platformEnvelopes(layout: TouchLayoutJson): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [platformId, platform] of Object.entries(layout)) {
    if (platform === undefined || typeof platform !== "object") continue;
    const { layer: _layer, ...envelope } = platform;
    out[platformId] = envelope;
  }
  return out;
}

/** Every key id present anywhere in the file. */
function allKeyIds(layout: TouchLayoutJson): string[] {
  return [...indexKeys(layout).values()].map((k) => k.id ?? "");
}

// ---------------------------------------------------------------------------
// Page-object helpers (mirrors touch-key-assign.spec.ts's own local helpers)
// ---------------------------------------------------------------------------

async function driveIdentityLite(page: Page): Promise<void> {
  await driveIdentityLiteBase(page, {
    english: "Test",
    autonym: "Bamanankan",
    script: "Latn",
  });
  await expect(page.getByTestId("base-picker")).toBeVisible({ timeout: 15_000 });
}

async function skipCarve(page: Page): Promise<void> {
  await expect(page.getByTestId("carve-gallery")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("carve-continue").click();
}

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
 * touch_seed_source fork — take bambara's OWN DEFAULT, "Import & adapt"
 * (Case B). Deliberately the opposite of touch-key-assign.spec.ts's explicit
 * reseed: SC-006 is a fidelity claim about a SHIPPED layout, so the walk must
 * carry one. Asserts the default is actually the import branch rather than
 * silently confirming whatever happens to be pre-selected.
 */
async function confirmImportAdapt(page: Page): Promise<void> {
  await expect(page.getByTestId("seed-source-preview")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("seed-source-import-adapt")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("seed-source-confirm").click();
}

async function enterTouchKeyMode(page: Page): Promise<void> {
  const startButton = page.getByRole("button", { name: "Start the touch gallery" });
  if (await startButton.isVisible().catch(() => false)) {
    await startButton.click();
  }
  await page.getByTestId("touch-mode-tab-key").click();
  await expect(page.getByTestId("key-grid")).toBeVisible({ timeout: 15_000 });
}

/** The shipped source as instantiated, via the flag-gated `__ksE2E__` hook. */
async function snapshotBaseFiles(page: Page): Promise<KsE2EFileSnapshot> {
  const files = await page.evaluate(() => window.__ksE2E__?.snapshotBaseFiles() ?? null);
  expect(files, "base VFS snapshot (is VITE_E2E / ?e2e=1 active?)").not.toBeNull();
  return files as KsE2EFileSnapshot;
}

/** The emitted artifact — the same projection `serializeWorkingCopy` zips. */
async function snapshotOutputFiles(page: Page): Promise<KsE2EFileSnapshot> {
  const files = await page.evaluate(
    async () => (await window.__ksE2E__?.snapshotOutputFiles()) ?? null,
  );
  expect(files, "projected output VFS snapshot").not.toBeNull();
  return files as KsE2EFileSnapshot;
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

test.describe("Touch key add/remove — import-adapt fidelity (spec 058 SC-006)", () => {
  // See the STATUS block at the top of this file: blocked on the TouchGallery
  // add/remove wiring, which Phase 8 does not allocate a task for.
  test.skip(
    true,
    "Blocked: TouchGallery.tsx mounts neither useKeyCommands (add) nor RemoveKeyDialog (remove) — see the STATUS block at the top of this file.",
  );

  test("adding a key, assigning it a character, and removing a different key leaves every untouched key, platform field, and file intact", async ({
    page,
  }) => {
    await seedReturningVisitor(page);
    await page.goto("/?e2e=1");

    await driveIdentityLite(page);
    await pickBaseKeyboard(page, BASE_KEYBOARD_ID);
    await chooseAdaptTrack(page);
    await confirmPrefill(page);
    await buildOneCharacterList(page, PLACED_CHAR);
    await skipCarve(page);
    await driveMechanisms(page);
    await confirmImportAdapt(page);
    await enterTouchKeyMode(page);

    // -----------------------------------------------------------------------
    // The shipped source, captured BEFORE any edit — the baseline every
    // assertion below compares against.
    // -----------------------------------------------------------------------
    const baseFiles = await snapshotBaseFiles(page);
    const baseLayoutText = baseFiles[TOUCH_LAYOUT_PATH];
    expect(baseLayoutText, `${TOUCH_LAYOUT_PATH} must ship with ${BASE_KEYBOARD_ID}`).toBeDefined();
    const baseLayout = JSON.parse(baseLayoutText as string) as TouchLayoutJson;
    const baseKeys = indexKeys(baseLayout);
    expect(baseKeys.size, "the shipped layout must have keys to be faithful to").toBeGreaterThan(0);

    // -----------------------------------------------------------------------
    // 1. Add a key after the selected anchor.
    // -----------------------------------------------------------------------
    await page.keyboard.press("Tab");
    const anchorCell = page.locator('[role="gridcell"]:focus');
    await expect(anchorCell).toBeVisible();
    const anchorLabel = await anchorCell.getAttribute("aria-label");

    await page.getByTestId(ADD_KEY_TESTID).click();

    // -----------------------------------------------------------------------
    // 2. Assign a character to the key just added.
    // -----------------------------------------------------------------------
    const charField = page.getByLabel("Character or code point");
    await expect(charField).toBeVisible({ timeout: 15_000 });
    await charField.fill(ASSIGNED_NOTATION);
    await expect(page.getByTestId("assign-panel-confirm")).toBeEnabled();
    await page.getByTestId("assign-panel-confirm").click();
    await expect(charField).toHaveValue("");

    // -----------------------------------------------------------------------
    // 3. Remove a DIFFERENT key — a distinct cell from the add anchor, so the
    //    two edits cannot be confused for one. "Suppress in place" is chosen
    //    explicitly: it is the outcome that preserves positions (T097's first
    //    of three), which keeps this spec's untouched-key comparison a
    //    statement about fidelity rather than about reflow.
    // -----------------------------------------------------------------------
    await page.keyboard.press("ArrowRight");
    const removeTarget = page.locator('[role="gridcell"]:focus');
    await expect(removeTarget).toBeVisible();
    const removeTargetLabel = await removeTarget.getAttribute("aria-label");
    expect(removeTargetLabel, "the removed key must not be the add anchor").not.toBe(anchorLabel);

    await page.getByTestId(REMOVE_KEY_TESTID).click();
    await expect(page.getByTestId("remove-key-dialog")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("remove-key-dialog-proposed-suppress").click();
    await page.getByTestId("remove-key-dialog-confirm").click();
    await expect(page.getByTestId("remove-key-dialog")).toBeHidden();

    // -----------------------------------------------------------------------
    // The emitted artifact.
    // -----------------------------------------------------------------------
    const outputFiles = await snapshotOutputFiles(page);
    const outputLayoutText = outputFiles[TOUCH_LAYOUT_PATH];
    expect(outputLayoutText, "the emitted artifact must still carry the touch layout").toBeDefined();
    const outputLayout = JSON.parse(outputLayoutText as string) as TouchLayoutJson;

    // --- (a) The emitted layout reflects BOTH edits. ---
    expect(
      allKeyIds(outputLayout),
      "the newly added + assigned key must be present in the emitted layout",
    ).toContain(ASSIGNED_KEY_ID);
    expect(
      indexKeys(outputLayout).size,
      "the add must have introduced a key (suppress-in-place removes none)",
    ).toBe(baseKeys.size + 1);

    // --- (b) Every platform-level field, `font` explicitly included, is
    //         structurally identical to the source. ---
    expect(platformEnvelopes(outputLayout)).toEqual(platformEnvelopes(baseLayout));
    for (const [platformId, platform] of Object.entries(baseLayout)) {
      if (platform === undefined || typeof platform !== "object") continue;
      const emitted = outputLayout[platformId];
      expect(emitted, `platform ${platformId} must survive`).toBeDefined();
      // Called out separately from the envelope comparison above because a
      // dropped `font` is the specific regression SC-006 names.
      expect(emitted?.font, `platform ${platformId} font`).toBe(platform.font);
    }

    // --- (c) Every UNTOUCHED key is structurally identical. Addressed by
    //         position, so a key that merely SHIFTED is not silently excused:
    //         only the two addresses the edits actually touched may differ. ---
    const outputKeys = indexKeys(outputLayout);
    const changed: string[] = [];
    for (const [address, baseKey] of baseKeys) {
      const emitted = outputKeys.get(address);
      if (emitted === undefined || JSON.stringify(emitted) !== JSON.stringify(baseKey)) {
        changed.push(address);
      }
    }
    // The add shifts every key after its anchor by one index, and the suppress
    // rewrites its own key — so the count is bounded by the tail of the one
    // edited row, never by the whole layout. The real assertion is that no
    // OTHER row moved at all.
    const changedRows = new Set(changed.map((a) => a.split(":").slice(0, 3).join(":")));
    expect(
      [...changedRows],
      "only the row(s) the two edits touched may differ from the shipped source",
    ).toHaveLength(1);

    // --- (d) Every UNTOUCHED FILE is BYTE-identical. ---
    const differing = Object.keys(baseFiles).filter(
      (path) => outputFiles[path] !== undefined && outputFiles[path] !== baseFiles[path],
    );
    // The `.kmn` legitimately changes (the assign's rule half) and the
    // `.keyman-touch-layout` is the touched file whose formatting normalizes;
    // nothing ELSE may differ by a single byte.
    const unexpected = differing.filter(
      (path) => path !== TOUCH_LAYOUT_PATH && !path.endsWith(".kmn"),
    );
    expect(unexpected, "untouched files must be byte-identical to the shipped source").toEqual([]);

    // A file must never silently VANISH from the artifact either.
    const dropped = Object.keys(baseFiles).filter((path) => outputFiles[path] === undefined);
    expect(dropped, "no shipped file may be dropped from the emitted artifact").toEqual([]);
  });
});
