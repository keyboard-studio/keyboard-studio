// Tests for workingCopyStore — the single canonical source of truth.
//
// Coverage:
//   1. Initial state: all slots null/empty.
//   2. instantiateFromStart (Track 1): sets base slots + seeds IR, resets identity +
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


import { describe, it, expect } from "vitest";
import { useWorkingCopyStore } from "./workingCopyStore.ts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { deriveFacets } from "@keyboard-studio/engine";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe("workingCopyStore — initial state", () => {
  it("instantiationMode starts null", () => {
    expect(useWorkingCopyStore.getState().instantiationMode).toBeNull();
  });

  it("base slots start null", () => {
    const s = useWorkingCopyStore.getState();
    expect(s.startKeyboard).toBeNull();
    expect(s.startVfs).toBeNull();
    expect(s.startIr).toBeNull();
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
// instantiateFromStart — Track 1
// ---------------------------------------------------------------------------

describe("workingCopyStore — instantiateFromBase (Track 1)", () => {
  it("sets instantiationMode to new-from-base", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir });
    expect(useWorkingCopyStore.getState().instantiationMode).toBe("new-from-base");
  });

  it("sets baseKeyboard, baseVfs, baseIr, and seeds carve IR", () => {
    const vfs = createVirtualFS([
      { path: "source/test.kmn", content: "c hello\n", isBinary: false },
    ]);
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir });

    const s = useWorkingCopyStore.getState();
    expect(s.startKeyboard).toBe(basicKbdus);
    expect(s.startVfs).toBe(vfs);
    // startIr/ir are `ir` with base-keyboard facets baked in (spec 048
    // FR-001), so they are equal but not the same reference.
    expect(s.startIr).toEqual(deriveFacets(ir));
    // carve IR seeded from base IR
    expect(s.ir).toEqual(deriveFacets(ir));
  });

  it("resets identity to null (new keyboard starts without an overlay)", () => {
    // Set an identity first, then instantiate from a base.
    useWorkingCopyStore.getState().setIdentity({ bcp47: "ha-Latn", displayName: "Hausa" });
    expect(useWorkingCopyStore.getState().identity).not.toBeNull();

    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir });

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
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs: newVfs, ir: newIr });

    const s = useWorkingCopyStore.getState();
    expect(s.deletedNodeIds.size).toBe(0);
    expect(s.undoStack).toHaveLength(0);
    expect(s.ir).toEqual(deriveFacets(newIr));
  });

  // Was: "clears prior phaseResults so a fresh session starts clean" — that
  // title encoded the race-condition bug (asserting a first, late instantiate
  // must wipe pre-recorded phaseResults). Split into two precise assertions:
  // a truly fresh session (no pre-recorded phaseResults) stays empty here, and
  // the late-instantiate-preserves-progress case is covered in the
  // "instantiateFromStart idempotence" describe block below (see "preserves
  // phaseResults recorded BEFORE the first (late) instantiate call").
  it("a truly fresh session (no prior phaseResults) stays empty after instantiateFromBase", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir });

    expect(useWorkingCopyStore.getState().phaseResults).toHaveLength(0);
    expect(useWorkingCopyStore.getState().session.axes).toEqual({});
  });

  it("clears desktopLocked on re-instantiation", () => {
    useWorkingCopyStore.getState().lockDesktop();
    expect(useWorkingCopyStore.getState().desktopLocked).toBe(true);

    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir });

    expect(useWorkingCopyStore.getState().desktopLocked).toBe(false);
  });

  it("isInstantiated returns true after instantiateFromBase", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir });
    expect(useWorkingCopyStore.getState().isInstantiated()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// instantiateFromStart — idempotence (same base id)
// ---------------------------------------------------------------------------

describe("workingCopyStore — instantiateFromBase idempotence", () => {
  it("is a no-op when called a second time with the SAME base keyboard id", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    // First call — instantiates normally.
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir });

    // Record some phase progress.
    const phaseA: SurveyPhaseResult = {
      phase: "A",
      answers: [],
      computedAxes: { scriptClass: "alphabetic" },
    };
    useWorkingCopyStore.getState().recordPhase(phaseA);
    expect(useWorkingCopyStore.getState().phaseResults).toHaveLength(1);

    // Second call with the SAME base id — must NOT clear phaseResults.
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir });
    expect(useWorkingCopyStore.getState().phaseResults).toHaveLength(1);
    expect(useWorkingCopyStore.getState().phaseResults[0]?.phase).toBe("A");
  });

  it("re-instantiates (clears phaseResults) when called with a DIFFERENT base keyboard id", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir });

    // Record phase progress.
    const phaseA: SurveyPhaseResult = {
      phase: "A",
      answers: [],
      computedAxes: { scriptClass: "alphabetic" },
    };
    useWorkingCopyStore.getState().recordPhase(phaseA);
    expect(useWorkingCopyStore.getState().phaseResults).toHaveLength(1);

    // A different base keyboard has a different id.
    const differentStart = { ...basicKbdus, id: "different_keyboard_id" };
    useWorkingCopyStore.getState().instantiateFromStart(differentStart, { vfs, ir });

    // phaseResults must have been cleared.
    expect(useWorkingCopyStore.getState().phaseResults).toHaveLength(0);
    expect(useWorkingCopyStore.getState().startKeyboard?.id).toBe("different_keyboard_id");
  });

  // Regression: the async compile pipeline (WASM kmcmplib oracle) that produces
  // vfs/ir/removalCapabilities is decoupled from the survey flow and can settle
  // LATE — after Phase A/B has already recorded phaseResults against the
  // pending base selection. On that FIRST instantiate call, startKeyboard is
  // still null, so a guard keyed only on "startKeyboard.id already matches"
  // never triggers. This reproduces that exact ordering: record phaseResults
  // BEFORE the one-and-only instantiateFromStart call lands.
  it("preserves phaseResults recorded BEFORE the first (late) instantiate call for the same base", () => {
    const phaseA: SurveyPhaseResult = {
      phase: "A",
      answers: [],
      computedAxes: { scriptClass: "alphabetic" },
    };
    // Survey records progress while startKeyboard is still null (compile has
    // not settled yet) — mirrors Phase A/B completing before onInstantiate fires.
    useWorkingCopyStore.getState().recordPhase(phaseA);
    expect(useWorkingCopyStore.getState().phaseResults).toHaveLength(1);
    expect(useWorkingCopyStore.getState().startKeyboard).toBeNull();

    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    // The late-settling compile now fires the FIRST instantiate for this base.
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir });

    // phaseResults recorded before instantiation must survive.
    expect(useWorkingCopyStore.getState().phaseResults).toHaveLength(1);
    expect(useWorkingCopyStore.getState().phaseResults[0]?.phase).toBe("A");
    expect(useWorkingCopyStore.getState().startKeyboard?.id).toBe(basicKbdus.id);
  });

  // Regression (km-triage pre-merge item): the case-1 no-op guard
  // must key on id AND mode, not id alone. A SAME-id call arriving while the
  // store is in a DIFFERENT mode (e.g. the working copy was instantiated via
  // Track 2 for this keyboard, and Track 1's instantiateFromStart then fires
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

    // Same keyboard id, but instantiateFromStart (Track 1) fires — a track
    // switch, not a redundant re-fire. Must NOT no-op.
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir });

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
    expect(s.startKeyboard).toBe(basicKbdus);
    expect(s.startVfs).toBe(vfs);
    // startIr/ir are `ir` with base-keyboard facets baked in (spec 048
    // FR-001), so they are equal but not the same reference.
    expect(s.startIr).toEqual(deriveFacets(ir));
    expect(s.ir).toEqual(deriveFacets(ir));
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
  // point recordPhase ran here, startKeyboard was still null (compile not yet
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
    expect(useWorkingCopyStore.getState().startKeyboard).toBeNull();

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

    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir });
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
    expect(useWorkingCopyStore.getState().startKeyboard?.id).toBe("different_keyboard_id");
  });

  // Regression (km-triage pre-merge item) — Track 2 mirror of the
  // instantiateFromStart track-switch test above. A SAME-id call arriving while
  // the store is in a DIFFERENT mode (working copy instantiated via Track 1
  // for this keyboard, then instantiateFromExisting fires for the same id) is
  // a genuine track switch and must re-instantiate (mode flips, identity now
  // PRESERVED per Track 2 semantics) rather than no-op.
  it("re-instantiates (mode flips to adapt-existing) on a SAME-id call while in a DIFFERENT mode", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    // Instantiate via Track 1 first — mode is "new-from-base", identity null.
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir });
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
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir });
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
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir });
    useWorkingCopyStore.getState().setIdentity({ bcp47: "ha-Latn" });

    useWorkingCopyStore.getState().reset();
    const s = useWorkingCopyStore.getState();
    expect(s.startKeyboard).toBeNull();
    expect(s.startVfs).toBeNull();
    expect(s.startIr).toBeNull();
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
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir });
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
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir });
    useWorkingCopyStore.getState().lockDesktop();
    useWorkingCopyStore.getState().reset();
    expect(useWorkingCopyStore.getState().desktopLocked).toBe(false);
    expect(useWorkingCopyStore.getState().startKeyboard).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// spec 090 T063: the per-step answer sidecar (spec 079 D-4) is deleted and
// recordPhase no longer carries answers — settled answers live only in the
// decision store (088). The phase slot keeps the results' non-answer fields,
// shallow-merged per phase.
// ---------------------------------------------------------------------------

describe("workingCopyStore — recordPhase after the answer sidecar's deletion (T063)", () => {
  it("stores no answers: a recorded result's answers never reach the phase slot", () => {
    useWorkingCopyStore.getState().recordPhase(
      {
        phase: "C",
        answers: [{ questionId: "invisiblesQ1", answerType: "text", value: "zwj" }],
      } as unknown as SurveyPhaseResult,
      { stepId: "invisibles" },
    );
    const phaseC = useWorkingCopyStore.getState().phaseResults.find((p) => p.phase === "C");
    expect(phaseC?.answers).toEqual([]);
    expect(
      "phaseAnswersByStep" in useWorkingCopyStore.getState(),
    ).toBe(false);
  });

  it("two steps recording into one phase keep both steps' non-answer fields (shallow merge)", () => {
    useWorkingCopyStore.getState().recordPhase(
      { phase: "C", answers: [], selectedPatternIds: ["p1"] } as unknown as SurveyPhaseResult,
      { stepId: "invisibles" },
    );
    useWorkingCopyStore.getState().recordPhase(
      { phase: "C", answers: [], computedAxes: { scriptClass: "alphabetic" } } as unknown as SurveyPhaseResult,
      { stepId: "convenience" },
    );
    const phaseC = useWorkingCopyStore.getState().phaseResults.find((p) => p.phase === "C");
    expect(phaseC?.selectedPatternIds).toEqual(["p1"]);
    expect(phaseC?.computedAxes).toEqual({ scriptClass: "alphabetic" });
  });

  it("a re-recorded phase replaces its own fields and still carries no answers", () => {
    useWorkingCopyStore.getState().recordPhase(
      { phase: "A", answers: [], identity: { keyboardId: "first" } } as unknown as SurveyPhaseResult,
    );
    useWorkingCopyStore.getState().recordPhase(
      {
        phase: "A",
        answers: [{ questionId: "q", answerType: "text", value: "v" }],
        identity: { keyboardId: "second" },
      } as unknown as SurveyPhaseResult,
    );
    const phaseA = useWorkingCopyStore.getState().phaseResults.find((p) => p.phase === "A");
    expect(phaseA?.identity?.keyboardId).toBe("second");
    expect(phaseA?.answers).toEqual([]);
  });
});