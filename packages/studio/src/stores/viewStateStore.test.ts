// viewStateStore.test — spec 057 T013 (FR-050, FR-051, FR-052, FR-053).

import { describe, it, expect, beforeEach } from "vitest";
import { readPaneSplitPct, useViewStateStore } from "./viewStateStore.ts";

beforeEach(() => {
  useViewStateStore.getState().reset();
});

describe("initial values", () => {
  it("starts every slot at its documented initial value", () => {
    const s = useViewStateStore.getState();
    expect(s.flowMapSection).toBe("flow");
    expect([...s.trailCollapsedSteps]).toEqual([]);
    expect(s.trailShowSuperseded).toBe(false);
    expect(s.paneSplitPct).toEqual({ survey: 45, compare: 40, output: 40 });
    expect(s.oskMode).toEqual({ survey: "desktop", compare: "desktop" });
    expect(s.scrollTop).toEqual({});
    expect(s.compareSelection).toBeNull();
  });

  it("carries no storage layer — the module singleton IS the session scope (FR-051)", () => {
    // A `persist`-wrapped store exposes `.persist`; this one must not, or the
    // Q9 lifetime (survives a tab switch, dies on reload) would be wrong in
    // the direction that needs explicit clearing code.
    expect((useViewStateStore as unknown as { persist?: unknown }).persist).toBeUndefined();
  });
});

describe("slot writes", () => {
  it("sets the flow-map section", () => {
    useViewStateStore.getState().setFlowMapSection("completeness");
    expect(useViewStateStore.getState().flowMapSection).toBe("completeness");
  });

  it("toggles a trail stage on and back off", () => {
    const { toggleTrailStage } = useViewStateStore.getState();
    toggleTrailStage("characters");
    expect([...useViewStateStore.getState().trailCollapsedSteps]).toEqual(["characters"]);
    useViewStateStore.getState().toggleTrailStage("characters");
    expect([...useViewStateStore.getState().trailCollapsedSteps]).toEqual([]);
  });

  it("keeps per-surface pane splits independent", () => {
    useViewStateStore.getState().setPaneSplitPct("survey", 60);
    expect(useViewStateStore.getState().paneSplitPct).toEqual({
      survey: 60,
      compare: 40,
      output: 40,
    });
  });

  it("keeps per-surface OSK modes independent", () => {
    useViewStateStore.getState().setOskMode("compare", "touch");
    expect(useViewStateStore.getState().oskMode).toEqual({
      survey: "desktop",
      compare: "touch",
    });
  });
});

describe("paneSplitPct clamping on read", () => {
  it("returns the stored value when it is within bounds", () => {
    useViewStateStore.getState().setPaneSplitPct("survey", 50);
    expect(readPaneSplitPct("survey", 25, 65)).toBe(50);
  });

  it("clamps a stored value that a later layout's bounds no longer admit", () => {
    // The write is NOT clamped — a value stored under one layout must be
    // preserved — but a read under tighter bounds can never hand back an
    // unusable split (data-model.md ViewState).
    useViewStateStore.getState().setPaneSplitPct("survey", 95);
    expect(useViewStateStore.getState().paneSplitPct.survey).toBe(95);
    expect(readPaneSplitPct("survey", 25, 65)).toBe(65);

    useViewStateStore.getState().setPaneSplitPct("survey", 2);
    expect(readPaneSplitPct("survey", 25, 65)).toBe(25);
  });
});

describe("scrollTop keying", () => {
  it("keys by a stable pane identifier, not an index", () => {
    useViewStateStore.getState().setScrollTop("survey-questions", 120);
    useViewStateStore.getState().setScrollTop("survey-preview", 40);
    expect(useViewStateStore.getState().scrollTop).toEqual({
      "survey-questions": 120,
      "survey-preview": 40,
    });
    // Adding a pane must not shift an existing pane's restored offset.
    useViewStateStore.getState().setScrollTop("trail-list", 8);
    expect(useViewStateStore.getState().scrollTop["survey-questions"]).toBe(120);
  });
});

describe("reset (FR-052)", () => {
  it("clears every slot back to initial", () => {
    const s = useViewStateStore.getState();
    s.setFlowMapSection("strategy");
    s.toggleTrailStage("carve");
    s.setTrailShowSuperseded(true);
    s.setPaneSplitPct("compare", 70);
    s.setOskMode("survey", "tablet");
    s.setScrollTop("trail-list", 300);
    s.setCompareSelection({
      baseKeyboard: { id: "kb", displayName: "KB" } as never,
      oskMode: "touch",
    });

    useViewStateStore.getState().reset();

    const after = useViewStateStore.getState();
    expect(after.flowMapSection).toBe("flow");
    expect([...after.trailCollapsedSteps]).toEqual([]);
    expect(after.trailShowSuperseded).toBe(false);
    expect(after.paneSplitPct).toEqual({ survey: 45, compare: 40, output: 40 });
    expect(after.oskMode).toEqual({ survey: "desktop", compare: "desktop" });
    expect(after.scrollTop).toEqual({});
    expect(after.compareSelection).toBeNull();
  });

  it("hands back a fresh collapsed-step set rather than the previous one", () => {
    useViewStateStore.getState().toggleTrailStage("carve");
    const before = useViewStateStore.getState().trailCollapsedSteps;
    useViewStateStore.getState().reset();
    expect(useViewStateStore.getState().trailCollapsedSteps).not.toBe(before);
  });
});
