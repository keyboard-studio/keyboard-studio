// Tests for workingCopyStore (modetoggle group) — split from workingCopyStore.test.ts by behaviour.
// See workingCopyStore.instantiate.test.ts for the original coverage overview.

import { describe, it, expect } from "vitest";
import { useWorkingCopyStore } from "./workingCopyStore.ts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { promoteOnManualEdit } from "../editors/assignLoop/touchBehavior.ts";

// ---------------------------------------------------------------------------
// spec 063 T078 (SC-011) — mode-toggle regression suite.
//
// The point of this block is narrower than "toggling works": a mode switch
// clearing touchDraft or keyEditOverlay "to tidy up" is EXACTLY the kind of
// change that looks reasonable in isolation and is precisely what someone
// adds later (see the task's own framing). setTouchEditorMode's current
// implementation is a bare `set({ touchEditorMode: mode })` — no other field
// — and this suite is written to fail loudly the moment that stops being
// true, whichever direction the clearing is added in (character->key or
// key->character), and regardless of how many toggles preceded it.
//
// Verified by temporarily reproducing the regression before writing these
// assertions: patching setTouchEditorMode to additionally
// `touchDraft: null, keyEditOverlay: { ops: [] }` on every call turns EVERY
// test in this block red (both the snapshot-equality checks and the
// not-null/non-empty sanity checks below) — see the T078 report for the
// before/after run. The patch was reverted; it is not part of this change.
// ---------------------------------------------------------------------------

describe("workingCopyStore — T078 mode-toggle regression suite (SC-011, FR-036a/b)", () => {
  /**
   * Seeds a NON-TRIVIAL touchDraft, keyEditOverlay, and undoStack (mixed
   * entry kinds: 'k' key edits plus an 'n' node delete) so a test asserting
   * "nothing changed" is actually exercising real state, not a vacuous check
   * against empty defaults. Returns the three snapshots to compare against
   * after every subsequent toggle.
   */
  function seedNonTrivialState() {
    useWorkingCopyStore.getState().setTouchDraft({
      charTouchEntries: [
        [
          "ñ",
          {
            scope: "individual",
            target: "ñ",
            modality: "touch",
            mechanisms: [
              { patternId: "longpress_alternates", slotValues: { hostKey: "K_N", char: "ñ" } },
            ],
            source: "user",
          },
        ],
      ],
      suggestionResolvedChars: ["ñ", "á"],
      bulkAccentGroups: [
        { id: "a:K_A", baseKey: "K_A", baseChar: "a", members: ["a", "á"] },
      ],
    });
    useWorkingCopyStore.getState().commitKeyEdit({
      address: "phone:default:K_A",
      kind: "suppress",
      spClass: 9,
      sentinelId: "T_none",
    });
    useWorkingCopyStore.getState().deleteNode("node-x");
    useWorkingCopyStore.getState().commitKeyEdit({
      address: "phone:default:K_B",
      kind: "rename",
      toId: "K_C",
    });

    const s = useWorkingCopyStore.getState();
    const expectedDraft = s.touchDraft;
    const expectedOps = s.keyEditOverlay.ops;
    const expectedUndo = s.undoStack;

    // Sanity: the seeded state is actually non-trivial. A test that "changes
    // nothing" against already-empty state proves nothing.
    expect(expectedDraft).not.toBeNull();
    expect(expectedOps).toHaveLength(2);
    expect(expectedUndo).toHaveLength(3);

    return { expectedDraft, expectedOps, expectedUndo };
  }

  it("N toggles in an arbitrary order (including repeats and both directions) leave touchDraft, keyEditOverlay.ops, and undoStack unchanged after EVERY single toggle", () => {
    const { expectedDraft, expectedOps, expectedUndo } = seedNonTrivialState();

    // Deliberately not a clean alternation: repeats ("key" twice running),
    // both directions, and an odd total length so the LAST toggle in the
    // sequence lands on each mode across the two runs below.
    const sequence: Array<"character" | "key"> = [
      "key",
      "character",
      "key",
      "key",
      "character",
      "character",
      "key",
      "character",
      "key",
    ];

    for (const mode of sequence) {
      useWorkingCopyStore.getState().setTouchEditorMode(mode);
      const s = useWorkingCopyStore.getState();

      // The mode itself actually changed (the toggle had an effect)...
      expect(s.touchEditorMode).toBe(mode);
      // ...but nothing else did. Checked after EVERY toggle, not just the
      // first and last — a bug that only clears on the SECOND switch (e.g.
      // a "settle" effect keyed off a prior-mode ref) would survive a
      // before/after-only assertion but not this one.
      expect(s.touchDraft).toEqual(expectedDraft);
      expect(s.keyEditOverlay.ops).toEqual(expectedOps);
      expect(s.undoStack).toEqual(expectedUndo);
    }
  });

  it("nothing is cleared as a side effect of a mode change — touchDraft specifically", () => {
    const { expectedDraft } = seedNonTrivialState();

    useWorkingCopyStore.getState().setTouchEditorMode("key");
    expect(useWorkingCopyStore.getState().touchDraft).not.toBeNull();
    expect(useWorkingCopyStore.getState().touchDraft).toEqual(expectedDraft);

    useWorkingCopyStore.getState().setTouchEditorMode("character");
    expect(useWorkingCopyStore.getState().touchDraft).not.toBeNull();
    expect(useWorkingCopyStore.getState().touchDraft).toEqual(expectedDraft);
  });

  it("nothing is cleared as a side effect of a mode change — keyEditOverlay specifically", () => {
    const { expectedOps } = seedNonTrivialState();

    useWorkingCopyStore.getState().setTouchEditorMode("key");
    expect(useWorkingCopyStore.getState().keyEditOverlay.ops.length).toBeGreaterThan(0);
    expect(useWorkingCopyStore.getState().keyEditOverlay.ops).toEqual(expectedOps);

    useWorkingCopyStore.getState().setTouchEditorMode("character");
    expect(useWorkingCopyStore.getState().keyEditOverlay.ops.length).toBeGreaterThan(0);
    expect(useWorkingCopyStore.getState().keyEditOverlay.ops).toEqual(expectedOps);
  });

  it("a sequence that STARTS already in 'key' mode (not the store default) also loses no state in either direction", () => {
    // Move to 'key' BEFORE any of the in-progress state exists, so this run
    // exercises "the working copy was already in key mode when the author
    // started doing key-mode work" rather than always starting from the
    // character-mode default.
    useWorkingCopyStore.getState().setTouchEditorMode("key");
    expect(useWorkingCopyStore.getState().touchEditorMode).toBe("key");

    useWorkingCopyStore.getState().commitKeyEdit({
      address: "phone:default:K_A",
      kind: "suppress",
      spClass: 9,
      sentinelId: "T_none",
    });
    useWorkingCopyStore.getState().commitKeyEdit({
      address: "phone:default:K_B",
      kind: "rename",
      toId: "K_C",
    });
    const opsAfterKeyModeWork = useWorkingCopyStore.getState().keyEditOverlay.ops;
    expect(opsAfterKeyModeWork).toHaveLength(2);

    // Switch away to do character-mode work, then back, more than once.
    useWorkingCopyStore.getState().setTouchEditorMode("character");
    useWorkingCopyStore.getState().setTouchDraft({
      charTouchEntries: [
        [
          "日",
          {
            scope: "individual",
            target: "日",
            modality: "touch",
            mechanisms: [
              { patternId: "multitap", slotValues: { hostKey: "K_D", char: "日" } },
            ],
            source: "user",
          },
        ],
      ],
      suggestionResolvedChars: ["日"],
    });
    const draftAfterCharacterModeWork = useWorkingCopyStore.getState().touchDraft;

    useWorkingCopyStore.getState().setTouchEditorMode("key");
    useWorkingCopyStore.getState().setTouchEditorMode("character");
    useWorkingCopyStore.getState().setTouchEditorMode("key");

    const s = useWorkingCopyStore.getState();
    // Key-mode work committed BEFORE the first switch away survived every
    // subsequent round trip...
    expect(s.keyEditOverlay.ops).toEqual(opsAfterKeyModeWork);
    // ...and so did character-mode work done WHILE away from key mode, once
    // the author switches back to it.
    expect(s.touchDraft).toEqual(draftAfterCharacterModeWork);
  });

  it("the undo stack (shared across both modes' entry kinds) is untouched by any mode toggle", () => {
    const { expectedUndo } = seedNonTrivialState();
    expect(expectedUndo.some((e) => e.k === "k")).toBe(true);
    expect(expectedUndo.some((e) => e.k === "n")).toBe(true);

    useWorkingCopyStore.getState().setTouchEditorMode("key");
    useWorkingCopyStore.getState().setTouchEditorMode("character");
    useWorkingCopyStore.getState().setTouchEditorMode("key");

    expect(useWorkingCopyStore.getState().undoStack).toEqual(expectedUndo);
  });
});

// ---------------------------------------------------------------------------
// spec-014 mutate-seam — setWorkingIR PRESERVES the carve-deletion overlay
//
// Regression for the Phase-5 MAJOR bug: the mutate-seam write path routed
// incremental IR patches (US1 mutate-apply, US2 touch re-propagation, US2
// touch promotion) through setIR, which RESETS deletedNodeIds/deletedItemIds/
// undoStack. Those writes fire AFTER the carve step, so enabling the
// mutate seam (then flag-gated) silently WIPED the live carve-deletion overlay that the
// OSK preview and shipped output project from startIr + the overlay. The fix
// routes those writes through setWorkingIR, which updates `ir` ONLY.
// ---------------------------------------------------------------------------

describe("workingCopyStore — setWorkingIR (mutate-seam overlay preservation)", () => {
  it("setWorkingIR updates ir WITHOUT clearing deletedNodeIds/deletedItemIds/undoStack", () => {
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().setIR(ir);

    // Seed a live carve-deletion overlay (node + item deletions).
    useWorkingCopyStore.getState().deleteNode("n1");
    useWorkingCopyStore.getState().deleteItem("n2#0");
    const before = useWorkingCopyStore.getState();
    expect(before.deletedNodeIds.has("n1")).toBe(true);
    expect(before.deletedItemIds.has("n2#0")).toBe(true);
    expect(before.undoStack).toHaveLength(2);

    // Perform a mutate-seam incremental write (e.g. US1 mutate-apply / US2
    // re-propagation) through the overlay-preserving setter.
    const next = makeTestIR([]);
    useWorkingCopyStore.getState().setWorkingIR(next);

    const after = useWorkingCopyStore.getState();
    // IR is updated...
    expect(after.ir).toBe(next);
    // ...but the carve-deletion overlay SURVIVES.
    expect(after.deletedNodeIds.has("n1")).toBe(true);
    expect(after.deletedItemIds.has("n2#0")).toBe(true);
    expect(after.undoStack).toHaveLength(2);
  });

  it("setWorkingIR preserves the overlay across a touch-promotion write (US2)", () => {
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().setIR(ir);
    useWorkingCopyStore.getState().deleteNode("carve-victim");
    useWorkingCopyStore.getState().deleteItem("carve-victim#r0");

    // Mirror TouchGallery.handleApply's promotion write: a hand-set promotion of
    // the working IR routed through the overlay-preserving setter. promoteOnManualEdit
    // returns the IR unchanged when no matching touch key exists, which is fine —
    // the assertion is about the OVERLAY, not the promotion's IR delta.
    const promoted = promoteOnManualEdit(useWorkingCopyStore.getState().ir!, "K_A");
    useWorkingCopyStore.getState().setWorkingIR(promoted);

    const after = useWorkingCopyStore.getState();
    expect(after.deletedNodeIds.has("carve-victim")).toBe(true);
    expect(after.deletedItemIds.has("carve-victim#r0")).toBe(true);
    expect(after.undoStack).toHaveLength(2);
  });

  it("setIR (base/full replacement) STILL clears the overlay — distinct from setWorkingIR", () => {
    // Guards the intentional contrast: setIR retains its reset behavior for
    // base/full IR replacement; only setWorkingIR preserves the overlay.
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().setIR(ir);
    useWorkingCopyStore.getState().deleteNode("n1");

    useWorkingCopyStore.getState().setIR(makeTestIR([]));

    const after = useWorkingCopyStore.getState();
    expect(after.deletedNodeIds.size).toBe(0);
    expect(after.undoStack).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Cross-adapter isolation — IR actions don't bleed into survey state
// ---------------------------------------------------------------------------

describe("workingCopyStore — cross-adapter isolation", () => {
  it("carve deletions do not affect phaseResults", () => {
    const phaseA: SurveyPhaseResult = {
      phase: "A",
      answers: [],
      computedAxes: { scriptClass: "alphabetic" },
    };
    useWorkingCopyStore.getState().recordPhase(phaseA);
    useWorkingCopyStore.getState().deleteNode("n1");

    // phaseResults unchanged by deleteNode
    expect(useWorkingCopyStore.getState().phaseResults).toHaveLength(1);
    expect(useWorkingCopyStore.getState().deletedNodeIds.has("n1")).toBe(true);
  });

  it("survey recordPhase does not affect carve IR", () => {
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().setIR(ir);
    const phaseA: SurveyPhaseResult = {
      phase: "A",
      answers: [],
      computedAxes: { scriptClass: "alphabetic" },
    };
    useWorkingCopyStore.getState().recordPhase(phaseA);

    // IR unchanged by recordPhase
    expect(useWorkingCopyStore.getState().ir).toBe(ir);
  });
});