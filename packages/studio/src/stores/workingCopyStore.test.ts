// Tests for workingCopyStore — the single canonical source of truth.
//
// Coverage:
//   1. Initial state: all slots null/empty.
//   2. instantiateFromBase (Track 1): sets base slots + seeds IR, resets identity +
//      edit layers + phaseResults, sets instantiationMode = "new-from-base".
//   3. instantiateFromExisting (Track 2): sets base slots + seeds IR, preserves
//      identity from loaded keyboard, sets instantiationMode = "adapt-existing".
//   4. setIdentity: stores and replaces identity patches.
//   5. reset(): clears all slots including instantiationMode + identity + base slots.
//   6. State consistency: mutations via actions are visible in the same store.
//   7. Cross-slice isolation: IR actions don't bleed into survey state.
//   8. Per-working-copy Phase B proposal decisions (spec 044 FR-016a): both
//      instantiate entry points clear the sticky rejected/declined flags.
//
// Tests in irStore.test.ts and surveyResultsStore.test.ts own exhaustive
// coverage of the carve and survey action semantics respectively; this file
// focuses on the Phase-2 / instantiation surface.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useWorkingCopyStore, bindManifest } from "./workingCopyStore.ts";
import { usePhaseBDraftStore, resetPhaseBDraftDecisions } from "./phaseBDraftStore.ts";
import { makeTestIR, makeCharStore } from "@keyboard-studio/contracts/fixtures";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { makeTouchKeyRuleJoinFixture, TOUCH_JOIN_IDS } from "@keyboard-studio/contracts/fixtures";
import { createVirtualFS, irPath, ARRAY_INDEX } from "@keyboard-studio/contracts";
import { defaultFillAxes, selectStrategy } from "@keyboard-studio/engine";
import type {
  DiscoveryAxisVector,
  IRGroup,
  IRStore,
  KeyboardIR,
  RemovalCapability,
  SurveyPhaseResult,
} from "@keyboard-studio/contracts";
import type { SourcedInventory } from "@keyboard-studio/engine";
import type { Step, EditorStep } from "../steps/types.ts";
import { promoteOnManualEdit } from "../editors/assignLoop/touchBehavior.ts";

// ---------------------------------------------------------------------------
// Reset helpers — clear all state between tests.
// ---------------------------------------------------------------------------

function resetAll() {
  useWorkingCopyStore.getState().reset();
}

beforeEach(resetAll);

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe("workingCopyStore — initial state", () => {
  it("instantiationMode starts null", () => {
    expect(useWorkingCopyStore.getState().instantiationMode).toBeNull();
  });

  it("base slots start null", () => {
    const s = useWorkingCopyStore.getState();
    expect(s.baseKeyboard).toBeNull();
    expect(s.baseVfs).toBeNull();
    expect(s.baseIr).toBeNull();
    expect(s.identity).toBeNull();
  });

  it("carve slots start empty", () => {
    const s = useWorkingCopyStore.getState();
    expect(s.ir).toBeNull();
    expect(s.deletedNodeIds.size).toBe(0);
    expect(s.deletedTouchKeyIds.size).toBe(0);
    expect(s.undoStack).toHaveLength(0);
  });

  it("survey slots start empty", () => {
    const s = useWorkingCopyStore.getState();
    expect(s.phaseResults).toEqual([]);
    expect(s.session.axes).toEqual({});
    expect(s.session.assignments).toEqual([]);
    expect(s.desktopLocked).toBe(false);
  });

  it("isInstantiated returns false before any instantiation", () => {
    expect(useWorkingCopyStore.getState().isInstantiated()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// instantiateFromBase — Track 1
// ---------------------------------------------------------------------------

describe("workingCopyStore — instantiateFromBase (Track 1)", () => {
  it("sets instantiationMode to new-from-base", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
    expect(useWorkingCopyStore.getState().instantiationMode).toBe("new-from-base");
  });

  it("sets baseKeyboard, baseVfs, baseIr, and seeds carve IR", () => {
    const vfs = createVirtualFS([
      { path: "source/test.kmn", content: "c hello\n", isBinary: false },
    ]);
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });

    const s = useWorkingCopyStore.getState();
    expect(s.baseKeyboard).toBe(basicKbdus);
    expect(s.baseVfs).toBe(vfs);
    expect(s.baseIr).toBe(ir);
    // carve IR seeded from base IR
    expect(s.ir).toBe(ir);
  });

  it("resets identity to null (new keyboard starts without an overlay)", () => {
    // Set an identity first, then instantiate from a base.
    useWorkingCopyStore.getState().setIdentity({ bcp47: "ha-Latn", displayName: "Hausa" });
    expect(useWorkingCopyStore.getState().identity).not.toBeNull();

    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });

    expect(useWorkingCopyStore.getState().identity).toBeNull();
  });

  it("clears prior carve deletion state on instantiation", () => {
    // Set up prior state that should be cleared.
    const oldIr = makeTestIR([]);
    useWorkingCopyStore.getState().setIR(oldIr);
    useWorkingCopyStore.getState().deleteNode("n1");
    expect(useWorkingCopyStore.getState().deletedNodeIds.size).toBe(1);

    const newVfs = createVirtualFS();
    const newIr = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs: newVfs, ir: newIr });

    const s = useWorkingCopyStore.getState();
    expect(s.deletedNodeIds.size).toBe(0);
    expect(s.undoStack).toHaveLength(0);
    expect(s.ir).toBe(newIr);
  });

  // Was: "clears prior phaseResults so a fresh session starts clean" — that
  // title encoded the race-condition bug (asserting a first, late instantiate
  // must wipe pre-recorded phaseResults). Split into two precise assertions:
  // a truly fresh session (no pre-recorded phaseResults) stays empty here, and
  // the late-instantiate-preserves-progress case is covered in the
  // "instantiateFromBase idempotence" describe block below (see "preserves
  // phaseResults recorded BEFORE the first (late) instantiate call").
  it("a truly fresh session (no prior phaseResults) stays empty after instantiateFromBase", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });

    expect(useWorkingCopyStore.getState().phaseResults).toHaveLength(0);
    expect(useWorkingCopyStore.getState().session.axes).toEqual({});
  });

  it("clears desktopLocked on re-instantiation", () => {
    useWorkingCopyStore.getState().lockDesktop();
    expect(useWorkingCopyStore.getState().desktopLocked).toBe(true);

    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });

    expect(useWorkingCopyStore.getState().desktopLocked).toBe(false);
  });

  it("isInstantiated returns true after instantiateFromBase", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
    expect(useWorkingCopyStore.getState().isInstantiated()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// instantiateFromBase — idempotence (same base id)
// ---------------------------------------------------------------------------

describe("workingCopyStore — instantiateFromBase idempotence", () => {
  it("is a no-op when called a second time with the SAME base keyboard id", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    // First call — instantiates normally.
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });

    // Record some phase progress.
    const phaseA: SurveyPhaseResult = {
      phase: "A",
      answers: [],
      computedAxes: { scriptClass: "alphabetic" },
    };
    useWorkingCopyStore.getState().recordPhase(phaseA);
    expect(useWorkingCopyStore.getState().phaseResults).toHaveLength(1);

    // Second call with the SAME base id — must NOT clear phaseResults.
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
    expect(useWorkingCopyStore.getState().phaseResults).toHaveLength(1);
    expect(useWorkingCopyStore.getState().phaseResults[0]?.phase).toBe("A");
  });

  it("re-instantiates (clears phaseResults) when called with a DIFFERENT base keyboard id", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });

    // Record phase progress.
    const phaseA: SurveyPhaseResult = {
      phase: "A",
      answers: [],
      computedAxes: { scriptClass: "alphabetic" },
    };
    useWorkingCopyStore.getState().recordPhase(phaseA);
    expect(useWorkingCopyStore.getState().phaseResults).toHaveLength(1);

    // A different base keyboard has a different id.
    const differentBase = { ...basicKbdus, id: "different_keyboard_id" };
    useWorkingCopyStore.getState().instantiateFromBase(differentBase, { vfs, ir });

    // phaseResults must have been cleared.
    expect(useWorkingCopyStore.getState().phaseResults).toHaveLength(0);
    expect(useWorkingCopyStore.getState().baseKeyboard?.id).toBe("different_keyboard_id");
  });

  // Regression: the async compile pipeline (WASM kmcmplib oracle) that produces
  // vfs/ir/removalCapabilities is decoupled from the survey flow and can settle
  // LATE — after Phase A/B has already recorded phaseResults against the
  // pending base selection. On that FIRST instantiate call, baseKeyboard is
  // still null, so a guard keyed only on "baseKeyboard.id already matches"
  // never triggers. This reproduces that exact ordering: record phaseResults
  // BEFORE the one-and-only instantiateFromBase call lands.
  it("preserves phaseResults recorded BEFORE the first (late) instantiate call for the same base", () => {
    const phaseA: SurveyPhaseResult = {
      phase: "A",
      answers: [],
      computedAxes: { scriptClass: "alphabetic" },
    };
    // Survey records progress while baseKeyboard is still null (compile has
    // not settled yet) — mirrors Phase A/B completing before onInstantiate fires.
    useWorkingCopyStore.getState().recordPhase(phaseA);
    expect(useWorkingCopyStore.getState().phaseResults).toHaveLength(1);
    expect(useWorkingCopyStore.getState().baseKeyboard).toBeNull();

    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    // The late-settling compile now fires the FIRST instantiate for this base.
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });

    // phaseResults recorded before instantiation must survive.
    expect(useWorkingCopyStore.getState().phaseResults).toHaveLength(1);
    expect(useWorkingCopyStore.getState().phaseResults[0]?.phase).toBe("A");
    expect(useWorkingCopyStore.getState().baseKeyboard?.id).toBe(basicKbdus.id);
  });

  // Regression (km-triage pre-merge item): the case-1 no-op guard
  // must key on id AND mode, not id alone. A SAME-id call arriving while the
  // store is in a DIFFERENT mode (e.g. the working copy was instantiated via
  // Track 2 for this keyboard, and Track 1's instantiateFromBase then fires
  // for the same id via the independent Preview/Output picker pipeline — see
  // usePreviewArtifact.ts / confirmRebase.ts) is a genuine track switch, not a
  // redundant re-fire, and must re-instantiate (mode flips, identity resets
  // per Track 1 semantics) rather than silently no-op and strand the working
  // copy in the old track.
  it("re-instantiates (mode flips to new-from-base) on a SAME-id call while in a DIFFERENT mode", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    // Instantiate via Track 2 first — mode is "adapt-existing".
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir });
    expect(useWorkingCopyStore.getState().instantiationMode).toBe("adapt-existing");
    expect(useWorkingCopyStore.getState().identity?.keyboardId).toBe(basicKbdus.id);

    const phaseA: SurveyPhaseResult = {
      phase: "A",
      answers: [],
      computedAxes: { scriptClass: "alphabetic" },
    };
    useWorkingCopyStore.getState().recordPhase(phaseA);
    expect(useWorkingCopyStore.getState().phaseResults).toHaveLength(1);

    // Same keyboard id, but instantiateFromBase (Track 1) fires — a track
    // switch, not a redundant re-fire. Must NOT no-op.
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });

    expect(useWorkingCopyStore.getState().instantiationMode).toBe("new-from-base");
    // Track 1 resets identity to null (fresh copy, no overlay until Phase A).
    expect(useWorkingCopyStore.getState().identity).toBeNull();
    // A track switch is treated like a genuine base switch: survey progress
    // recorded under the old track does not carry over.
    expect(useWorkingCopyStore.getState().phaseResults).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// instantiateFromExisting — Track 2
// ---------------------------------------------------------------------------

describe("workingCopyStore — instantiateFromExisting (Track 2)", () => {
  it("sets instantiationMode to adapt-existing", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir });
    expect(useWorkingCopyStore.getState().instantiationMode).toBe("adapt-existing");
  });

  it("sets baseKeyboard, baseVfs, baseIr, and seeds carve IR", () => {
    const vfs = createVirtualFS([
      { path: "source/test.kmn", content: "c hello\n", isBinary: false },
    ]);
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir });

    const s = useWorkingCopyStore.getState();
    expect(s.baseKeyboard).toBe(basicKbdus);
    expect(s.baseVfs).toBe(vfs);
    expect(s.baseIr).toBe(ir);
    expect(s.ir).toBe(ir);
  });

  it("preserves identity from loaded keyboard displayName", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir });

    const s = useWorkingCopyStore.getState();
    expect(s.identity).not.toBeNull();
    expect(s.identity?.displayName).toBe(basicKbdus.displayName);
  });

  it("does NOT reset identity to null (Track 2 preserves it)", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir });
    expect(useWorkingCopyStore.getState().identity).not.toBeNull();
  });

  it("sets identity.keyboardId from the loaded keyboard's id (preserve-identity contract)", () => {
    // Regression guard: downstream consumers (serializeWorkingCopy zip filename,
    // MechanismGallery scaffoldSpec, lint identity checks) read identity.keyboardId
    // — undefined here is a defect per spec v1.3.1 §3c.
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir });
    const s = useWorkingCopyStore.getState();
    expect(s.identity?.keyboardId).toBe(basicKbdus.id);
  });

  it("clears carve deletion state on instantiation", () => {
    const oldIr = makeTestIR([]);
    useWorkingCopyStore.getState().setIR(oldIr);
    useWorkingCopyStore.getState().deleteNode("n1");
    expect(useWorkingCopyStore.getState().deletedNodeIds.size).toBe(1);

    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir });

    expect(useWorkingCopyStore.getState().deletedNodeIds.size).toBe(0);
    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(0);
  });

  // Regression (was: "clears phaseResults so adapt session starts clean").
  // That title encoded the race-condition bug: the async compile pipeline
  // (WASM kmcmplib oracle) that produces vfs/ir/removalCapabilities is
  // decoupled from the survey flow and can settle LATE, after Phase A/B has
  // already recorded phaseResults against the pending base selection. At the
  // point recordPhase ran here, baseKeyboard was still null (compile not yet
  // settled) — indistinguishable from a fresh session — so this is the FIRST
  // instantiate for this base, not a redundant one, and must preserve the
  // survey progress recorded while the compile was in flight rather than
  // wiping it. A genuine base SWITCH (see the describe block below) still
  // resets as before.
  it("preserves phaseResults recorded BEFORE the first (late) instantiate for the same base", () => {
    const phaseA: SurveyPhaseResult = {
      phase: "A",
      answers: [],
      computedAxes: { scriptClass: "alphabetic" },
    };
    useWorkingCopyStore.getState().recordPhase(phaseA);
    expect(useWorkingCopyStore.getState().phaseResults).toHaveLength(1);
    expect(useWorkingCopyStore.getState().baseKeyboard).toBeNull();

    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir });

    expect(useWorkingCopyStore.getState().phaseResults).toHaveLength(1);
    expect(useWorkingCopyStore.getState().phaseResults[0]?.phase).toBe("A");
  });

  it("isInstantiated returns true after instantiateFromExisting", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir });
    expect(useWorkingCopyStore.getState().isInstantiated()).toBe(true);
  });

  it("track 1 and track 2 can be distinguished by instantiationMode", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);

    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
    expect(useWorkingCopyStore.getState().instantiationMode).toBe("new-from-base");

    useWorkingCopyStore.getState().reset();

    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir });
    expect(useWorkingCopyStore.getState().instantiationMode).toBe("adapt-existing");
  });
});

// ---------------------------------------------------------------------------
// instantiateFromExisting — idempotence / base-switch (Track 2)
// ---------------------------------------------------------------------------

describe("workingCopyStore — instantiateFromExisting idempotence and base switch", () => {
  it("is a no-op (preserves phaseResults) when called a second time with the SAME keyboard id", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir });

    const phaseA: SurveyPhaseResult = {
      phase: "A",
      answers: [],
      computedAxes: { scriptClass: "alphabetic" },
    };
    useWorkingCopyStore.getState().recordPhase(phaseA);
    expect(useWorkingCopyStore.getState().phaseResults).toHaveLength(1);

    // Second call with the SAME keyboard id (e.g. a redundant re-fire) — must
    // NOT clear phaseResults.
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir });
    expect(useWorkingCopyStore.getState().phaseResults).toHaveLength(1);
    expect(useWorkingCopyStore.getState().phaseResults[0]?.phase).toBe("A");
  });

  it("re-instantiates (clears phaseResults) on a genuine base SWITCH to a DIFFERENT keyboard id", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir });

    const phaseA: SurveyPhaseResult = {
      phase: "A",
      answers: [],
      computedAxes: { scriptClass: "alphabetic" },
    };
    useWorkingCopyStore.getState().recordPhase(phaseA);
    expect(useWorkingCopyStore.getState().phaseResults).toHaveLength(1);

    const differentKeyboard = { ...basicKbdus, id: "different_keyboard_id" };
    useWorkingCopyStore.getState().instantiateFromExisting(differentKeyboard, { vfs, ir });

    expect(useWorkingCopyStore.getState().phaseResults).toHaveLength(0);
    expect(useWorkingCopyStore.getState().baseKeyboard?.id).toBe("different_keyboard_id");
  });

  // Regression (km-triage pre-merge item) — Track 2 mirror of the
  // instantiateFromBase track-switch test above. A SAME-id call arriving while
  // the store is in a DIFFERENT mode (working copy instantiated via Track 1
  // for this keyboard, then instantiateFromExisting fires for the same id) is
  // a genuine track switch and must re-instantiate (mode flips, identity now
  // PRESERVED per Track 2 semantics) rather than no-op.
  it("re-instantiates (mode flips to adapt-existing) on a SAME-id call while in a DIFFERENT mode", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    // Instantiate via Track 1 first — mode is "new-from-base", identity null.
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
    expect(useWorkingCopyStore.getState().instantiationMode).toBe("new-from-base");
    expect(useWorkingCopyStore.getState().identity).toBeNull();

    const phaseA: SurveyPhaseResult = {
      phase: "A",
      answers: [],
      computedAxes: { scriptClass: "alphabetic" },
    };
    useWorkingCopyStore.getState().recordPhase(phaseA);
    expect(useWorkingCopyStore.getState().phaseResults).toHaveLength(1);

    // Same keyboard id, but instantiateFromExisting (Track 2) fires — a track
    // switch, not a redundant re-fire. Must NOT no-op.
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir });

    expect(useWorkingCopyStore.getState().instantiationMode).toBe("adapt-existing");
    // Track 2 preserves identity from the loaded keyboard's metadata.
    expect(useWorkingCopyStore.getState().identity?.keyboardId).toBe(basicKbdus.id);
    // A track switch is treated like a genuine base switch: survey progress
    // recorded under the old track does not carry over.
    expect(useWorkingCopyStore.getState().phaseResults).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// setIdentity
// ---------------------------------------------------------------------------

describe("workingCopyStore — setIdentity", () => {
  it("stores the identity patch", () => {
    useWorkingCopyStore.getState().setIdentity({ bcp47: "ha-Latn", displayName: "Hausa" });
    const s = useWorkingCopyStore.getState();
    expect(s.identity?.bcp47).toBe("ha-Latn");
    expect(s.identity?.displayName).toBe("Hausa");
  });

  it("replaces a prior identity patch", () => {
    useWorkingCopyStore.getState().setIdentity({ bcp47: "ha-Latn" });
    useWorkingCopyStore.getState().setIdentity({ bcp47: "sw-Latn", displayName: "Swahili" });
    const s = useWorkingCopyStore.getState();
    expect(s.identity?.bcp47).toBe("sw-Latn");
  });

  it("partial patches are allowed (exactOptionalPropertyTypes safe)", () => {
    useWorkingCopyStore.getState().setIdentity({ displayName: "Hausa" });
    const s = useWorkingCopyStore.getState();
    // bcp47 is absent, not set to undefined
    expect("bcp47" in (s.identity ?? {})).toBe(false);
    expect(s.identity?.displayName).toBe("Hausa");
  });

  it("accepts keyboardId in the patch", () => {
    useWorkingCopyStore.getState().setIdentity({ keyboardId: "ha_sil" });
    expect(useWorkingCopyStore.getState().identity?.keyboardId).toBe("ha_sil");
  });

  it("setIdentity with keyboardId + displayName stores both fields", () => {
    useWorkingCopyStore.getState().setIdentity({
      keyboardId: "ha_sil",
      displayName: "Hausa SIL",
    });
    const s = useWorkingCopyStore.getState();
    expect(s.identity?.keyboardId).toBe("ha_sil");
    expect(s.identity?.displayName).toBe("Hausa SIL");
  });
});

// ---------------------------------------------------------------------------
// reset clears all slots including base + identity + instantiationMode
// ---------------------------------------------------------------------------

describe("workingCopyStore — reset", () => {
  it("reset clears instantiationMode", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
    expect(useWorkingCopyStore.getState().instantiationMode).toBe("new-from-base");

    useWorkingCopyStore.getState().reset();
    expect(useWorkingCopyStore.getState().instantiationMode).toBeNull();
  });

  it("reset clears instantiationMode (adapt-existing)", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir });
    expect(useWorkingCopyStore.getState().instantiationMode).toBe("adapt-existing");

    useWorkingCopyStore.getState().reset();
    expect(useWorkingCopyStore.getState().instantiationMode).toBeNull();
  });

  it("reset clears baseKeyboard, baseVfs, baseIr, and identity", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
    useWorkingCopyStore.getState().setIdentity({ bcp47: "ha-Latn" });

    useWorkingCopyStore.getState().reset();
    const s = useWorkingCopyStore.getState();
    expect(s.baseKeyboard).toBeNull();
    expect(s.baseVfs).toBeNull();
    expect(s.baseIr).toBeNull();
    expect(s.identity).toBeNull();
  });

  it("reset clears carve IR slots", () => {
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().setIR(ir);
    useWorkingCopyStore.getState().deleteNode("n1");
    useWorkingCopyStore.getState().reset();

    const s = useWorkingCopyStore.getState();
    expect(s.ir).toBeNull();
    expect(s.deletedNodeIds.size).toBe(0);
    expect(s.undoStack).toHaveLength(0);
  });

  it("reset clears survey slots including desktopLocked", () => {
    const phaseA: SurveyPhaseResult = {
      phase: "A",
      answers: [],
      computedAxes: { scriptClass: "alphabetic" },
    };
    useWorkingCopyStore.getState().recordPhase(phaseA);
    useWorkingCopyStore.getState().lockDesktop();
    useWorkingCopyStore.getState().reset();

    const s = useWorkingCopyStore.getState();
    expect(s.phaseResults).toEqual([]);
    expect(s.session.axes).toEqual({});
    expect(s.desktopLocked).toBe(false);
  });

  it("reset clears deletedTouchKeyIds", () => {
    useWorkingCopyStore.getState().deleteTouchKey("phone:default:U_0064");
    expect(useWorkingCopyStore.getState().deletedTouchKeyIds.size).toBe(1);

    useWorkingCopyStore.getState().reset();
    expect(useWorkingCopyStore.getState().deletedTouchKeyIds.size).toBe(0);
  });

  it("reset clears sequenceFlaggedChars", () => {
    useWorkingCopyStore.getState().flagCharForSequence("á");
    expect(useWorkingCopyStore.getState().sequenceFlaggedChars).toEqual(["á"]);

    useWorkingCopyStore.getState().reset();
    expect(useWorkingCopyStore.getState().sequenceFlaggedChars).toEqual([]);
  });

  it("isInstantiated returns false after reset (from instantiateFromBase)", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
    expect(useWorkingCopyStore.getState().isInstantiated()).toBe(true);
    useWorkingCopyStore.getState().reset();
    expect(useWorkingCopyStore.getState().isInstantiated()).toBe(false);
  });

  it("isInstantiated returns false after reset (from instantiateFromExisting)", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir });
    expect(useWorkingCopyStore.getState().isInstantiated()).toBe(true);
    useWorkingCopyStore.getState().reset();
    expect(useWorkingCopyStore.getState().isInstantiated()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// State consistency — mutations are visible in the same store
// ---------------------------------------------------------------------------

describe("workingCopyStore — IR state consistency", () => {
  it("setIR is visible in getState() immediately", () => {
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().setIR(ir);
    expect(useWorkingCopyStore.getState().ir).toBe(ir);
  });

  it("deleteNode is visible in getState() immediately", () => {
    useWorkingCopyStore.getState().deleteNode("n1");
    expect(useWorkingCopyStore.getState().deletedNodeIds.has("n1")).toBe(true);
    expect(useWorkingCopyStore.getState().isDeleted("n1")).toBe(true);
  });

  it("setState partial update clears IR correctly", () => {
    const ir = makeTestIR([]);
    // Mirrors the reset pattern in irStore.test.ts.
    useWorkingCopyStore.setState({ ir: null, deletedNodeIds: new Set(), undoStack: [] });
    expect(useWorkingCopyStore.getState().ir).toBeNull();
    // Now set IR and verify setState can clear it.
    useWorkingCopyStore.getState().setIR(ir);
    useWorkingCopyStore.setState({ ir: null, deletedNodeIds: new Set(), undoStack: [] });
    expect(useWorkingCopyStore.getState().ir).toBeNull();
  });
});

describe("workingCopyStore — survey state consistency", () => {
  it("recordPhase is visible in getState() immediately", () => {
    const phaseA: SurveyPhaseResult = {
      phase: "A",
      answers: [],
      computedAxes: { scriptClass: "alphabetic" },
    };
    useWorkingCopyStore.getState().recordPhase(phaseA);
    const s = useWorkingCopyStore.getState();
    expect(s.phaseResults).toHaveLength(1);
    expect(s.session.axes.scriptClass).toBe("alphabetic");
  });

  it("lockDesktop is visible in getState() immediately", () => {
    useWorkingCopyStore.getState().lockDesktop();
    expect(useWorkingCopyStore.getState().desktopLocked).toBe(true);
  });

  it("reset() clears all survey AND base slots", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
    useWorkingCopyStore.getState().lockDesktop();
    useWorkingCopyStore.getState().reset();
    expect(useWorkingCopyStore.getState().desktopLocked).toBe(false);
    expect(useWorkingCopyStore.getState().baseKeyboard).toBeNull();
  });
});

// touchAssignments store slot removed — output uses touchLayoutJson (serializeWorkingCopy.ts).
// The recordTouchAssignments action was removed in the gallery-dedup refactor.

// ---------------------------------------------------------------------------
// removalCapabilities — computed once at instantiate, preserved across carve edits
// ---------------------------------------------------------------------------

describe("workingCopyStore — removalCapabilities slot", () => {
  it("starts as an empty Map", () => {
    expect(useWorkingCopyStore.getState().removalCapabilities.size).toBe(0);
  });

  it("instantiateFromBase sets removalCapabilities from opts", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    const caps = new Map<string, RemovalCapability>([
      ["rule#1", "removable:simple"],
      ["store#dkt", "removable:slot-fill"],
    ]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir, removalCapabilities: caps });
    const s = useWorkingCopyStore.getState();
    expect(s.removalCapabilities).toBe(caps);
    expect(s.removalCapabilities.get("rule#1")).toBe("removable:simple");
  });

  it("instantiateFromBase defaults to empty Map when removalCapabilities not provided", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
    expect(useWorkingCopyStore.getState().removalCapabilities.size).toBe(0);
  });

  it("instantiateFromExisting sets removalCapabilities from opts", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    const caps = new Map<string, RemovalCapability>([
      ["rule#2", "not-removable:context-sensitive"],
    ]);
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir, removalCapabilities: caps });
    expect(useWorkingCopyStore.getState().removalCapabilities.get("rule#2")).toBe("not-removable:context-sensitive");
  });

  it("instantiateFromExisting defaults to empty Map when removalCapabilities not provided (Track 2)", () => {
    // Mirror of the Track 1 (instantiateFromBase) default-empty test.
    // When the import path can't classify (e.g. parse failure), the working copy
    // must still initialise cleanly with an empty map rather than crashing.
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir });
    expect(useWorkingCopyStore.getState().removalCapabilities.size).toBe(0);
  });

  it("setIR does NOT clear removalCapabilities", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    const caps = new Map<string, RemovalCapability>([["rule#1", "removable:simple"]]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir, removalCapabilities: caps });

    // Simulate a carve edit that calls setIR with a mutated IR.
    const newIr = makeTestIR([]);
    useWorkingCopyStore.getState().setIR(newIr);

    // removalCapabilities must survive — it derives from baseIr, not carve IR.
    expect(useWorkingCopyStore.getState().removalCapabilities.get("rule#1")).toBe("removable:simple");
  });

  it("deleteItem (carve deletion) preserves removalCapabilities", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    const caps = new Map<string, RemovalCapability>([["rule#1", "removable:simple"]]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir, removalCapabilities: caps });

    useWorkingCopyStore.getState().deleteItem("rule#1");

    expect(useWorkingCopyStore.getState().removalCapabilities.get("rule#1")).toBe("removable:simple");
  });

  it("reset clears removalCapabilities", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    const caps = new Map<string, RemovalCapability>([["rule#1", "removable:simple"]]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir, removalCapabilities: caps });
    expect(useWorkingCopyStore.getState().removalCapabilities.size).toBe(1);

    useWorkingCopyStore.getState().reset();
    expect(useWorkingCopyStore.getState().removalCapabilities.size).toBe(0);
  });

  it("idempotent instantiateFromBase (same base id) preserves removalCapabilities", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    const caps = new Map<string, RemovalCapability>([["rule#1", "removable:simple"]]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir, removalCapabilities: caps });

    // Second call with same base id — idempotence guard fires, no overwrite.
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
    // Capabilities from the first call must still be intact.
    expect(useWorkingCopyStore.getState().removalCapabilities.get("rule#1")).toBe("removable:simple");
  });
});

// ---------------------------------------------------------------------------
// #523 — deleteItem/restoreItem/isItemDeleted round-trip with a chip-format
// id ("<storeNodeId>#<itemsIndex>"). deleteItem/restoreItem are id-agnostic
// (any string works, including the store-slot id shape), so this is a
// regression guard that the per-character store chip toggle path reuses the
// SAME infra as glyph-level carving without any special-casing.
// ---------------------------------------------------------------------------

describe("workingCopyStore — deleteItem/restoreItem round-trip with a chip-format id", () => {
  it("deleteItem then restoreItem with a chip id clears isItemDeleted and pops the undo entry", () => {
    const chipId = "store#dktX#1";

    useWorkingCopyStore.getState().deleteItem(chipId);
    expect(useWorkingCopyStore.getState().isItemDeleted(chipId)).toBe(true);
    expect(useWorkingCopyStore.getState().undoStack).toEqual([{ k: "i", id: chipId }]);

    useWorkingCopyStore.getState().restoreItem(chipId);
    expect(useWorkingCopyStore.getState().isItemDeleted(chipId)).toBe(false);
    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(0);
  });

  it("undoDelete pops a chip-id deletion off the stack the same as any other item id", () => {
    const chipId = "store#dktX#2";

    useWorkingCopyStore.getState().deleteItem(chipId);
    expect(useWorkingCopyStore.getState().isItemDeleted(chipId)).toBe(true);

    useWorkingCopyStore.getState().undoDelete();
    expect(useWorkingCopyStore.getState().isItemDeleted(chipId)).toBe(false);
    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// deleteTouchKey/restoreTouchKey/isTouchKeyDeleted — the touch-method deletion
// overlay (separate id space + undo channel from deletedItemIds/deleteItem).
// ---------------------------------------------------------------------------

describe("workingCopyStore — deleteTouchKey/restoreTouchKey round-trip", () => {
  it("deleteTouchKey marks the address deleted and pushes a 't' undo entry", () => {
    const touchId = "phone:default:U_0061:sk:U_00E1";

    useWorkingCopyStore.getState().deleteTouchKey(touchId);
    expect(useWorkingCopyStore.getState().isTouchKeyDeleted(touchId)).toBe(true);
    expect(useWorkingCopyStore.getState().undoStack).toEqual([{ k: "t", id: touchId }]);
  });

  it("restoreTouchKey clears the address and pops its undo entry", () => {
    const touchId = "phone:default:U_0061";

    useWorkingCopyStore.getState().deleteTouchKey(touchId);
    useWorkingCopyStore.getState().restoreTouchKey(touchId);

    expect(useWorkingCopyStore.getState().isTouchKeyDeleted(touchId)).toBe(false);
    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(0);
  });

  it("undoDelete reverses the most recent touch-key deletion", () => {
    const touchId = "phone:default:U_0062";

    useWorkingCopyStore.getState().deleteTouchKey(touchId);
    expect(useWorkingCopyStore.getState().isTouchKeyDeleted(touchId)).toBe(true);

    useWorkingCopyStore.getState().undoDelete();
    expect(useWorkingCopyStore.getState().isTouchKeyDeleted(touchId)).toBe(false);
    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(0);
  });

  it("touch-key deletions and item deletions occupy separate id spaces and undo independently", () => {
    const touchId = "phone:default:U_0063";
    const itemId = "phone:default:U_0063"; // same literal string, different channel

    useWorkingCopyStore.getState().deleteTouchKey(touchId);
    useWorkingCopyStore.getState().deleteItem(itemId);

    expect(useWorkingCopyStore.getState().isTouchKeyDeleted(touchId)).toBe(true);
    expect(useWorkingCopyStore.getState().isItemDeleted(itemId)).toBe(true);

    // Undo pops the most recent entry (the item deletion) without touching
    // the touch-key deletion.
    useWorkingCopyStore.getState().undoDelete();
    expect(useWorkingCopyStore.getState().isItemDeleted(itemId)).toBe(false);
    expect(useWorkingCopyStore.getState().isTouchKeyDeleted(touchId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// keepAll/restoreAll must account for deletedTouchKeyIds — regression for the
// bug where a pending 't' undo entry was orphaned (undoStack wiped while
// deletedTouchKeyIds stayed applied) by a carve keepAll/restoreAll. Both
// actions restore the invariant: after either call, undoStack is empty AND
// deletedNodeIds/deletedItemIds/deletedTouchKeyIds are all empty — no
// deletion of any kind can outlive the undo history that was its only path
// back. See the keepAll implementation comment in workingCopyStore.ts.
// ---------------------------------------------------------------------------

describe("workingCopyStore — keepAll/restoreAll clear deletedTouchKeyIds", () => {
  it("deleteTouchKey then restoreAll clears deletedTouchKeyIds and undoStack", () => {
    const touchId = "phone:default:U_0064";

    useWorkingCopyStore.getState().deleteTouchKey(touchId);
    expect(useWorkingCopyStore.getState().deletedTouchKeyIds.size).toBe(1);

    useWorkingCopyStore.getState().restoreAll();

    const s = useWorkingCopyStore.getState();
    expect(s.deletedTouchKeyIds.size).toBe(0);
    expect(s.isTouchKeyDeleted(touchId)).toBe(false);
    expect(s.undoStack).toHaveLength(0);
  });

  it("deleteTouchKey then keepAll leaves no orphaned 't' undo entry and no applied touch deletion", () => {
    const touchId = "phone:default:U_0065";

    useWorkingCopyStore.getState().deleteTouchKey(touchId);
    expect(useWorkingCopyStore.getState().undoStack).toEqual([{ k: "t", id: touchId }]);

    useWorkingCopyStore.getState().keepAll();

    const s = useWorkingCopyStore.getState();
    // The undo stack is wiped by keepAll — so deletedTouchKeyIds must be wiped
    // in the same call, or this 't' entry's deletion would be permanently
    // un-undoable while still applied (the orphan this test locks).
    expect(s.undoStack).toHaveLength(0);
    expect(s.deletedTouchKeyIds.size).toBe(0);
    expect(s.isTouchKeyDeleted(touchId)).toBe(false);
  });

  it("mixed carve (node + item) and touch deletions: keepAll leaves all three deletion Sets and undoStack empty", () => {
    useWorkingCopyStore.getState().deleteNode("n1");
    useWorkingCopyStore.getState().deleteItem("n2#0");
    useWorkingCopyStore.getState().deleteTouchKey("phone:default:U_0066");

    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(3);

    useWorkingCopyStore.getState().keepAll();

    const s = useWorkingCopyStore.getState();
    expect(s.deletedNodeIds.size).toBe(0);
    expect(s.deletedItemIds.size).toBe(0);
    expect(s.deletedTouchKeyIds.size).toBe(0);
    expect(s.undoStack).toHaveLength(0);
  });

  it("mixed carve (node + item) and touch deletions: restoreAll leaves all three deletion Sets and undoStack empty", () => {
    useWorkingCopyStore.getState().deleteNode("n1");
    useWorkingCopyStore.getState().deleteItem("n2#0");
    useWorkingCopyStore.getState().deleteTouchKey("phone:default:U_0067");

    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(3);

    useWorkingCopyStore.getState().restoreAll();

    const s = useWorkingCopyStore.getState();
    expect(s.deletedNodeIds.size).toBe(0);
    expect(s.deletedItemIds.size).toBe(0);
    expect(s.deletedTouchKeyIds.size).toBe(0);
    expect(s.undoStack).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// spec 063 T056/T057 — keyEditOverlay: commitKeyEdit/undoKeyEdit, plus (T057)
// their integration with the shared chronological undoStack: commitKeyEdit
// pushes a 'k' UndoEntry, undoDelete has a 'k' branch, undoKeyEdit filters the
// matching entry out of undoStack (the restore-side filter), and keepAll
// clears keyEditOverlay alongside the other deletion state (FR-032).
// ---------------------------------------------------------------------------

describe("workingCopyStore — keyEditOverlay", () => {
  it("starts as an empty ordered log", () => {
    expect(useWorkingCopyStore.getState().keyEditOverlay).toEqual({ ops: [] });
  });

  it("commitKeyEdit appends an op, assigning seq = the current op count", () => {
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

    const ops = useWorkingCopyStore.getState().keyEditOverlay.ops;
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({ seq: 0, address: "phone:default:K_A", kind: "suppress" });
    expect(ops[1]).toMatchObject({ seq: 1, address: "phone:default:K_B", kind: "rename" });
  });

  it("undoKeyEdit removes only the most recently committed op", () => {
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

    useWorkingCopyStore.getState().undoKeyEdit();

    const ops = useWorkingCopyStore.getState().keyEditOverlay.ops;
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ address: "phone:default:K_A", kind: "suppress" });
  });

  it("undoKeyEdit on an empty overlay is a no-op", () => {
    useWorkingCopyStore.getState().undoKeyEdit();
    expect(useWorkingCopyStore.getState().keyEditOverlay).toEqual({ ops: [] });
  });

  it("reset clears keyEditOverlay back to an empty log", () => {
    useWorkingCopyStore.getState().commitKeyEdit({
      address: "phone:default:K_A",
      kind: "suppress",
      spClass: 9,
      sentinelId: "T_none",
    });
    expect(useWorkingCopyStore.getState().keyEditOverlay.ops).toHaveLength(1);

    useWorkingCopyStore.getState().reset();
    expect(useWorkingCopyStore.getState().keyEditOverlay).toEqual({ ops: [] });
  });

  it("instantiateFromBase clears keyEditOverlay on a genuine base switch", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
    useWorkingCopyStore.getState().commitKeyEdit({
      address: "phone:default:K_A",
      kind: "suppress",
      spClass: 9,
      sentinelId: "T_none",
    });
    expect(useWorkingCopyStore.getState().keyEditOverlay.ops).toHaveLength(1);

    // A different base id forces the genuine-switch path (resolveInstantiationCase).
    const otherBase = { ...basicKbdus, id: "some_other_base" };
    useWorkingCopyStore.getState().instantiateFromBase(otherBase, { vfs, ir });
    expect(useWorkingCopyStore.getState().keyEditOverlay).toEqual({ ops: [] });
  });

  it("instantiateFromExisting clears keyEditOverlay on a genuine base switch", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir });
    useWorkingCopyStore.getState().commitKeyEdit({
      address: "phone:default:K_A",
      kind: "suppress",
      spClass: 9,
      sentinelId: "T_none",
    });
    expect(useWorkingCopyStore.getState().keyEditOverlay.ops).toHaveLength(1);

    const otherKeyboard = { ...basicKbdus, id: "some_other_keyboard" };
    useWorkingCopyStore.getState().instantiateFromExisting(otherKeyboard, { vfs, ir });
    expect(useWorkingCopyStore.getState().keyEditOverlay).toEqual({ ops: [] });
  });
});

// ---------------------------------------------------------------------------
// spec 063 T057 — key edits on the shared chronological undoStack.
// ---------------------------------------------------------------------------

describe("workingCopyStore — key edit undo integration (T057, FR-032)", () => {
  it("commitKeyEdit pushes a 'k' UndoEntry with the committed op's seq", () => {
    useWorkingCopyStore.getState().commitKeyEdit({
      address: "phone:default:K_A",
      kind: "suppress",
      spClass: 9,
      sentinelId: "T_none",
    });

    const s = useWorkingCopyStore.getState();
    expect(s.undoStack).toEqual([{ k: "k", seq: 0 }]);
  });

  it("undoDelete pops a 'k' entry and removes the matching op from keyEditOverlay", () => {
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
    expect(useWorkingCopyStore.getState().keyEditOverlay.ops).toHaveLength(2);
    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(2);

    useWorkingCopyStore.getState().undoDelete();

    const s = useWorkingCopyStore.getState();
    expect(s.keyEditOverlay.ops).toHaveLength(1);
    expect(s.keyEditOverlay.ops[0]).toMatchObject({ address: "phone:default:K_A", kind: "suppress" });
    expect(s.undoStack).toHaveLength(1);
    expect(s.undoStack[0]).toEqual({ k: "k", seq: 0 });
  });

  it("undoDelete interleaves correctly: a node delete and a key edit are each other's independent undo entries", () => {
    useWorkingCopyStore.getState().deleteNode("node-1");
    useWorkingCopyStore.getState().commitKeyEdit({
      address: "phone:default:K_A",
      kind: "suppress",
      spClass: 9,
      sentinelId: "T_none",
    });

    // Last entry is the key edit — undoDelete should reverse it, not the node.
    useWorkingCopyStore.getState().undoDelete();
    let s = useWorkingCopyStore.getState();
    expect(s.keyEditOverlay.ops).toHaveLength(0);
    expect(s.isDeleted("node-1")).toBe(true);

    // Now the node delete is last — undoDelete reverses that.
    useWorkingCopyStore.getState().undoDelete();
    s = useWorkingCopyStore.getState();
    expect(s.isDeleted("node-1")).toBe(false);
  });

  it("undoKeyEdit (the restore-side filter) removes the matching 'k' entry from undoStack even when it is not the stack's tail", () => {
    useWorkingCopyStore.getState().commitKeyEdit({
      address: "phone:default:K_A",
      kind: "suppress",
      spClass: 9,
      sentinelId: "T_none",
    });
    // A node delete lands on the stack AFTER the key edit, so the 'k' entry is
    // no longer the tail.
    useWorkingCopyStore.getState().deleteNode("node-1");
    expect(useWorkingCopyStore.getState().undoStack).toEqual([
      { k: "k", seq: 0 },
      { k: "n", id: "node-1" },
    ]);

    useWorkingCopyStore.getState().undoKeyEdit();

    const s = useWorkingCopyStore.getState();
    expect(s.keyEditOverlay.ops).toHaveLength(0);
    // The matching 'k' entry is gone; the unrelated 'n' entry is untouched.
    expect(s.undoStack).toEqual([{ k: "n", id: "node-1" }]);
    expect(s.isDeleted("node-1")).toBe(true);
  });

  it("undoKeyEdit on an empty overlay does not touch undoStack", () => {
    useWorkingCopyStore.getState().deleteNode("node-1");
    useWorkingCopyStore.getState().undoKeyEdit();

    const s = useWorkingCopyStore.getState();
    expect(s.undoStack).toEqual([{ k: "n", id: "node-1" }]);
  });

  it("keepAll clears keyEditOverlay along with the deletion sets and undoStack", () => {
    useWorkingCopyStore.getState().deleteNode("node-1");
    useWorkingCopyStore.getState().commitKeyEdit({
      address: "phone:default:K_A",
      kind: "suppress",
      spClass: 9,
      sentinelId: "T_none",
    });
    expect(useWorkingCopyStore.getState().keyEditOverlay.ops).toHaveLength(1);
    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(2);

    useWorkingCopyStore.getState().keepAll();

    const s = useWorkingCopyStore.getState();
    expect(s.keyEditOverlay).toEqual({ ops: [] });
    expect(s.undoStack).toEqual([]);
    expect(s.deletedNodeIds.size).toBe(0);
    expect(s.isDeleted("node-1")).toBe(false);
  });

  it("restoreAll (alias for keepAll) also clears keyEditOverlay", () => {
    useWorkingCopyStore.getState().commitKeyEdit({
      address: "phone:default:K_A",
      kind: "suppress",
      spClass: 9,
      sentinelId: "T_none",
    });

    useWorkingCopyStore.getState().restoreAll();

    const s = useWorkingCopyStore.getState();
    expect(s.keyEditOverlay).toEqual({ ops: [] });
    expect(s.undoStack).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// spec 063 T056 — touchEditorMode: setTouchEditorMode.
// ---------------------------------------------------------------------------

describe("workingCopyStore — touchEditorMode", () => {
  it("defaults to 'character' (the character walk is the default per FR-036)", () => {
    expect(useWorkingCopyStore.getState().touchEditorMode).toBe("character");
  });

  it("setTouchEditorMode switches to 'key' and back", () => {
    useWorkingCopyStore.getState().setTouchEditorMode("key");
    expect(useWorkingCopyStore.getState().touchEditorMode).toBe("key");

    useWorkingCopyStore.getState().setTouchEditorMode("character");
    expect(useWorkingCopyStore.getState().touchEditorMode).toBe("character");
  });

  it("toggling mode does NOT clear touchDraft or keyEditOverlay (FR-036b)", () => {
    useWorkingCopyStore.getState().setTouchDraft({ charTouchEntries: [], suggestionResolvedChars: ["a"] });
    useWorkingCopyStore.getState().commitKeyEdit({
      address: "phone:default:K_A",
      kind: "suppress",
      spClass: 9,
      sentinelId: "T_none",
    });

    useWorkingCopyStore.getState().setTouchEditorMode("key");

    const s = useWorkingCopyStore.getState();
    expect(s.touchDraft).toEqual({ charTouchEntries: [], suggestionResolvedChars: ["a"] });
    expect(s.keyEditOverlay.ops).toHaveLength(1);
  });

  it("reset restores touchEditorMode to 'character'", () => {
    useWorkingCopyStore.getState().setTouchEditorMode("key");
    useWorkingCopyStore.getState().reset();
    expect(useWorkingCopyStore.getState().touchEditorMode).toBe("character");
  });
});

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
        { id: "a:K_A", hostKey: "K_A", baseChar: "a", members: ["a", "á"] },
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
// undoStack. Those writes fire AFTER the carve step, so enabling
// VITE_KM_MUTATE_SEAM=1 silently WIPED the live carve-deletion overlay that the
// OSK preview and shipped output project from baseIr + the overlay. The fix
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

// ---------------------------------------------------------------------------
// T041 — staleness slice tests (P0-3 review fix: bind a real manifest fixture,
// exercise true transitive closure, prove clearStale clears downstream)
// ---------------------------------------------------------------------------

// Fixture manifest with writes→inputs chains:
//   step_u writes PATH_GROUPS → step_d reads PATH_GROUPS (writes PATH_BCP47)
//                             → step_dd reads PATH_BCP47
// So: markStale("step_u") → stale = { step_u, step_d, step_dd } (2-edge closure).
//     clearStale("step_u") → stale = {} (downstream also cleared).
const PATH_GROUPS_FIXTURE = irPath("groups", ARRAY_INDEX);
const PATH_BCP47_FIXTURE = irPath("header", "bcp47");

function makeEditorStep(id: string, writes: typeof PATH_GROUPS_FIXTURE[], inputs: typeof PATH_GROUPS_FIXTURE[]): EditorStep {
  return {
    kind: "editor-step",
    id,
    title: id,
    spine: true,
    component: (() => null) as EditorStep["component"],
    inputs,
    writes,
  };
}

const FIXTURE_MANIFEST: readonly Step[] = [
  makeEditorStep("step_u", [PATH_GROUPS_FIXTURE], []),          // upstream: writes groups
  makeEditorStep("step_d", [PATH_BCP47_FIXTURE], [PATH_GROUPS_FIXTURE]), // mid: reads groups, writes bcp47
  makeEditorStep("step_dd", [], [PATH_BCP47_FIXTURE]),           // downstream: reads bcp47
];

describe("workingCopyStore — staleness slice (T041)", () => {
  // Bind a real fixture manifest before each test so markStale exercises true
  // transitive closure (not a vacuous echo of the seed set).
  beforeEach(() => {
    bindManifest(FIXTURE_MANIFEST);
  });

  it("default: staleSteps is empty (fresh session)", () => {
    expect(useWorkingCopyStore.getState().staleSteps.size).toBe(0);
  });

  it("markStale: adds the reopened step to staleSteps", () => {
    useWorkingCopyStore.getState().markStale("step_u");
    expect(useWorkingCopyStore.getState().staleSteps.has("step_u")).toBe(true);
  });

  it("markStale: 2-edge transitive closure — step_dd goes stale when step_u is reopened", () => {
    // This test exercises the REAL fixpoint, not the seed echo.
    // With FIXTURE_MANIFEST: step_u → step_d → step_dd.
    // Reopening step_u must propagate all the way to step_dd (2 hops).
    useWorkingCopyStore.getState().markStale("step_u");
    const stale = useWorkingCopyStore.getState().staleSteps;
    expect(stale.has("step_u")).toBe(true);   // root
    expect(stale.has("step_d")).toBe(true);   // 1 hop
    expect(stale.has("step_dd")).toBe(true);  // 2 hops — fixpoint required
  });

  it("clearStale: clears root AND downstream — ghost-stale fix (P0-2)", () => {
    // Reopen step_u → step_d and step_dd go stale.
    useWorkingCopyStore.getState().markStale("step_u");
    expect(useWorkingCopyStore.getState().staleSteps.has("step_dd")).toBe(true);

    // Clear step_u → closure recomputed from empty roots → step_d and step_dd
    // are no longer stale (they were only stale because of step_u).
    useWorkingCopyStore.getState().clearStale("step_u");
    const stale = useWorkingCopyStore.getState().staleSteps;
    expect(stale.has("step_u")).toBe(false);   // cleared root
    expect(stale.has("step_d")).toBe(false);   // downstream cleared too
    expect(stale.has("step_dd")).toBe(false);  // 2-hop downstream cleared too
  });

  it("clearStale: removing one root leaves the other root's closure intact", () => {
    useWorkingCopyStore.getState().markStale("step_u");
    useWorkingCopyStore.getState().markStale("step_d");
    // Both step_u and step_d are roots; step_dd is downstream of both.
    expect(useWorkingCopyStore.getState().staleSteps.has("step_dd")).toBe(true);

    // Clear step_u — but step_d is still a root, so step_dd stays stale.
    useWorkingCopyStore.getState().clearStale("step_u");
    const stale = useWorkingCopyStore.getState().staleSteps;
    expect(stale.has("step_u")).toBe(false);  // root removed
    expect(stale.has("step_d")).toBe(true);   // still a root
    expect(stale.has("step_dd")).toBe(true);  // still downstream of step_d
  });

  it("clearStale: staleSteps is empty after clearing the only stale root", () => {
    useWorkingCopyStore.getState().markStale("step_u");
    useWorkingCopyStore.getState().clearStale("step_u");
    expect(useWorkingCopyStore.getState().staleSteps.size).toBe(0);
  });

  it("reset: clears staleSteps back to empty", () => {
    useWorkingCopyStore.getState().markStale("step_u");
    expect(useWorkingCopyStore.getState().staleSteps.size).toBeGreaterThan(0);

    useWorkingCopyStore.getState().reset();
    expect(useWorkingCopyStore.getState().staleSteps.size).toBe(0);
  });

  it("multiple markStale calls accumulate (staleSteps grows)", () => {
    useWorkingCopyStore.getState().markStale("step_u");
    useWorkingCopyStore.getState().markStale("step_d");
    const stale = useWorkingCopyStore.getState().staleSteps;
    expect(stale.has("step_u")).toBe(true);
    expect(stale.has("step_d")).toBe(true);
  });

  it("clearStale of a non-stale step is a no-op (no error)", () => {
    expect(useWorkingCopyStore.getState().staleSteps.size).toBe(0);
    // Clearing a non-stale step must not throw.
    expect(() => useWorkingCopyStore.getState().clearStale("step_u")).not.toThrow();
    expect(useWorkingCopyStore.getState().staleSteps.size).toBe(0);
  });

  it("bind guard: markStale throws if manifest is empty (not yet bound)", () => {
    // Temporarily bind an empty manifest to trip the guard.
    bindManifest([]);
    expect(() => useWorkingCopyStore.getState().markStale("step_u")).toThrow(
      "[workingCopyStore] bindManifest() must be called before markStale",
    );
    // Restore fixture for subsequent tests (beforeEach will also restore).
    bindManifest(FIXTURE_MANIFEST);
  });

  it("bind guard: clearStale throws if manifest is empty (not yet bound)", () => {
    bindManifest([]);
    expect(() => useWorkingCopyStore.getState().clearStale("step_u")).toThrow(
      "[workingCopyStore] bindManifest() must be called before clearStale",
    );
    bindManifest(FIXTURE_MANIFEST);
  });
});

describe("workingCopyStore — cascadeDelete", () => {
  beforeEach(() => useWorkingCopyStore.getState().reset());

  it("routes both whole-rule ids and store-slot ids through the item channel so chips reflect deletion", () => {
    const s = useWorkingCopyStore.getState();
    s.cascadeDelete(["r-eps"], ["sid-dkt#2"]);
    const after = useWorkingCopyStore.getState();
    // Both are visible via isItemDeleted (what the chip grid + kept-counts read).
    expect(after.isItemDeleted("r-eps")).toBe(true);
    expect(after.isItemDeleted("sid-dkt#2")).toBe(true);
    // Nothing leaks into the node channel (chips don't read it).
    expect(after.deletedNodeIds.size).toBe(0);
  });

  it("reverses the entire cascade with a single undoDelete()", () => {
    const s = useWorkingCopyStore.getState();
    s.cascadeDelete(["r-eps"], ["sid-dkt#2"]);
    useWorkingCopyStore.getState().undoDelete();
    const after = useWorkingCopyStore.getState();
    expect(after.isItemDeleted("r-eps")).toBe(false);
    expect(after.isItemDeleted("sid-dkt#2")).toBe(false);
    expect(after.deletedItemIds.size).toBe(0);
  });

  it("is a no-op when both arrays are empty (no undo entry pushed)", () => {
    const s = useWorkingCopyStore.getState();
    s.cascadeDelete([], []);
    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(0);
  });
});

describe("workingCopyStore — cascadeRestore", () => {
  beforeEach(() => useWorkingCopyStore.getState().reset());

  it("un-deletes every id it is given (clicking a removed chip restores everywhere)", () => {
    useWorkingCopyStore.getState().cascadeDelete(["r-eps"], ["sid-dkt#2"]);
    expect(useWorkingCopyStore.getState().isItemDeleted("r-eps")).toBe(true);
    useWorkingCopyStore.getState().cascadeRestore(["r-eps", "sid-dkt#2"]);
    const after = useWorkingCopyStore.getState();
    expect(after.isItemDeleted("r-eps")).toBe(false);
    expect(after.isItemDeleted("sid-dkt#2")).toBe(false);
    expect(after.deletedItemIds.size).toBe(0);
  });

  it("is a no-op for an empty list", () => {
    const before = useWorkingCopyStore.getState().deletedItemIds.size;
    useWorkingCopyStore.getState().cascadeRestore([]);
    expect(useWorkingCopyStore.getState().deletedItemIds.size).toBe(before);
  });

  it("clears the batch undo entry once every one of its items is restored", () => {
    useWorkingCopyStore.getState().cascadeDelete(["r-eps"], ["sid-dkt#2"]);
    expect(useWorkingCopyStore.getState().undoStack).toEqual([
      { k: "batch", nodeIds: [], itemIds: ["r-eps", "sid-dkt#2"] },
    ]);

    useWorkingCopyStore.getState().cascadeRestore(["r-eps", "sid-dkt#2"]);
    const after = useWorkingCopyStore.getState();
    expect(after.undoStack).toHaveLength(0);
    expect(after.isItemDeleted("r-eps")).toBe(false);
    expect(after.isItemDeleted("sid-dkt#2")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Base-derived A3a (mark-input order) seeding at instantiation (spec §7.2 3a, #926)
// ---------------------------------------------------------------------------

/** A base IR carrying the unconditional postfix sequence-replace shape:
 *  `any(equalD) + "=" > index(equalU,1)` — the guard-free §7.5 IPA shape. */
function postfixBaseIr(): KeyboardIR {
  const group: IRGroup = {
    nodeId: "group#main",
    name: "main",
    usingKeys: true,
    readonly: false,
    rules: [
      {
        nodeId: "rule#acute",
        context: [
          { kind: "any", storeRef: "equalD" },
          { kind: "char", value: "=" },
        ],
        output: [{ kind: "index", storeRef: "equalU", offset: 1 }],
      },
    ],
  };
  const stores: IRStore[] = [
    makeCharStore("store#equalD", "equalD", "aeiou"),
    makeCharStore("store#equalU", "equalU", "áéíóú"),
  ];
  return makeTestIR([group], stores);
}

describe("workingCopyStore — base-derived A3a seeding (spec §7.2 rule 3a, #926)", () => {
  it("instantiateFromExisting seeds markInputOrder='postfix' onto irAxes/session.axes from a postfix base", () => {
    const vfs = createVirtualFS([]);
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir: postfixBaseIr() });
    const s = useWorkingCopyStore.getState();
    expect(s.irAxes.markInputOrder).toBe("postfix");
    expect(s.session.axes.markInputOrder).toBe("postfix");
  });

  it("instantiateFromBase also seeds it (base-derived, symmetric across tracks)", () => {
    const vfs = createVirtualFS([]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir: postfixBaseIr() });
    expect(useWorkingCopyStore.getState().session.axes.markInputOrder).toBe("postfix");
  });

  it("does NOT seed markInputOrder from a base with no postfix structure", () => {
    const vfs = createVirtualFS([]);
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir: makeTestIR([]) });
    expect(useWorkingCopyStore.getState().session.axes.markInputOrder).toBeUndefined();
  });

  it("the seeded value survives defaultFillAxes and fires rule 3a -> S-03 (+S-04) in selectStrategy", () => {
    // The production path: instantiation seeds irAxes.markInputOrder, which
    // MechanismGallery folds into the vector it feeds through defaultFillAxes
    // -> selectStrategy. This asserts that end-to-end from session.axes.
    const vfs = createVirtualFS([]);
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir: postfixBaseIr() });
    const seeded = useWorkingCopyStore.getState().session.axes as Partial<DiscoveryAxisVector>;
    // Simulate the rest of an elicited alphabetic/strong vector (scale+scriptClass
    // are required inputs to the prior) with the import-seeded postfix present.
    const { axes } = defaultFillAxes({
      ...seeded,
      scale: "medium",
      scriptClass: "alphabetic",
      phoneticIntuition: "strong",
    });
    expect(axes.markInputOrder).toBe("postfix");
    const result = selectStrategy(axes);
    expect(result.triggeredRule).toBe("3a");
    expect(result.primary).toBe("S-03");
    expect(result.secondaries).toContain("S-04");
  });

  it("never overwrites an already-present markInputOrder (guard: base seeding defers to a prior value)", () => {
    // irAxes recorded before the (late) first instantiate — e.g. a future
    // survey-elicited A3a — must win over base-derived seeding. Case-2
    // carry-forward preserves irAxes into instantiation, so seedIrAxesFromBaseIr
    // sees markInputOrder already set and leaves it alone, even though the
    // postfix base would otherwise seed "postfix".
    useWorkingCopyStore.getState().setIrAxes({ markInputOrder: "prefix" });
    const vfs = createVirtualFS([]);
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir: postfixBaseIr() });
    expect(useWorkingCopyStore.getState().session.axes.markInputOrder).toBe("prefix");
  });
});

// ---------------------------------------------------------------------------
// sequenceFlaggedChars — S-03 flag tracking (Sequence Gallery deferral)
// ---------------------------------------------------------------------------

describe("workingCopyStore — sequenceFlaggedChars", () => {
  it("starts empty", () => {
    expect(useWorkingCopyStore.getState().sequenceFlaggedChars).toEqual([]);
  });

  it("flagCharForSequence adds a char, preserving insertion order", () => {
    useWorkingCopyStore.getState().flagCharForSequence("á");
    useWorkingCopyStore.getState().flagCharForSequence("é");
    expect(useWorkingCopyStore.getState().sequenceFlaggedChars).toEqual(["á", "é"]);
  });

  it("flagCharForSequence is idempotent — flagging the same char twice does not duplicate it", () => {
    useWorkingCopyStore.getState().flagCharForSequence("á");
    useWorkingCopyStore.getState().flagCharForSequence("á");
    expect(useWorkingCopyStore.getState().sequenceFlaggedChars).toEqual(["á"]);
  });

  it("unflagCharForSequence removes a char", () => {
    useWorkingCopyStore.getState().flagCharForSequence("á");
    useWorkingCopyStore.getState().flagCharForSequence("é");
    useWorkingCopyStore.getState().unflagCharForSequence("á");
    expect(useWorkingCopyStore.getState().sequenceFlaggedChars).toEqual(["é"]);
  });

  it("unflagCharForSequence on a char not in the list is a no-op", () => {
    useWorkingCopyStore.getState().flagCharForSequence("á");
    useWorkingCopyStore.getState().unflagCharForSequence("z");
    expect(useWorkingCopyStore.getState().sequenceFlaggedChars).toEqual(["á"]);
  });

  it("unflagCharForSequence also strips the char's recorded multi_char_sequence assignment (P0)", () => {
    useWorkingCopyStore.getState().flagCharForSequence("ŋ");
    useWorkingCopyStore.getState().recordAssignments([
      {
        scope: "individual",
        target: "ŋ",
        modality: "physical",
        mechanisms: [
          {
            patternId: "multi_char_sequence",
            strategyId: "S-03",
            slotValues: { firstLetterOut: "n", secondLetter: "g", collapsedChar: "ŋ" },
          },
        ],
        source: "user",
      },
    ]);
    expect(
      useWorkingCopyStore.getState().phaseResults.find((p) => p.phase === "C")?.assignments,
    ).toHaveLength(1);

    useWorkingCopyStore.getState().unflagCharForSequence("ŋ");

    expect(useWorkingCopyStore.getState().sequenceFlaggedChars).toEqual([]);
    expect(
      useWorkingCopyStore.getState().phaseResults.find((p) => p.phase === "C")?.assignments,
    ).toEqual([]);
  });

  it("unflagCharForSequence strips ALL recorded sequences when the assignment holds multiple PATTERN_SEQUENCE mechanisms", () => {
    useWorkingCopyStore.getState().flagCharForSequence("ŋ");
    useWorkingCopyStore.getState().recordAssignments([
      {
        scope: "individual",
        target: "ŋ",
        modality: "physical",
        mechanisms: [
          {
            patternId: "multi_char_sequence",
            strategyId: "S-03",
            slotValues: { firstLetterOut: "n", secondLetter: "g", collapsedChar: "ŋ" },
          },
          {
            patternId: "multi_char_sequence",
            strategyId: "S-03",
            slotValues: { firstLetterOut: "n", secondLetter: "y", collapsedChar: "ŋ" },
          },
        ],
        source: "user",
      },
    ]);
    expect(
      useWorkingCopyStore.getState().phaseResults.find((p) => p.phase === "C")?.assignments?.[0]
        ?.mechanisms,
    ).toHaveLength(2);

    useWorkingCopyStore.getState().unflagCharForSequence("ŋ");

    expect(useWorkingCopyStore.getState().sequenceFlaggedChars).toEqual([]);
    expect(
      useWorkingCopyStore.getState().phaseResults.find((p) => p.phase === "C")?.assignments,
    ).toEqual([]);
  });

  it("unflagCharForSequence leaves OTHER characters' assignments (including that char's own non-sequence mechanisms) untouched", () => {
    useWorkingCopyStore.getState().flagCharForSequence("ŋ");
    useWorkingCopyStore.getState().recordAssignments([
      {
        scope: "individual",
        target: "ŋ",
        modality: "physical",
        mechanisms: [{ patternId: "multi_char_sequence", strategyId: "S-03" }],
        source: "user",
      },
      {
        scope: "individual",
        target: "ñ",
        modality: "physical",
        mechanisms: [{ patternId: "simple_swap", strategyId: "S-01" }],
        source: "user",
      },
    ]);

    useWorkingCopyStore.getState().unflagCharForSequence("ŋ");

    const remaining = useWorkingCopyStore
      .getState()
      .phaseResults.find((p) => p.phase === "C")?.assignments;
    expect(remaining).toHaveLength(1);
    expect(remaining?.[0]?.target).toBe("ñ");
  });

  it("instantiateFromBase clears sequenceFlaggedChars on a genuine base switch", () => {
    const vfs = createVirtualFS([]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir: makeTestIR([]) });
    useWorkingCopyStore.getState().flagCharForSequence("á");
    expect(useWorkingCopyStore.getState().sequenceFlaggedChars).toEqual(["á"]);

    const otherKeyboard = { ...basicKbdus, id: "other_keyboard_id" };
    useWorkingCopyStore.getState().instantiateFromBase(otherKeyboard, { vfs, ir: makeTestIR([]) });
    expect(useWorkingCopyStore.getState().sequenceFlaggedChars).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Per-working-copy Phase B proposal decisions (spec 044 FR-016a)
//
// `rejected` and `exemplarMethodDeclined` deliberately survive
// phaseBDraftStore's own reset() — that runs on every entry to the build-list
// screen, and clearing them there would re-propose characters the author just
// removed. They are per-WORKING-COPY, so the two instantiate entry points
// clear them instead. Without that wiring the decisions were effectively
// per-browser-session: declining on keyboard A silently pre-declined keyboard
// B, and a character rejected in A was suppressed from B's proposal.
// ---------------------------------------------------------------------------

describe("workingCopyStore — Phase B proposal decisions are per-working-copy", () => {
  const BM_INVENTORY: SourcedInventory = {
    resolvedTag: "bm",
    source: "cldr",
    confidence: "approved",
    characters: [{ char: "ɔ", tier: "main", source: "cldr", confidence: "approved" }],
    digraphs: [],
  };

  afterEach(() => {
    usePhaseBDraftStore.getState().reset();
    resetPhaseBDraftDecisions();
  });

  /** Seed a proposal, reject one of its characters, and decline the offer. */
  function declineAndReject(): void {
    usePhaseBDraftStore.getState().seedFromProposal(BM_INVENTORY, "bm");
    usePhaseBDraftStore.getState().remove("ɔ");
    usePhaseBDraftStore.getState().declineExemplarMethod();
    expect(usePhaseBDraftStore.getState().rejected).toContain("ɔ");
    expect(usePhaseBDraftStore.getState().exemplarMethodDeclined).toBe(true);
  }

  it("instantiateFromBase clears them for a new working copy", () => {
    const vfs = createVirtualFS();
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir: makeTestIR([]) });
    declineAndReject();

    // Keyboard B, started in the same browser session.
    const keyboardB = { ...basicKbdus, id: "keyboard_b" };
    useWorkingCopyStore.getState().instantiateFromBase(keyboardB, { vfs, ir: makeTestIR([]) });

    expect(usePhaseBDraftStore.getState().rejected).toEqual([]);
    expect(usePhaseBDraftStore.getState().exemplarMethodDeclined).toBe(false);
  });

  it("instantiateFromExisting clears them for a new working copy", () => {
    const vfs = createVirtualFS();
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir: makeTestIR([]) });
    declineAndReject();

    const keyboardB = { ...basicKbdus, id: "keyboard_b" };
    useWorkingCopyStore.getState().instantiateFromExisting(keyboardB, { vfs, ir: makeTestIR([]) });

    expect(usePhaseBDraftStore.getState().rejected).toEqual([]);
    expect(usePhaseBDraftStore.getState().exemplarMethodDeclined).toBe(false);
  });

  it("a character rejected on keyboard A is proposed normally on keyboard B", () => {
    const vfs = createVirtualFS();
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir: makeTestIR([]) });
    declineAndReject();

    const keyboardB = { ...basicKbdus, id: "keyboard_b" };
    useWorkingCopyStore.getState().instantiateFromBase(keyboardB, { vfs, ir: makeTestIR([]) });
    // Entering B's build-list screen: the per-visit reset, then a fresh seed.
    usePhaseBDraftStore.getState().reset();
    usePhaseBDraftStore.getState().seedFromProposal(BM_INVENTORY, "bm");

    expect(usePhaseBDraftStore.getState().chars).toContain("ɔ");
    expect(usePhaseBDraftStore.getState().provenance["ɔ"]).toBe("cldr");
  });

  it("a redundant re-fire of the SAME instantiate does not discard a live decision", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
    declineAndReject();

    // Case 1 of resolveInstantiationCase: same id AND same mode -> full no-op.
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });

    expect(usePhaseBDraftStore.getState().rejected).toContain("ɔ");
    expect(usePhaseBDraftStore.getState().exemplarMethodDeclined).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// commitTouchKeyRename — the T091 complete reference fix-up (spec 063;
// key-id-policy.md §4; touch-key-rule-join.md §6.1's final bullet). Reuses
// the shared touch-key<->rule-join fixture (contract §8, "no second
// fixture") rather than a bespoke one, mirroring AssignPanel.test.tsx's own
// precedent for the same fixture in this package.
// ---------------------------------------------------------------------------

describe("workingCopyStore — commitTouchKeyRename (spec 063 T091)", () => {
  it("returns changed:false and touches nothing when there is no working IR yet", () => {
    const result = useWorkingCopyStore
      .getState()
      .commitTouchKeyRename(TOUCH_JOIN_IDS.mark, "T_0300RENAMED");

    expect(result).toEqual({ changed: false, renamedRuleNodeIds: [], renamedAddresses: [] });
  });

  it("writes the renamed ir via the overlay-preserving setWorkingIR seam, preserving the carve-deletion overlay", () => {
    useWorkingCopyStore.getState().setIR(makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true }));
    useWorkingCopyStore.getState().deleteNode("unrelated-carve-node");
    expect(useWorkingCopyStore.getState().deletedNodeIds.has("unrelated-carve-node")).toBe(true);

    const result = useWorkingCopyStore
      .getState()
      .commitTouchKeyRename(TOUCH_JOIN_IDS.mark, "T_0300RENAMED");

    expect(result.changed).toBe(true);
    expect([...result.renamedRuleNodeIds].sort()).toEqual(["rule#mark", "rule#mark-guard"].sort());

    const after = useWorkingCopyStore.getState();
    // A carve-side deletion made through a DIFFERENT overlay survives —
    // setWorkingIR, not setIR, is the seam this action must use.
    expect(after.deletedNodeIds.has("unrelated-carve-node")).toBe(true);

    const phoneKey = after.ir!.touchLayout!.platforms.find((p) => p.id === "phone")!.layers[0]!.rows[0]!.keys[0]!;
    const tabletKey = after.ir!.touchLayout!.platforms.find((p) => p.id === "tablet")!.layers[0]!.rows[0]!.keys[0]!;
    expect(phoneKey.id).toBe("T_0300RENAMED");
    expect(tabletKey.id).toBe("T_0300RENAMED");
  });

  it("remaps a deleted-touch-key address through the EXISTING restore/delete actions, keeping undo entries consistent (FR-028, FR-033)", () => {
    useWorkingCopyStore.getState().setIR(makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true }));
    const oldAddress = "phone:default:T_0300";
    const newAddress = "phone:default:T_0300RENAMED";
    useWorkingCopyStore.getState().deleteTouchKey(oldAddress);
    expect(useWorkingCopyStore.getState().deletedTouchKeyIds.has(oldAddress)).toBe(true);
    expect(
      useWorkingCopyStore.getState().undoStack.some((e) => e.k === "t" && e.id === oldAddress),
    ).toBe(true);

    const result = useWorkingCopyStore
      .getState()
      .commitTouchKeyRename(TOUCH_JOIN_IDS.mark, "T_0300RENAMED");

    expect(result.renamedAddresses).toEqual(
      expect.arrayContaining([{ oldAddress, newAddress }]),
    );

    const after = useWorkingCopyStore.getState();
    // The stale (pre-rename) address no longer resolves to a deletion...
    expect(after.deletedTouchKeyIds.has(oldAddress)).toBe(false);
    // ...it moved to the renamed key's new address instead of silently
    // vanishing (touchKeyAddress.ts: a stale address here would be data
    // loss, not the carve cascade's desirable idempotence).
    expect(after.deletedTouchKeyIds.has(newAddress)).toBe(true);
    // The tablet platform's occurrence of T_0300 was never deleted, so it is
    // not spuriously added to the overlay by the remap.
    expect(after.deletedTouchKeyIds.size).toBe(1);
    // Undo stack: no stale 't' entry for the old address, exactly one for the new.
    expect(after.undoStack.some((e) => e.k === "t" && e.id === oldAddress)).toBe(false);
    expect(after.undoStack.filter((e) => e.k === "t" && e.id === newAddress)).toHaveLength(1);
  });

  it("leaves a deletion overlay untouched when nothing in it matches the renamed key", () => {
    useWorkingCopyStore.getState().setIR(makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true }));
    useWorkingCopyStore.getState().deleteTouchKey("phone:default:T_FCFA");

    useWorkingCopyStore.getState().commitTouchKeyRename(TOUCH_JOIN_IDS.mark, "T_0300RENAMED");

    const after = useWorkingCopyStore.getState();
    expect(after.deletedTouchKeyIds.has("phone:default:T_FCFA")).toBe(true);
    expect(after.deletedTouchKeyIds.size).toBe(1);
  });

  it("promotes every renamed occurrence to hand-set provenance at its NEW address (T059, address-matched — never id-matched)", () => {
    useWorkingCopyStore.getState().setIR(makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true }));

    const result = useWorkingCopyStore
      .getState()
      .commitTouchKeyRename(TOUCH_JOIN_IDS.mark, "T_0300RENAMED");
    expect(result.changed).toBe(true);

    const after = useWorkingCopyStore.getState();
    const phoneKey = after.ir!.touchLayout!.platforms.find((p) => p.id === "phone")!.layers[0]!.rows[0]!.keys[0]!;
    const tabletKey = after.ir!.touchLayout!.platforms.find((p) => p.id === "tablet")!.layers[0]!.rows[0]!.keys[0]!;
    expect(phoneKey.id).toBe("T_0300RENAMED");
    expect(phoneKey.provenance).toBe("hand-set");
    expect(tabletKey.id).toBe("T_0300RENAMED");
    expect(tabletKey.provenance).toBe("hand-set");
  });

  it("is a no-op end to end (no ir write, no overlay remap) when fromKeyId matches nothing", () => {
    useWorkingCopyStore.getState().setIR(makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true }));
    useWorkingCopyStore.getState().deleteTouchKey("phone:default:T_0300");
    const before = useWorkingCopyStore.getState();

    const result = useWorkingCopyStore
      .getState()
      .commitTouchKeyRename("T_DOES_NOT_EXIST", "T_WHATEVER");

    expect(result).toEqual({ changed: false, renamedRuleNodeIds: [], renamedAddresses: [] });
    const after = useWorkingCopyStore.getState();
    expect(after.ir).toBe(before.ir);
    expect(after.deletedTouchKeyIds).toEqual(before.deletedTouchKeyIds);
    expect(after.undoStack).toEqual(before.undoStack);
  });
});
