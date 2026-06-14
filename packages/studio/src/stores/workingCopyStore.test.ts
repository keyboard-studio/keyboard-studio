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
import { useWorkingCopyStore } from "./workingCopyStore.ts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";

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

  it("clears prior phaseResults so a fresh session starts clean", () => {
    const phaseA: SurveyPhaseResult = {
      phase: "A",
      answers: [],
      computedAxes: { scriptClass: "alphabetic" },
    };
    useWorkingCopyStore.getState().recordPhase(phaseA);
    expect(useWorkingCopyStore.getState().phaseResults).toHaveLength(1);

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

  it("clears phaseResults so adapt session starts clean", () => {
    const phaseA: SurveyPhaseResult = {
      phase: "A",
      answers: [],
      computedAxes: { scriptClass: "alphabetic" },
    };
    useWorkingCopyStore.getState().recordPhase(phaseA);
    expect(useWorkingCopyStore.getState().phaseResults).toHaveLength(1);

    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir });

    expect(useWorkingCopyStore.getState().phaseResults).toHaveLength(0);
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
