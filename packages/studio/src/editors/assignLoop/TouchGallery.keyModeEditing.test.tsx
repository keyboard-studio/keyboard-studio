// Unit tests for TouchGallery key mode — editing, SC-005 fidelity, and gestures (spec 065).
//
// Shared module mocks: ../../test/touchGallery/mocks.tsx. Seeders and the
// lifecycle hooks every suite installs: ../../test/touchGallery/harness.ts.

import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act, within } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { TouchGallery } from "./TouchGallery.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { buildTouchLayoutJsonSpy } from "../../test/touchGallery/mocks.tsx";
import { installTouchGalleryHooks, runTransform } from "../../test/touchGallery/harness.ts";

vi.mock("../../hooks/useKeyboardArtifact.ts", () => import("../../test/touchGallery/mocks.tsx"));
vi.mock("../../lib/buildTouchLayoutJson.ts", async (importOriginal) =>
  (await import("../../test/touchGallery/mocks.tsx")).withMockedBuildTouchLayoutJson(
    await importOriginal<typeof import("../../lib/buildTouchLayoutJson.ts")>(),
  ),
);
vi.mock("@keyboard-studio/engine", async (importOriginal) =>
  (await import("../../test/touchGallery/mocks.tsx")).withMockedEngine(
    await importOriginal<typeof import("@keyboard-studio/engine")>(),
  ),
);
vi.mock("../../components/OSKFrame.tsx", () => import("../../test/touchGallery/mocks.tsx"));
vi.mock("../../components/OskModeToggle.tsx", () => import("../../test/touchGallery/mocks.tsx"));

installTouchGalleryHooks();

// ---------------------------------------------------------------------------
// spec 065 T009 (FR-009, SC-003, SC-009) — the PR-lane guarantee for key-mode
// editing.
//
// research.md D2 splits the two verification tools by ROLE, not overlap:
// Playwright *explores* (ad hoc, headed, never gates); vitest carries every
// durable assertion, because `.github/workflows/ci.yml` runs `pnpm typecheck`,
// `pnpm -r test` and `pnpm lint` — and has NO Playwright step at all (confirmed
// by reading that file before writing this block). The un-skipped e2e walk
// (spec 065 T010/FR-008) is still delivered and must still pass unmodified,
// but its standing there is EVIDENCE, never a gate — this block is the gate.
//
// These tests mount the REAL `TouchGallery` against REAL store state, exactly
// like every other integration suite in this file, and reuse this file's own
// conventions rather than building a second harness (a divergent setup path
// in the same file is a defect the task briefing itself calls out):
//   - `useWorkingCopyStore.getState().instantiateFromBase/recordPhase/
//     markGalleryIntroSeen` — the same store-seeding calls `seedStore`/
//     `seedKeyModeFixture` above already use.
//   - `useSurveySessionStore.getState().setTouchSeedSource(...)` — same as
//     every other Case A/B fixture in this file.
//   - `runTransform(kbId)` — this file's own VFS-projection helper (defined
//     near the top, alongside `seedStore`), invoked unmodified.
//   - `touch-mode-tab-key` to reach key mode, exactly as the T072
//     mode-selector suite above does.
//
// They are written against the KEY-MODE-UI CONTRACT (spec 065
// contracts/key-mode-ui.md), not against today's behaviour, and are EXPECTED
// TO FAIL until T013/T014/T015 land (a later wave, owned elsewhere) —
// `TouchGallery.tsx` today mounts no layer selector at all and passes neither
// `onSpChange` nor `onApplyFix` to `KeyInspector` (confirmed by search before
// writing this block; see this file's own T007 note near the top for the
// companion confirmation that this file itself never mounts `KeyGrid`/
// `KeyInspector`/`KeyGridCell` directly, so no handler stub is owed here).
// ---------------------------------------------------------------------------

/**
 * A three-layer fixture built to exercise all three of T009's acceptance
 * scenarios off ONE shared layout, rather than three unrelated ones:
 *
 *   - `T_a` (AS1) — an ordinary Character key (`sp` absent, wire default 0)
 *     whose type the author retypes to Blank.
 *   - `T_shift` (AS2) — a layer-switch key (`nextlayer: "shift"`) sitting on
 *     `default` (not the layer it switches TO) with NO `sp` override. This
 *     is `findLayerSwitchActiveMismatches`'s own trigger condition
 *     (packages/contracts/src/touch-key-diagnostics.ts): the computable rule
 *     (research.md R3b) says `sp:1` (inactive) off the target layer, the
 *     wire value defaults to `0` (Character), the two disagree, and the
 *     resulting `TOUCH_KEY_LAYER_SWITCH_ACTIVE_MISMATCH` finding carries a
 *     `setSp` fix. A real, corpus-shaped defect a fresh import can carry —
 *     not a finding hand-forged to fit this test (the task briefing's own
 *     instruction: "prefer seeding a layout that naturally triggers it").
 *   - `"symbols"` (AS3) — a THIRD top-level layer, declared in `layer[]`
 *     alongside `default`/`shift`, that NO key's `nextlayer` reaches (only
 *     `shift` is, via `T_shift`). This is spec.md's own Edge Case: "A layer
 *     reachable from no key's next-layer — it must still be selectable,
 *     since following a layer-switch key cannot reach it." FR-004 requires
 *     the selector to source layer ids from the platform's DECLARED
 *     `layers[]`, never from any key's `nextlayer`, for exactly this case.
 */
const KEY_MODE_PARITY_LAYOUT = {
  phone: {
    layer: [
      {
        id: "default",
        row: [
          {
            id: 1,
            key: [
              { id: "T_a", text: "a", output: "a" },
              // Correlated across the family BY ID, carrying different content
              // on each member — the shape FR-065's per-layer enumeration
              // exists for, and the only shape a fan-out can actually apply to
              // (correlation is by key id). `T_a`/`T_A` deliberately are NOT
              // correlated, so the two cases can be told apart.
              { id: "T_x", text: "x", output: "x" },
              { id: "T_shift", text: "shift", nextlayer: "shift" },
            ],
          },
        ],
      },
      {
        id: "shift",
        row: [
          {
            id: 1,
            key: [
              { id: "T_A", text: "A", output: "A" },
              { id: "T_x", text: "X", output: "X" },
            ],
          },
        ],
      },
      {
        id: "symbols",
        row: [{ id: 1, key: [{ id: "T_1", text: "1", output: "1" }] }],
      },
    ],
  },
};

/**
 * Seeds the working copy for the T009 suite. `reseed-from-desktop` (not
 * `import-adapt`, unlike this file's other key-mode fixture,
 * `seedKeyModeFixture` above) is deliberate: the R11 emission matrix
 * (`packages/studio/src/lib/touchEmission.ts`) ALWAYS emits under
 * `reseed-from-desktop`, even with zero Phase E edits and empty desktop
 * mods — the one seed source under which `touchLayoutResult.json` (and
 * therefore `effectiveKeyModeLayout`, which parses THAT string once it is
 * non-null) is guaranteed non-null with no desktop-assignment scaffolding
 * required.
 *
 * `buildTouchLayoutJson` is mocked file-wide (see `buildTouchLayoutJsonSpy`
 * near the top of this file); this fixture overrides that mock's return
 * value to `KEY_MODE_PARITY_LAYOUT` so the emission this fixture forces
 * actually carries the three-layer structure these tests assert on, instead
 * of the file's generic default (an assignment-echoing single-layer stub).
 *
 * Forcing emission is not an incidental convenience — it is the ONLY way
 * AS1's key edit can reach `runTransform`'s returned VFS at all:
 * `runTransform` invokes the captured transform against a BRAND NEW EMPTY
 * `VirtualFS`, so step 1.7's key-edit-overlay projection
 * (`applyKeyEditsToVfs`) has nothing to splice a `sp` change onto unless
 * step 0 has already written a `.keyman-touch-layout` entry first — which
 * only happens when `touchLayoutJson` is non-null
 * (`packages/studio/src/lib/projectWorkingCopyVfs.ts`'s own step-0 gate).
 */
function seedKeyModeParityFixture() {
  buildTouchLayoutJsonSpy.mockImplementation(() => ({
    json: JSON.stringify(KEY_MODE_PARITY_LAYOUT),
    warnings: [] as string[],
  }));
  const vfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
  ]);
  const ir = makeTestIR([]);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
  useWorkingCopyStore.getState().recordPhase({
    phase: "B",
    answers: [],
    confirmedInventory: ["a"],
  });
  useWorkingCopyStore.getState().markGalleryIntroSeen("touch");
  useSurveySessionStore.getState().setTouchSeedSource("reseed-from-desktop");
}

/**
 * Render `TouchGallery` and switch straight to key mode — the same
 * `touch-mode-tab-key` click the T072 mode-selector suite above drives.
 */
async function renderTouchGalleryInKeyMode(
  onComplete: () => void = vi.fn(),
  onBack: () => void = vi.fn(),
): Promise<void> {
  await act(async () => {
    render(<TouchGallery onComplete={onComplete} onBack={onBack} />, { withStepNav: true });
  });
  await act(async () => {
    fireEvent.click(screen.getByTestId("touch-mode-tab-key"));
  });
}

describe("TouchGallery — key mode editing (spec 065 T009, FR-009, SC-003, SC-009)", () => {
  /** The key-type dropdown's collapsed trigger, inside the property panel. */
  function spTrigger(): HTMLButtonElement {
    return within(screen.getByTestId("key-inspector-sp")).getByRole(
      "button",
    ) as HTMLButtonElement;
  }

  /** Open the key-type dropdown and pick the option whose `sp` is `value`. */
  async function pickSp(value: number): Promise<void> {
    await act(async () => {
      fireEvent.click(spTrigger());
    });
    const option = screen
      .getAllByRole("option")
      .find((o) => o.getAttribute("data-value") === String(value));
    expect(option).toBeTruthy();
    await act(async () => {
      fireEvent.click(option!);
    });
  }

  it("AS1 — the key-type choice holds through its own re-render, and the newly chosen sp reaches the emitted .keyman-touch-layout", async () => {
    seedKeyModeParityFixture();
    await renderTouchGalleryInKeyMode();

    fireEvent.click(screen.getByTestId("key-grid-cell-phone:default:T_a"));

    // T_a starts life as an ordinary Character key (`sp` absent -> wire
    // default 0) — confirm the starting state before changing it, so a false
    // pass ("it was Blank all along") is not possible.
    expect(spTrigger().getAttribute("data-value")).toBe("0");

    await pickSp(9);

    // (a) THE DEFECT OF RECORD (issue #1530 complaint #2, spec 065 AS1): the
    // control must hold the newly chosen value through the re-render it
    // triggers, never snap back to the old one. `onSpChange` is a REQUIRED prop
    // (spec 065 FR-001/research D1), so an unwired mount is a build error
    // rather than a control that reverts.
    expect(spTrigger().getAttribute("data-value")).toBe("9");

    // (b) the SAME choice reaches what the author downloads, not just
    // component state — "it persisted into what the author downloads" is
    // the claim FR-009/SC-003 make, and only the emitted artifact can
    // support it.
    const emittedVfs = runTransform("basic_kbdus");
    const emittedLayout = emittedVfs.get(
      "source/basic_kbdus.keyman-touch-layout",
    );
    expect(emittedLayout).toBeDefined();
    // `VirtualFS.get()` returns a `VirtualFSEntry`, not a string — read
    // `.content`, the same way this file's other emitted-artifact assertions
    // already do (see the longpress check above). Casting the entry itself to
    // `string` parses "[object Object]" and throws before the real assertion
    // is ever reached.
    const parsed = JSON.parse(String(emittedLayout?.content)) as {
      phone: {
        layer: Array<{
          id: string;
          row: Array<{ key: Array<{ id: string; sp?: number }> }>;
        }>;
      };
    };
    const defaultLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const tA = defaultLayer.row[0]!.key.find((k) => k.id === "T_a");
    expect(tA?.sp).toBe(9);
  });

  it("AS2 — a fix control for a real diagnostic is enabled, and pressing it changes the working copy", async () => {
    seedKeyModeParityFixture();
    await renderTouchGalleryInKeyMode();

    fireEvent.click(
      screen.getByTestId("key-grid-cell-phone:default:T_shift"),
    );

    // The mismatch finding this key was built to carry (see
    // KEY_MODE_PARITY_LAYOUT's own doc comment above) renders as localized
    // prose plus a fix button captioned per findingCopy.ts's `setSp` case.
    // Queried by its accessible name rather than a
    // `key-inspector-finding-${i}-fix-${fixIndex}` index, because which
    // index a real diagnostics pass assigns this finding among however many
    // others this key also carries is not this test's business — nothing
    // promises an index, and a test that assumed one would be fragile to an
    // unrelated detector firing first.
    const fixButton = screen.getByRole("button", {
      name: /Draw it as inactive on this layer/i,
    }) as HTMLButtonElement;

    // Today `KeyInspector` renders every fix button unconditionally
    // (`onApplyFix` was already made required — research D1/T004), but
    // `TouchGallery` does not pass `onApplyFix` to it AT ALL (confirmed by
    // search). FR-003's "absent, never disabled" governs the case where a
    // fix genuinely cannot apply; this is the opposite defect this scenario
    // exists to catch — a control that visibly CAN apply, wired to nothing.
    expect(fixButton.disabled).toBe(false);

    const opsBefore = useWorkingCopyStore.getState().keyEditOverlay.ops.length;
    await act(async () => {
      fireEvent.click(fixButton);
    });

    expect(useWorkingCopyStore.getState().keyEditOverlay.ops.length).toBe(
      opsBefore + 1,
    );
  });

  it("AS3 — the layer selector offers a layer no key's nextlayer reaches, and activating it re-renders the grid for that layer", async () => {
    seedKeyModeParityFixture();
    await renderTouchGalleryInKeyMode();

    // "symbols" is declared in KEY_MODE_PARITY_LAYOUT's own `layer[]` array
    // but reached by NO key's `nextlayer` — only "shift" is (via T_shift).
    // This is spec.md's own Edge Case ("A layer reachable from no key's
    // next-layer — it must still be selectable") and FR-004's substance: the
    // selector must source layer ids from the platform's DECLARED
    // `layers[]`, never from any key's `nextlayer`.
    const selector = screen.getByTestId("key-layer-selector");
    const symbolsOption = within(selector).getByTestId(
      "key-layer-selector-option-symbols",
    );

    // Before the switch: the grid is showing "default", so "symbols"' own
    // key is absent from it.
    expect(
      screen.queryByTestId("key-grid-cell-phone:symbols:T_1"),
    ).toBeNull();

    await act(async () => {
      fireEvent.click(symbolsOption);
    });

    // After the switch: the grid re-rendered FOR THAT LAYER — "symbols"'
    // own key is now present.
    expect(screen.getByTestId("key-grid-cell-phone:symbols:T_1")).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // The layer-family fan-out is offered for edits that can actually break the
  // family's parallelism, and NOT for the ones FR-068 exempts
  // (`keyEditAffectsFamilyParallelism`, engine `layerFamilies.ts`).
  //
  // `default` and `shift` are one alphabetic family in KEY_MODE_PARITY_LAYOUT,
  // so every case below has a sibling for the dialog to offer, and its absence
  // means the trigger declined rather than that there was nothing to fan out to.
  // -------------------------------------------------------------------------

  it("does not ask about the layer family when a key type changes within the ordinary classes", async () => {
    seedKeyModeParityFixture();
    await renderTouchGalleryInKeyMode();
    fireEvent.click(screen.getByTestId("key-grid-cell-phone:default:T_a"));

    const opsBefore = useWorkingCopyStore.getState().keyEditOverlay.ops.length;
    await pickSp(9);

    // The edit landed...
    expect(useWorkingCopyStore.getState().keyEditOverlay.ops.length).toBe(opsBefore + 1);
    // ...and nothing offered to repeat it on `shift`. Blanking a key is per-layer
    // presentation; the fan-out starts with every sibling CHECKED, so asking here
    // is how an author ends up with an inert key on every layer of the family.
    expect(screen.queryByTestId("family-apply-dialog")).toBeNull();
  });

  it("does not ask about the layer family when a keycap changes", async () => {
    seedKeyModeParityFixture();
    await renderTouchGalleryInKeyMode();
    fireEvent.click(screen.getByTestId("key-grid-cell-phone:default:T_a"));

    const keycap = within(screen.getByTestId("key-property-panel-field-text")).getByRole(
      "textbox",
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(keycap, { target: { value: "ɑ" } });
      fireEvent.blur(keycap);
    });

    // `default` carries `a` where `shift` carries `A` — the keycap is the
    // canonical per-layer property, so copying it across is very often the wrong
    // edit and must not be proposed.
    expect(screen.queryByTestId("family-apply-dialog")).toBeNull();
  });

  it("DOES ask about the layer family when a key the siblings also carry is deleted", async () => {
    seedKeyModeParityFixture();
    await renderTouchGalleryInKeyMode();
    fireEvent.click(screen.getByTestId("key-grid-cell-phone:default:T_x"));

    await act(async () => {
      fireEvent.click(screen.getByTestId("key-property-panel-delete"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("remove-key-dialog-confirm"));
    });

    // Presence is exactly what `findFamilyParallelismBreaks` compares, so a key
    // gone from one member and present on the rest is a real break — the one
    // case where "do the same on the siblings?" is the right question.
    expect(screen.getByTestId("family-apply-dialog")).toBeTruthy();
  });

  // The dead-end the author reported as a dialog that "can't be successfully
  // confirmed": the fan-out correlates by key id, so a member that does not
  // carry this id has nothing to apply the edit to. With EVERY member in that
  // state, the dialog opens with no selectable layer, Apply is disabled by its
  // own `canConfirm`, and Cancel is the only way out — a question with no
  // available answer. `T_a` lives on `default` alone, so `shift` cannot answer.
  it("does not ask about the layer family when no sibling carries the key at all", async () => {
    seedKeyModeParityFixture();
    await renderTouchGalleryInKeyMode();
    fireEvent.click(screen.getByTestId("key-grid-cell-phone:default:T_a"));

    await act(async () => {
      fireEvent.click(screen.getByTestId("key-property-panel-delete"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("remove-key-dialog-confirm"));
    });

    // The anchor-only delete still landed — declining to ask is not declining
    // to edit.
    expect(screen.queryByTestId("key-grid-cell-phone:default:T_a")).toBeNull();
    expect(screen.queryByTestId("family-apply-dialog")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // The details panel is BESIDE the board, not below it (issue #1530: "the key
  // details must show on the same screen as the keyboard").
  // -------------------------------------------------------------------------

  it("renders the key details in their own column beside the grid, not stacked under it", async () => {
    seedKeyModeParityFixture();
    await renderTouchGalleryInKeyMode();
    fireEvent.click(screen.getByTestId("key-grid-cell-phone:default:T_a"));

    const detailsColumn = screen.getByTestId("touch-key-details-column");
    const panel = screen.getByTestId("key-property-panel");
    const grid = screen.getByRole("grid");

    // The panel is in the column; the board is NOT (which is what makes them
    // siblings that can be side by side, rather than one above the other).
    expect(detailsColumn.contains(panel)).toBe(true);
    expect(detailsColumn.contains(grid)).toBe(false);

    // The dialogs stay OUT of the column: it scrolls, and `overflow: auto`
    // clips a `position: fixed` descendant.
    await act(async () => {
      fireEvent.click(screen.getByTestId("key-property-panel-delete"));
    });
    expect(detailsColumn.contains(screen.getByTestId("remove-key-dialog"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SC-005 — untouched files stay byte-identical, untouched keys stay
// structurally identical (spec 065 T029; research D2)
//
// The e2e walk `packages/studio/e2e/touch-key-add-remove.spec.ts` makes the
// same claim in a real browser. This is its vitest twin, and it exists because
// `.github/workflows/ci.yml` has NO Playwright step: an assertion that lives
// only there is something someone once observed, not a regression guard. Two
// independent statements of a fidelity claim is proportionate for the one
// criterion about not corrupting the author's keyboard.
//
// No browser is needed. This file already mounts the REAL `TouchGallery`
// against real store state, and `runTransform(kbId)` runs the SAME projection
// the download path runs, returning the emitted VFS — so the emitted artifact
// is reachable directly.
// ---------------------------------------------------------------------------

/** Every file in a VFS as `path -> content`, so two projections can be compared whole. */
function snapshotFiles(vfs: ReturnType<typeof runTransform>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of vfs.entries()) {
    out[entry.path] =
      typeof entry.content === "string" ? entry.content : `bin:${Array.from(entry.content).join(",")}`;
  }
  return out;
}

interface Sc005Key {
  id?: string;
  sp?: number;
  [k: string]: unknown;
}

/** Every key in an emitted touch layout, addressed `platform:layer:row:index`. */
function indexEmittedKeys(json: string): Map<string, Sc005Key> {
  const out = new Map<string, Sc005Key>();
  const parsed = JSON.parse(json) as Record<
    string,
    { layer?: Array<{ id?: string; row?: Array<{ id?: number; key?: Sc005Key[] }> }> } | undefined
  >;
  for (const [platformId, platform] of Object.entries(parsed)) {
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

const TOUCH_LAYOUT_PATH = "source/basic_kbdus.keyman-touch-layout";

describe("TouchGallery key mode — SC-005 fidelity (spec 065 T029)", () => {
  it("leaves every UNTOUCHED FILE byte-identical after a handful of key edits", async () => {
    seedKeyModeParityFixture();
    await renderTouchGalleryInKeyMode();
    const before = snapshotFiles(runTransform("basic_kbdus"));

    // Three edits on ONE key, through the real property panel.
    fireEvent.click(screen.getByTestId("key-grid-cell-phone:default:T_a"));
    await act(async () => {
      const keycap = screen
        .getByTestId("key-property-panel-field-text")
        .querySelector("input") as HTMLInputElement;
      fireEvent.change(keycap, { target: { value: "A" } });
      fireEvent.blur(keycap);
    });
    await act(async () => {
      const width = screen
        .getByTestId("key-property-panel-field-width")
        .querySelector("input") as HTMLInputElement;
      fireEvent.change(width, { target: { value: "150" } });
      fireEvent.blur(width);
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("key-property-panel-move-right"));
    });

    const after = snapshotFiles(runTransform("basic_kbdus"));

    // The `.keyman-touch-layout` legitimately changes (it is the touched
    // file), and a `.kmn` may change if an edit wrote a rule. Nothing ELSE may
    // differ by a single byte.
    const differing = Object.keys(before).filter(
      (path) => after[path] !== undefined && after[path] !== before[path],
    );
    const unexpected = differing.filter(
      (path) => path !== TOUCH_LAYOUT_PATH && !path.endsWith(".kmn"),
    );
    expect(unexpected).toEqual([]);

    // And nothing may VANISH from the artifact either.
    const dropped = Object.keys(before).filter((path) => after[path] === undefined);
    expect(dropped).toEqual([]);
  });

  it("leaves every UNTOUCHED KEY structurally identical within the touched file", async () => {
    seedKeyModeParityFixture();
    await renderTouchGalleryInKeyMode();
    const beforeLayout = runTransform("basic_kbdus").get(TOUCH_LAYOUT_PATH);
    expect(typeof beforeLayout?.content).toBe("string");
    const beforeKeys = indexEmittedKeys(beforeLayout!.content as string);
    expect(beforeKeys.size).toBeGreaterThan(0);

    // One key edited; every other key in every other layer must be untouched.
    fireEvent.click(screen.getByTestId("key-grid-cell-phone:default:T_a"));
    await act(async () => {
      const keycap = screen
        .getByTestId("key-property-panel-field-text")
        .querySelector("input") as HTMLInputElement;
      fireEvent.change(keycap, { target: { value: "EDITED" } });
      fireEvent.blur(keycap);
    });

    const afterLayout = runTransform("basic_kbdus").get(TOUCH_LAYOUT_PATH);
    const afterKeys = indexEmittedKeys(afterLayout!.content as string);

    const changed: string[] = [];
    for (const [address, beforeKey] of beforeKeys) {
      const emitted = afterKeys.get(address);
      if (emitted === undefined || JSON.stringify(emitted) !== JSON.stringify(beforeKey)) {
        changed.push(address);
      }
    }
    // Exactly the one key the author edited, and no other — addressed by
    // POSITION, so a key that merely SHIFTED is not silently excused.
    expect(changed).toEqual(["phone:default:1:0"]);
  });

  it("keeps a moved key's own sub-keys and geometry in the emitted artifact (FR-021)", async () => {
    seedKeyModeParityFixture();
    await renderTouchGalleryInKeyMode();

    fireEvent.click(screen.getByTestId("key-grid-cell-phone:default:T_a"));
    await act(async () => {
      const width = screen
        .getByTestId("key-property-panel-field-width")
        .querySelector("input") as HTMLInputElement;
      fireEvent.change(width, { target: { value: "175" } });
      fireEvent.blur(width);
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("key-property-panel-move-right"));
    });

    const emitted = indexEmittedKeys(
      runTransform("basic_kbdus").get(TOUCH_LAYOUT_PATH)!.content as string,
    );
    // T_a moved one place right: it is now index 1 of its row, and it carries
    // the width the author set — the move preserved it rather than rebuilding
    // the key from a spec that has no geometry.
    const moved = emitted.get("phone:default:1:1");
    expect(moved?.id).toBe("T_a");
    expect(moved?.["width"]).toBe(175);
  });
});

// ---------------------------------------------------------------------------
// US4 — gestures are editable where the key is (spec 065 T040; FR-026, FR-028)
//
// Mounts the REAL `TouchGallery` in key mode, adds a longpress and a north-east
// flick through the real `GesturePanel`, edits each one's text, removes one, and
// asserts all of it in the EMITTED ARTIFACT via `runTransform` — not in
// component state. Then toggles to character mode and back, because FR-028's
// claim is that a sub-key edit made in either mode is visible in the other, and
// the only way that can be true is if both modes read the ONE `keyEditOverlay`.
// ---------------------------------------------------------------------------

/** The `<input>` inside a gesture sub-key field. */
function gestureInput(field: "text" | "output"): HTMLInputElement {
  return screen
    .getByTestId(`gesture-panel-subkey-field-${field}`)
    .querySelector("input") as HTMLInputElement;
}

/** Type into a committing field and commit it, as an author would. */
async function commitInto(input: HTMLInputElement, value: string) {
  await act(async () => {
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
  });
}

/** The emitted `T_a` key, read back out of the projected artifact. */
function emittedKeyTa(): {
  sk?: Array<{ id?: string; text?: string }>;
  flick?: Record<string, { id?: string; text?: string } | undefined>;
} {
  const content = runTransform("basic_kbdus").get(
    "source/basic_kbdus.keyman-touch-layout",
  )!.content as string;
  const parsed = JSON.parse(content) as {
    phone: {
      layer: Array<{
        id: string;
        row: Array<{
          key: Array<{
            id?: string;
            sk?: Array<{ id?: string; text?: string }>;
            flick?: Record<string, { id?: string; text?: string } | undefined>;
          }>;
        }>;
      }>;
    };
  };
  const defaultLayer = parsed.phone.layer.find((l) => l.id === "default")!;
  for (const row of defaultLayer.row) {
    const hit = row.key.find((k) => k.id === "T_a");
    if (hit) return hit;
  }
  throw new Error("T_a not found in the emitted artifact");
}

describe("TouchGallery key mode — gestures (spec 065 T040, US4)", () => {
  it("adds a longpress and a north-east flick, edits each, removes one, and all of it reaches the emitted artifact", async () => {
    seedKeyModeParityFixture();
    await renderTouchGalleryInKeyMode();

    fireEvent.click(screen.getByTestId("key-grid-cell-phone:default:T_a"));

    // The key starts with no gestures at all.
    expect(emittedKeyTa().sk).toBeUndefined();
    expect(emittedKeyTa().flick).toBeUndefined();

    // --- Add a longpress, then give it a keycap. ---------------------------
    await act(async () => {
      fireEvent.click(screen.getByTestId("gesture-panel-add-longpress"));
    });
    // Adding selects it, so its own property panel is already open (FR-027).
    expect(screen.getByTestId("gesture-panel-subkey-panel")).toBeTruthy();
    await commitInto(gestureInput("text"), "á");

    // --- Add a north-east flick, then give it a keycap. --------------------
    await act(async () => {
      fireEvent.click(screen.getByTestId("gesture-panel-add-flick-ne"));
    });
    await commitInto(gestureInput("text"), "Á");

    // Both reached the artifact.
    const withBoth = emittedKeyTa();
    expect(withBoth.sk?.map((s) => s.text)).toEqual(["á"]);
    expect(withBoth.flick?.["ne"]?.text).toBe("Á");

    // --- Remove the flick. -------------------------------------------------
    await act(async () => {
      fireEvent.click(screen.getByTestId("gesture-panel-entry-flick-ne"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("gesture-panel-subkey-remove"));
    });

    const afterRemove = emittedKeyTa();
    // The longpress survives, the flick is gone — and `flick` is DROPPED
    // entirely rather than left as an empty object, matching both appliers'
    // own emptied-collection discipline.
    expect(afterRemove.sk?.map((s) => s.text)).toEqual(["á"]);
    expect(afterRemove.flick).toBeUndefined();
  });

  it("keeps a gesture edit visible across a character/key mode round trip (FR-028)", async () => {
    seedKeyModeParityFixture();
    await renderTouchGalleryInKeyMode();

    fireEvent.click(screen.getByTestId("key-grid-cell-phone:default:T_a"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("gesture-panel-add-longpress"));
    });
    await commitInto(gestureInput("text"), "à");

    const opsAfterEdit = useWorkingCopyStore.getState().keyEditOverlay.ops.length;
    expect(opsAfterEdit).toBeGreaterThan(0);

    // Toggle to character mode and back.
    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-mode-tab-character"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-mode-tab-key"));
    });

    // The ONE overlay is intact — the toggle wrote nothing and lost nothing.
    expect(useWorkingCopyStore.getState().keyEditOverlay.ops.length).toBe(opsAfterEdit);
    // And the edit is still in the emitted artifact, which is the claim that
    // matters: both modes project from the same overlay.
    expect(emittedKeyTa().sk?.map((s) => s.text)).toEqual(["à"]);

    // The panel shows it again too, without the author re-selecting anything
    // they had not already selected.
    fireEvent.click(screen.getByTestId("key-grid-cell-phone:default:T_a"));
    expect(screen.getByTestId("gesture-panel")).toBeTruthy();
    expect(
      screen.getByTestId("gesture-panel-longpress").textContent ?? "",
    ).toContain("à");
  });

  it("commits every gesture edit through the one overlay, one op per edit (FR-028, FR-040)", async () => {
    seedKeyModeParityFixture();
    await renderTouchGalleryInKeyMode();

    fireEvent.click(screen.getByTestId("key-grid-cell-phone:default:T_a"));
    const before = useWorkingCopyStore.getState().keyEditOverlay.ops.length;

    await act(async () => {
      fireEvent.click(screen.getByTestId("gesture-panel-add-longpress"));
    });
    await commitInto(gestureInput("text"), "â");

    const ops = useWorkingCopyStore.getState().keyEditOverlay.ops;
    // Exactly two: the add and the keycap edit. Not one per keystroke.
    expect(ops.length).toBe(before + 2);
    expect(ops.slice(before).every((op) => op.kind === "setSubKey")).toBe(true);
  });
});
