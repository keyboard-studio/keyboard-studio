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
//
// Tests in irStore.test.ts and surveyResultsStore.test.ts own exhaustive
// coverage of the carve and survey action semantics respectively; this file
// focuses on the Phase-2 / instantiation surface.

import { describe, it, expect, beforeEach } from "vitest";
import { useWorkingCopyStore, bindManifest } from "./workingCopyStore.ts";
import { makeTestIR, makeCharStore } from "@keyboard-studio/contracts/fixtures";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
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
    useWorkingCopyStore.getState().setIdentity({ targetScript: "Latn" });
    const s = useWorkingCopyStore.getState();
    // bcp47 and displayName are absent, not set to undefined
    expect("bcp47" in (s.identity ?? {})).toBe(false);
    expect(s.identity?.targetScript).toBe("Latn");
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
