// E2E: spec 063 (touch key editor) — T112, SC-006.
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
//   - the emitted `.keyman-touch-layout` reflects BOTH edits — the add landing
//     in the LAYER IT EDITED,
//   - within that touched file every UNTOUCHED key and every platform-level
//     field — `font` explicitly included, since it is the field a naive
//     re-serialization is most likely to drop — is STRUCTURALLY identical to
//     the shipped source, and
//   - every UNTOUCHED FILE is BYTE-identical to the shipped source, where
//     "untouched" excludes the three files import-adapt legitimately rewrites
//     (see RALT_PROPAGATION below).
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
// STANDING: exploration evidence, NOT a PR-lane gate
// ---------------------------------------------------------------------------
//
// This walk is un-skipped as of spec 065 (FR-008), whose T013-T015 land the
// `TouchGallery.tsx` add/remove wiring the old blocker note named.
//
// Two of its assertions were AMENDED at the un-skip, deliberately and on the
// record (spec 065 FR-008 amendment note, T016): (a) counts keys in the edited
// layer rather than across the whole file, and (d) excuses `.kvks` alongside
// `.kmn`. Both changes state what the assertions always meant; neither weakens
// the gate. The reason is measured, not inferred — see RALT_PROPAGATION below.
// Every other assertion is as originally written.
//
// But it is not the guarantee. `.github/workflows/ci.yml` has no Playwright
// step: the PR lane runs `pnpm -r build`, `pnpm -r typecheck`, `pnpm lint`,
// `pnpm -r test`, the three standalone vitest configs (api, i18n utilities,
// spec-trace) and a non-blocking spec-drift check — and nothing else. So an
// assertion that lives only here is something someone once observed, not a
// regression guard, which is exactly how a complete-but-unmounted key editor
// shipped green (spec 065's "Why no test caught it").
//
// The durable guarantee for key-mode editing is therefore the vitest key-mode
// integration block in
// `packages/studio/src/editors/assignLoop/TouchGallery.test.tsx` (spec 065
// T009, FR-009), which mounts the real component in the lane a pull request
// runs. This walk corroborates it in a real browser and covers the emitted-
// artifact fidelity claim a second, independent time (SC-005 keeps a vitest
// twin for the same reason).
//
// That division of labour is research decision D2 in
// `specs/065-touch-editor-parity/research.md` — "Playwright explores; vitest is
// the repeatable gate". Adding a Playwright job to `ci.yml` was considered and
// deferred there as separate CI-infrastructure work, not because e2e is
// unwanted.
//
// Run:
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

/**
 * The remove route this walk drives. Both pane-level triggers spec 065 T015
 * originally pinned (`touch-key-mode-add-key`, `touch-key-mode-remove-key`)
 * were removed as duplicates of the key-anchored routes: adding is the `(+)`
 * wedge / `Insert` / the command menu's "Add key after", and removing is the
 * property panel's own "Delete this key" (FR-019) — which opened this same
 * dialog all along.
 */
const DELETE_KEY_TESTID = "key-property-panel-delete";

/** The key property panel's disclosure for the character-assignment surface (spec 065 T028-T039). */
const ASSIGN_DISCLOSURE_TESTID = "key-property-panel-assign-disclosure";

const TOUCH_LAYOUT_PATH = `source/${BASE_KEYBOARD_ID}.keyman-touch-layout`;

/**
 * The layer the walk actually edits — the grid opens on `phone:default`, so the
 * add in step 1 and the suppress in step 3 both land here.
 *
 * Scoping the add assertion to this layer (rather than counting keys across the
 * whole file) is spec 065's amendment to SC-006, and it states the assertion's
 * real intent: *the add introduced one key into the layer it edited*. The
 * whole-file count cannot say that, because two deltas that have nothing to do
 * with key mode sit upstream of it — see `RALT_PROPAGATION` below.
 */
const EDITED_PLATFORM = "phone";
const EDITED_LAYER = "default";

/**
 * RALT_PROPAGATION — why (a) is per-layer and (d) excuses `.kvks`.
 *
 * bambara's shipped `.kmn` carries RALT layer rules while its shipped
 * `.keyman-touch-layout` has no `rightalt` layer, so
 * `engine/src/pattern-apply/propagateDesktopLayersToTouch.ts` synthesizes one by
 * cloning `default`'s geometry. Measured on this very walk:
 *
 *   shipped source                     phone:default 38 · shift 38 · numeric 36            = 112
 *   after import-adapt, no key edits   + a synthesized phone:rightalt of 38                = 150
 *   after add + assign                 default 39, and the clone re-derives the added key  = 152
 *   after suppress-in-place            unchanged (suppress removes no key, as step 3 says) = 152
 *
 * Both deltas land BEFORE the touch stage is reached and are correct product
 * behaviour, not regressions: the same propagation also rewrites
 * `source/${BASE_KEYBOARD_ID}.kvks` (combo -> kvks token mapping), which is why
 * that file joins `.kmn` and the touch layout in (d)'s excused list.
 *
 * This spec was `test.skip`ped from birth, so neither premise was ever executed.
 * Amending the two assertions to say what they meant is deliberate and recorded
 * — it is not a weakened gate. See spec 065 FR-008 and its T016 note.
 */

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

/**
 * The keys of ONE layer, addressed `row:index`. The counterpart to `indexKeys`
 * for an assertion whose subject is a single edited layer rather than the whole
 * file — see the `EDITED_PLATFORM` / `EDITED_LAYER` note below for why the add
 * assertion has to be scoped this way.
 */
function layerKeys(
  layout: TouchLayoutJson,
  platformId: string,
  layerId: string,
): Map<string, TouchLayoutKeyJson> {
  const out = new Map<string, TouchLayoutKeyJson>();
  const platform = layout[platformId];
  if (platform === undefined || typeof platform !== "object") return out;
  for (const layer of platform.layer ?? []) {
    if (layer.id !== layerId) continue;
    for (const row of layer.row ?? []) {
      (row.key ?? []).forEach((key, i) => {
        out.set(`${row.id ?? "?"}:${i}`, key);
      });
    }
  }
  return out;
}

/**
 * Platform-level fields that the MECHANISM step legitimately introduces, and
 * which therefore say nothing about whether a key edit rewrote the envelope.
 *
 * Measured on this walk (per-step output snapshots, zero inference):
 *
 *   no key-mode edit yet   envelope {font}                sk[] = the 5 shipped ones
 *   after the add          envelope {font, defaultHint}   sk[] += default/K_W, shift/K_X
 *   after assign / remove  unchanged from the add
 *
 * `K_W` and `K_X` are `PLACED_CHAR_HOST_KEY` / `PLACED_CHAR_UPPER_HOST_KEY` —
 * the longpress hosts `driveMechanisms` placed ø and Ø on, long before key mode
 * is entered. Those menus are spliced into the raw JSON the first time the touch
 * layout is rewritten, and `applyTouchAssignmentsToRawJson` promotes
 * `defaultHint: "dot"` on any platform that gains an sk[] entry, "to keep
 * newly-added longpress menus discoverable on Keyman 17+" (its own contract
 * note). So the field is the MECHANISM step's output surfacing, not one of the
 * three edits this spec is about.
 *
 * `font` is deliberately NOT in this list: a dropped `font` is the specific
 * regression SC-006 names, and it stays asserted exactly, twice.
 */
const ENVELOPE_FIELDS_SET_BY_MECHANISMS = ["defaultHint"] as const;

/** The envelope with the mechanism-owned fields above removed, so the comparison is about key edits. */
function envelopesForKeyEditComparison(layout: TouchLayoutJson): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [platformId, envelope] of Object.entries(platformEnvelopes(layout))) {
    const rest = { ...(envelope as Record<string, unknown>) };
    for (const field of ENVELOPE_FIELDS_SET_BY_MECHANISMS) delete rest[field];
    out[platformId] = rest;
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

test.describe("Touch key add/remove — import-adapt fidelity (spec 063 SC-006)", () => {
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

    // The projection with ZERO key-mode edits — import-adapt's own output,
    // captured before the walk touches anything.
    //
    // Assertion (c) compares against THIS rather than the shipped source,
    // because import-adapt legitimately rewrites five rows before key mode is
    // ever reached: `propagateDesktopLayersToTouch` gives `K_SHIFT` a
    // `T_ks_layer_rightalt` longpress for the synthesized layer, and the
    // shift-layer keys gain explicit `output` fields. Measured, with no edit
    // made — see RALT_PROPAGATION above.
    //
    // Diffing edited-vs-unedited is also the STRONGER statement of what SC-006
    // actually claims: not "the artifact equals the shipped source" (it never
    // did, and was never meant to), but "editing two keys changed only the row
    // those two keys are in". Excusing a hardcoded row list would have asserted
    // less and hidden more.
    const preEditFiles = await snapshotOutputFiles(page);
    const preEditLayout = JSON.parse(preEditFiles[TOUCH_LAYOUT_PATH] as string) as TouchLayoutJson;
    const preEditKeys = indexKeys(preEditLayout);

    // -----------------------------------------------------------------------
    // 1. Add a key after the selected anchor.
    // -----------------------------------------------------------------------
    // Put focus on the grid's single tab stop. `KeyGridCell` renders
    // `tabIndex={isTabbable ? 0 : -1}` under spec 063 FR-020a's roving-tabindex
    // model, so `[role="gridcell"][tabindex="0"]` addresses exactly the one cell
    // a Tab into the grid would land on — deterministic, where a count of Tab
    // presses is not.
    //
    // The original `page.keyboard.press("Tab")` here was never satisfiable, and
    // not because of anything spec 065 added: "Back to mechanisms" and "Continue"
    // are spec-063 controls that already sat between the mode tab and the grid
    // (spec 065 adds the layer selector, FR-004, and the add/remove triggers on
    // top). This spec was `test.skip`ped from birth, so the assumption was never
    // executed. Tab ORDER is asserted by `touch-key-grid-a11y.spec.ts`, which is
    // where it belongs; this spec's subject is emitted-artifact fidelity (SC-006).
    // Only the NAVIGATION changed here — every assertion below is as written.
    const gridTabStop = page.locator('[role="gridcell"][tabindex="0"]');
    await gridTabStop.click();
    const anchorCell = page.locator('[role="gridcell"]:focus');
    await expect(anchorCell).toBeVisible();
    const anchorLabel = await anchorCell.getAttribute("aria-label");

    // Add FROM the anchor key, which is where every add route now starts: the
    // pane-level "Add key" button is gone as a duplicate of the `(+)` hover
    // wedge / Insert / the command menu's "Add key after", all three of which
    // are anchored on the key the new one follows. `Insert` is the keyboard
    // route of that same one function (`useKeyCommands`'s `runAddKeyAfter`),
    // and unlike hovering a wedge it needs no pointer position — so the walk
    // stays deterministic. It acts on the SELECTED cell, which is why the tab
    // stop is clicked rather than merely focused. Navigation only — every
    // assertion below is as written.
    await page.keyboard.press("Insert");

    // -----------------------------------------------------------------------
    // 2. Assign a character to the key just added.
    // -----------------------------------------------------------------------
    // The assign surface moved behind a disclosure on the key property panel's
    // id field (spec 065 T028-T039, research D3): assigning a character is how
    // most authors reach an id, but it is bigger than a text box and does not
    // belong permanently open. Open it before reaching for the field.
    // Navigation only — the assertions below are unchanged.
    await page.getByTestId(ASSIGN_DISCLOSURE_TESTID).click();

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
    // Return focus to the grid before arrowing. Confirming the assignment left
    // focus on `assign-panel-confirm`, and `useGridNav` only moves the selection
    // for a keydown originating inside the grid — so ArrowRight pressed from a
    // button lands nowhere. Tabbing FORWARD cannot get back either: AssignPanel
    // renders after the grid, so forward Tab would have to cycle the whole page.
    // Re-focus the grid's one tab stop, which is now the newly-added key (it is
    // the selected cell), so ArrowRight steps to its neighbour. Navigation only —
    // the three assertions that follow are unchanged.
    await gridTabStop.focus();
    await page.keyboard.press("ArrowRight");
    const removeTarget = page.locator('[role="gridcell"]:focus');
    await expect(removeTarget).toBeVisible();
    const removeTargetLabel = await removeTarget.getAttribute("aria-label");
    expect(removeTargetLabel, "the removed key must not be the add anchor").not.toBe(anchorLabel);

    // Remove from the key's own details panel. The pane-level "Remove key"
    // button is gone: it opened this very dialog, which is exactly what
    // "Delete this key" (FR-019) already does for the selected key, and two
    // differently-worded controls for one operation read as two operations.
    // ArrowRight moved the SELECTION (`useGridNav` calls the same
    // `onSelectCell` a click does), so the panel is already showing the cell
    // asserted above. Navigation only — the assertions are unchanged.
    await page.getByTestId(DELETE_KEY_TESTID).click();
    await expect(page.getByTestId("remove-key-dialog")).toBeVisible({ timeout: 15_000 });
    // Select "Suppress in place" by its accessible name, not by the proposal
    // badge. `remove-key-dialog-proposed-${outcome}` marks whichever outcome the
    // dialog PROPOSES, and here it proposes "Remove and redistribute" — correctly:
    // step 1 just added a key, so `computeProposedRemoveOutcome`'s crowding rule
    // fires ("This row has 12 keys, over the phone limit of 10"). The walk's own
    // comment above already says suppress is chosen EXPLICITLY, and the emitted
    // assertions below depend on it (`baseKeys.size + 1` holds only because
    // suppress-in-place removes no key), so selecting it directly is what this
    // step always meant. Navigation only — the assertions are unchanged.
    await page.getByRole("radio", { name: /^Suppress in place/ }).click();
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
    // Scoped to the edited layer, per RALT_PROPAGATION above: the claim is that
    // the add introduced one key INTO THE LAYER IT EDITED, which is what step 1
    // did. A whole-file count would be measuring the synthesized `rightalt`
    // clone instead — an artifact of import-adapt that predates key mode.
    expect(
      layerKeys(outputLayout, EDITED_PLATFORM, EDITED_LAYER).size,
      "the add must have introduced a key into the edited layer (suppress-in-place removes none)",
    ).toBe(layerKeys(baseLayout, EDITED_PLATFORM, EDITED_LAYER).size + 1);

    // --- (b) Every platform-level field, `font` explicitly included, is
    //         structurally identical to the source. ---
    expect(envelopesForKeyEditComparison(outputLayout)).toEqual(
      envelopesForKeyEditComparison(baseLayout),
    );
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
    for (const [address, unedited] of preEditKeys) {
      const emitted = outputKeys.get(address);
      if (emitted === undefined || JSON.stringify(emitted) !== JSON.stringify(unedited)) {
        changed.push(address);
      }
    }
    // The add shifts every key after its anchor by one index, and the suppress
    // rewrites its own key — so the count is bounded by the tail of the one
    // edited row, never by the whole layout. The real assertion is that no
    // OTHER row moved at all.
    const changedRows = new Set(changed.map((a) => a.split(":").slice(0, 3).join(":")));

    // Restricted to layers the SHIPPED source actually has. `phone:rightalt` is
    // synthesized by `propagateDesktopLayersToTouch` as a clone of `default`'s
    // geometry and is re-derived on every projection, so the added key surfaces
    // in the clone as well as in the row that was edited. A synthesized layer
    // has no shipped source to be faithful to — the same reason this spec's own
    // header gives for not using a reseeded layout — so counting it would be
    // asserting fidelity to something that was never shipped.
    const shippedLayers = new Set(
      [...baseKeys.keys()].map((a) => a.split(":").slice(0, 2).join(":")),
    );
    const changedShippedRows = [...changedRows].filter((r) =>
      shippedLayers.has(r.split(":").slice(0, 2).join(":")),
    );
    expect(
      changedShippedRows,
      "only the row the two edits touched may differ from the un-edited projection",
    ).toHaveLength(1);

    // --- (d) Every UNTOUCHED FILE is BYTE-identical. ---
    const differing = Object.keys(baseFiles).filter(
      (path) => outputFiles[path] !== undefined && outputFiles[path] !== baseFiles[path],
    );
    // The `.kmn` legitimately changes (the assign's rule half), the
    // `.keyman-touch-layout` is the touched file whose formatting normalizes,
    // and the `.kvks` is rewritten by the same RALT propagation described above
    // (combo -> kvks token mapping) with no key-mode edit involved; nothing ELSE
    // may differ by a single byte.
    const unexpected = differing.filter(
      (path) =>
        path !== TOUCH_LAYOUT_PATH && !path.endsWith(".kmn") && !path.endsWith(".kvks"),
    );
    expect(unexpected, "untouched files must be byte-identical to the shipped source").toEqual([]);

    // A file must never silently VANISH from the artifact either.
    const dropped = Object.keys(baseFiles).filter((path) => outputFiles[path] === undefined);
    expect(dropped, "no shipped file may be dropped from the emitted artifact").toEqual([]);
  });
});
