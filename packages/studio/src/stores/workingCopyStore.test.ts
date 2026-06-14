// Tests for workingCopyStore — the single canonical source of truth.
//
// Coverage:
//   1. New slots: instantiateFromBase, setIdentity, isInstantiated, reset clears base + identity.
//   2. Adapter reflection: mutations via workingCopyStore are visible via the
//      irStore and surveyResultsStore adapters (same memory, no copy).
//   3. reset() clears all slots.
//
// Tests in irStore.test.ts and surveyResultsStore.test.ts continue to
// own exhaustive coverage of the carve and survey action semantics
// respectively; this file focuses on the new Phase-1 surface.

import { describe, it, expect, beforeEach } from "vitest";
import { useWorkingCopyStore } from "./workingCopyStore.ts";
import { useIRStore } from "./irStore.ts";
import { useSurveyResultsStore } from "./surveyResultsStore.ts";
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

  it("isInstantiated returns false before instantiateFromBase", () => {
    expect(useWorkingCopyStore.getState().isInstantiated()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// instantiateFromBase
// ---------------------------------------------------------------------------

describe("workingCopyStore — instantiateFromBase", () => {
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

  it("isInstantiated returns true after instantiateFromBase", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
    expect(useWorkingCopyStore.getState().isInstantiated()).toBe(true);
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
});

// ---------------------------------------------------------------------------
// reset clears all slots including base + identity
// ---------------------------------------------------------------------------

describe("workingCopyStore — reset", () => {
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

  it("isInstantiated returns false after reset", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
    expect(useWorkingCopyStore.getState().isInstantiated()).toBe(true);
    useWorkingCopyStore.getState().reset();
    expect(useWorkingCopyStore.getState().isInstantiated()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Adapter reflection — mutations via workingCopyStore visible in adapters
// ---------------------------------------------------------------------------

describe("workingCopyStore — adapter reflection (irStore)", () => {
  it("setIR via workingCopyStore is visible in useIRStore.getState()", () => {
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().setIR(ir);
    expect(useIRStore.getState().ir).toBe(ir);
  });

  it("deleteNode via workingCopyStore is visible in useIRStore.getState()", () => {
    useWorkingCopyStore.getState().deleteNode("n1");
    expect(useIRStore.getState().deletedNodeIds.has("n1")).toBe(true);
    expect(useIRStore.getState().isDeleted("n1")).toBe(true);
  });

  it("mutation via useIRStore.getState() is reflected in workingCopyStore", () => {
    const ir = makeTestIR([]);
    useIRStore.getState().setIR(ir);
    expect(useWorkingCopyStore.getState().ir).toBe(ir);
  });

  it("useIRStore.setState() partial update is reflected in workingCopyStore", () => {
    const ir = makeTestIR([]);
    // This mirrors the reset() pattern in irStore.test.ts.
    useIRStore.setState({ ir: null, deletedNodeIds: new Set(), undoStack: [] });
    expect(useWorkingCopyStore.getState().ir).toBeNull();
    // Now set IR via workingCopyStore and verify setState can clear it.
    useWorkingCopyStore.getState().setIR(ir);
    useIRStore.setState({ ir: null, deletedNodeIds: new Set(), undoStack: [] });
    expect(useWorkingCopyStore.getState().ir).toBeNull();
  });
});

describe("workingCopyStore — adapter reflection (surveyResultsStore)", () => {
  it("recordPhase via workingCopyStore is visible in useSurveyResultsStore.getState()", () => {
    const phaseA: SurveyPhaseResult = {
      phase: "A",
      answers: [],
      computedAxes: { scriptClass: "alphabetic" },
    };
    useWorkingCopyStore.getState().recordPhase(phaseA);
    const s = useSurveyResultsStore.getState();
    expect(s.phaseResults).toHaveLength(1);
    expect(s.session.axes.scriptClass).toBe("alphabetic");
  });

  it("lockDesktop via workingCopyStore is visible in useSurveyResultsStore.getState()", () => {
    useWorkingCopyStore.getState().lockDesktop();
    expect(useSurveyResultsStore.getState().desktopLocked).toBe(true);
  });

  it("mutation via useSurveyResultsStore.getState() is reflected in workingCopyStore", () => {
    useSurveyResultsStore.getState().lockDesktop();
    expect(useWorkingCopyStore.getState().desktopLocked).toBe(true);
  });

  it("reset() via useSurveyResultsStore clears all survey AND base slots", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
    useSurveyResultsStore.getState().lockDesktop();
    // reset() in the adapter delegates to workingCopyStore.reset() which clears everything.
    useSurveyResultsStore.getState().reset();
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
    expect(useIRStore.getState().deletedNodeIds.has("n1")).toBe(true);
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
