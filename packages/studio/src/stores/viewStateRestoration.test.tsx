// viewStateRestoration.test — spec 057 T062 (FR-050, FR-052, FR-053, SC-011).
//
// Integration proof for User Story 5: every FR-050 view-state control
// survives a route change — unmount + remount, which is exactly what
// StudioShell's route switch does to a tab's component tree, there being no
// other lifecycle event a tab switch fires — and every control clears
// together on `reset()` (FR-052, the "start-over" contract).
//
// Two of the six FR-050 controls (the Flow Map's section, the Decision
// trail's per-stage collapse set + replaced-decisions toggle) are exercised
// through the REAL components this feature wires them into (`FlowMapView`,
// `DecisionTrailView`) — the `initialX` / `onXChange` props those components
// gained in this story, the same "read on mount, notify on change" idiom
// `useResizablePanes` already uses for pane splits. dashboard/ and decisions/
// may not import `stores/` directly (the dashboard-layer / decisions-layer
// depcruise boundaries), so this file plays StudioShell's part: it reads
// `viewStateStore` itself and hands the components only plain values and
// callbacks, exactly as StudioShell will.
//
// The remaining three (pane split, OSK mode, scroll offset — plus the
// Compare-tab selection, a fourth FR-050 control this file also covers) are
// proven directly against `viewStateStore`, the SAME module singleton every
// consuming surface reads and writes (`CompareScreen`'s `useResizablePanes`
// wiring, `useCompareArtifact`, `useScrollRestoration`). A value set through
// the store here is indistinguishable from one a real screen would have
// written; the store's OWN persistence-across-a-route-change guarantee is
// unit-proven once in viewStateStore.test.ts (T013) and is not re-derived
// here. Scroll restoration is additionally proven at the COMPONENT level
// below, through the real `useScrollRestoration` wiring inside `FlowMapView`
// and `DecisionTrailView` (T060) — not just at the hook level
// (useScrollRestoration.test.ts already covers the keying rules in isolation).
//
// FR-053 / SC-011 — THE POINT OF THIS FILE — is asserted STRUCTURALLY, not by
// inspection. `compile` and `validateWithOracle`, both from
// `@keyboard-studio/engine`, are the two seams the constitution's Article IV
// names: the compiler and the validator oracle. They are wrapped in spies
// that still call through to the real implementation (so nothing else in a
// render breaks), and a single shared `afterEach` asserts BOTH were called
// zero times after every scenario in this file — not just the ones that look
// like they might reach a compile. A future change that made restoring view
// state reach either seam would fail every test here, not just a dedicated
// one.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import type { DecisionEntry, DecisionImpact, DecisionRecord } from "@keyboard-studio/contracts";
import { FlowMapView } from "../dashboard/DashboardView.tsx";
import { DecisionTrailView } from "../decisions/DecisionTrailView.tsx";
import { useViewStateStore } from "./viewStateStore.ts";

// ---------------------------------------------------------------------------
// The compile / validator seams — spied, not stubbed, so every OTHER test in
// the suite (which does not otherwise touch the engine) keeps its real
// behaviour. See the module docstring's FR-053 paragraph.
// ---------------------------------------------------------------------------

// vi.hoisted, not a plain top-level const: vi.mock's factory is itself
// hoisted above ordinary module-level statements, so a plain `const` here
// would be read before its own initializer ran (TDZ) the moment the factory
// executes.
const { compileSpy, validateWithOracleSpy } = vi.hoisted(() => ({
  compileSpy: vi.fn(),
  validateWithOracleSpy: vi.fn(),
}));

vi.mock("@keyboard-studio/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@keyboard-studio/engine")>();
  compileSpy.mockImplementation(actual.compile);
  validateWithOracleSpy.mockImplementation(actual.validateWithOracle);
  return { ...actual, compile: compileSpy, validateWithOracle: validateWithOracleSpy };
});

beforeEach(() => {
  useViewStateStore.getState().reset();
});

afterEach(() => {
  // FR-053 / SC-011, asserted for EVERY test in this file, not a subset.
  expect(compileSpy).not.toHaveBeenCalled();
  expect(validateWithOracleSpy).not.toHaveBeenCalled();
  cleanup();
  compileSpy.mockClear();
  validateWithOracleSpy.mockClear();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CAPTURED: DecisionImpact = {
  state: "captured",
  files: [],
  magnitude: { added: 0, removed: 0 },
};

function answerEntry(entryId: string, overrides: Partial<DecisionEntry> = {}): DecisionEntry {
  return {
    entryId,
    stepId: "identity",
    payload: {
      kind: "survey-answer",
      questionId: "il_target_script",
      answerType: "select",
      value: "Latn",
    },
    provenance: { agency: "hand-set" },
    recordedAt: 1,
    supersedes: null,
    ...overrides,
  };
}

function recordOf(entries: DecisionEntry[]): DecisionRecord {
  return {
    format: "keyboard-studio.decision-record",
    version: 1,
    keyboardId: "kb",
    entries,
    truncated: null,
  };
}

/** identity, then choose_base — two distinct manifest-ordered stage groups. */
const TWO_STAGE_RECORD = recordOf([
  answerEntry("d1"),
  answerEntry("d2", { stepId: "choose_base" }),
]);

interface TrailOverrides {
  record?: DecisionRecord;
  initialCollapsedSteps?: ReadonlySet<string>;
  onToggleStage?: (stepId: string) => void;
  initialShowSuperseded?: boolean;
  onShowSupersededChange?: (show: boolean) => void;
}

function renderTrail(opts: TrailOverrides = {}) {
  return render(
    <DecisionTrailView
      record={opts.record ?? TWO_STAGE_RECORD}
      resolveImpact={() => CAPTURED}
      {...(opts.initialCollapsedSteps !== undefined
        ? { initialCollapsedSteps: opts.initialCollapsedSteps }
        : {})}
      {...(opts.onToggleStage !== undefined ? { onToggleStage: opts.onToggleStage } : {})}
      {...(opts.initialShowSuperseded !== undefined
        ? { initialShowSuperseded: opts.initialShowSuperseded }
        : {})}
      {...(opts.onShowSupersededChange !== undefined
        ? { onShowSupersededChange: opts.onShowSupersededChange }
        : {})}
    />,
  );
}

// ---------------------------------------------------------------------------
// Flow Map section (FR-050)
// ---------------------------------------------------------------------------

describe("Flow Map section survives a route change (FR-050)", () => {
  it("mounts on the section a caller supplies as initialSection", () => {
    const { unmount } = render(
      <FlowMapView initialSection="strategy" onSectionChange={() => {}} />,
    );
    // Rule 1 of the §7.2 table renders only inside the strategy-tree section.
    expect(screen.getByText("A1=massive AND A2=logographic")).toBeTruthy();
    unmount();
  });

  it("notifies the caller of every section change, so StudioShell can persist it", () => {
    const onSectionChange = vi.fn();
    render(<FlowMapView onSectionChange={onSectionChange} />);
    fireEvent.click(screen.getByText("Script routing (§9)"));
    expect(onSectionChange).toHaveBeenCalledWith("routing");
  });

  it("round-trips end to end through viewStateStore across an unmount + remount", () => {
    const setFlowMapSection = useViewStateStore.getState().setFlowMapSection;
    const readSection = () => useViewStateStore.getState().flowMapSection;

    const { unmount } = render(
      <FlowMapView initialSection={readSection()} onSectionChange={setFlowMapSection} />,
    );
    fireEvent.click(screen.getByText("Script routing (§9)"));
    expect(readSection()).toBe("routing");
    unmount(); // the route-change simulation

    render(<FlowMapView initialSection={readSection()} onSectionChange={setFlowMapSection} />);
    // "qwerty-qwertz" / "non-roman" only render inside the routing section —
    // proof the REMOUNT actually landed on what the PRIOR mount left behind,
    // not just that the store itself held the value (already proven in T013).
    expect(screen.getAllByText("qwerty-qwertz").length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Decision trail: per-stage collapse + replaced-decisions toggle (FR-050)
// ---------------------------------------------------------------------------

describe("Decision trail collapse set survives a route change (FR-050)", () => {
  it("mounts with the stage collapsed initialCollapsedSteps names", () => {
    renderTrail({ initialCollapsedSteps: new Set(["identity"]) });
    const toggle = screen.getAllByTestId("decision-stage-toggle")[0]!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("notifies the caller with the toggled stepId — the same shape as viewStateStore.toggleTrailStage", () => {
    const onToggleStage = vi.fn();
    renderTrail({ onToggleStage });
    fireEvent.click(screen.getAllByTestId("decision-stage-toggle")[0]!);
    expect(onToggleStage).toHaveBeenCalledWith("identity");
  });

  it("wires directly to viewStateStore.toggleTrailStage and round-trips a collapse across a route change", () => {
    const { toggleTrailStage } = useViewStateStore.getState();
    const readCollapsed = () => useViewStateStore.getState().trailCollapsedSteps;

    const { unmount } = renderTrail({
      initialCollapsedSteps: readCollapsed(),
      onToggleStage: toggleTrailStage,
    });
    fireEvent.click(screen.getAllByTestId("decision-stage-toggle")[0]!);
    expect([...useViewStateStore.getState().trailCollapsedSteps]).toEqual(["identity"]);
    unmount(); // the route-change simulation

    renderTrail({ initialCollapsedSteps: readCollapsed(), onToggleStage: toggleTrailStage });
    const toggleAfterRemount = screen.getAllByTestId("decision-stage-toggle")[0]!;
    expect(toggleAfterRemount.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("Decision trail's replaced-decisions toggle survives a route change (FR-050)", () => {
  const SUPERSEDING_RECORD = recordOf([answerEntry("d1"), answerEntry("d2", { supersedes: "d1" })]);

  it("mounts with the toggle already on when initialShowSuperseded is true", () => {
    renderTrail({ record: SUPERSEDING_RECORD, initialShowSuperseded: true });
    expect(screen.getByTestId("decision-superseded-toggle").getAttribute("aria-expanded")).toBe(
      "true",
    );
  });

  it("notifies the caller when the toggle changes", () => {
    const onShowSupersededChange = vi.fn();
    renderTrail({ record: SUPERSEDING_RECORD, onShowSupersededChange });
    fireEvent.click(screen.getByTestId("decision-superseded-toggle"));
    expect(onShowSupersededChange).toHaveBeenCalledWith(true);
  });

  it("round-trips through viewStateStore.setTrailShowSuperseded across a route change", () => {
    const setTrailShowSuperseded = useViewStateStore.getState().setTrailShowSuperseded;
    const readShowSuperseded = () => useViewStateStore.getState().trailShowSuperseded;

    const { unmount } = renderTrail({
      record: SUPERSEDING_RECORD,
      initialShowSuperseded: readShowSuperseded(),
      onShowSupersededChange: setTrailShowSuperseded,
    });
    fireEvent.click(screen.getByTestId("decision-superseded-toggle"));
    expect(readShowSuperseded()).toBe(true);
    unmount(); // the route-change simulation

    renderTrail({
      record: SUPERSEDING_RECORD,
      initialShowSuperseded: readShowSuperseded(),
    });
    expect(screen.getByTestId("decision-superseded-toggle").getAttribute("aria-expanded")).toBe(
      "true",
    );
  });
});

// ---------------------------------------------------------------------------
// Scroll offset (FR-050) — proven at the COMPONENT level through the real
// useScrollRestoration wiring T060 put inside FlowMapView / DecisionTrailView,
// not just at the hook level (useScrollRestoration.test.ts covers the keying
// rules directly).
// ---------------------------------------------------------------------------

describe("Scroll offset survives a route change, keyed per screen (FR-050)", () => {
  it("restores the Flow Map's own scroll offset across an unmount + remount", () => {
    const { unmount } = render(<FlowMapView />);
    const root = screen.getByTestId("flow-map-root");
    root.scrollTop = 240;
    root.dispatchEvent(new Event("scroll"));
    unmount(); // the route-change simulation

    render(<FlowMapView />);
    expect(screen.getByTestId("flow-map-root").scrollTop).toBe(240);
  });

  it("restores the Decision trail's own scroll offset across an unmount + remount", () => {
    const { unmount } = renderTrail();
    const root = screen.getByTestId("decision-trail");
    root.scrollTop = 88;
    root.dispatchEvent(new Event("scroll"));
    unmount(); // the route-change simulation

    renderTrail();
    expect(screen.getByTestId("decision-trail").scrollTop).toBe(88);
  });

  it("keeps the two screens' scroll offsets independent — different stable pane ids, never an index", () => {
    render(<FlowMapView />);
    screen.getByTestId("flow-map-root").scrollTop = 111;
    screen.getByTestId("flow-map-root").dispatchEvent(new Event("scroll"));

    renderTrail();
    screen.getByTestId("decision-trail").scrollTop = 222;
    screen.getByTestId("decision-trail").dispatchEvent(new Event("scroll"));

    expect(useViewStateStore.getState().scrollTop).toMatchObject({
      "dashboard-flow-map": 111,
      "decision-trail": 222,
    });
  });
});

// ---------------------------------------------------------------------------
// Pane split, OSK mode, Compare selection — proven directly against the
// store, the single thing every consuming screen (CompareScreen,
// useResizablePanes' onChange) reads and writes (FR-050).
// ---------------------------------------------------------------------------

describe("Pane split, OSK mode and Compare selection survive a route change (FR-050)", () => {
  it("keeps a pane split in the store — the same slot CompareScreen's useResizablePanes onChange writes", () => {
    useViewStateStore.getState().setPaneSplitPct("compare", 62);
    expect(useViewStateStore.getState().paneSplitPct.compare).toBe(62);
  });

  it("keeps an OSK mode in the store — the same slot useCompareArtifact's setOskMode writes", () => {
    useViewStateStore.getState().setOskMode("compare", "touch");
    expect(useViewStateStore.getState().oskMode.compare).toBe("touch");
  });

  it("keeps a Compare selection in the store (Q5 — session-scoped, not durable)", () => {
    useViewStateStore.getState().setCompareSelection({
      baseKeyboard: { id: "kb", displayName: "KB" } as never,
      oskMode: "desktop",
    });
    expect(useViewStateStore.getState().compareSelection?.baseKeyboard.id).toBe("kb");
  });
});

// ---------------------------------------------------------------------------
// Start-over clears every FR-050 slot together (FR-052)
// ---------------------------------------------------------------------------

describe("start-over clears every FR-050 slot together (FR-052)", () => {
  it("reset() clears the section, the trail state, pane splits, OSK modes, scroll offsets and the Compare selection", () => {
    const s = useViewStateStore.getState();
    s.setFlowMapSection("strategy");
    s.toggleTrailStage("carve");
    s.setTrailShowSuperseded(true);
    s.setPaneSplitPct("survey", 70);
    s.setOskMode("survey", "touch");
    s.setScrollTop("decision-trail", 500);
    s.setCompareSelection({
      baseKeyboard: { id: "kb", displayName: "KB" } as never,
      oskMode: "touch",
    });

    useViewStateStore.getState().reset();

    const after = useViewStateStore.getState();
    expect(after.flowMapSection).toBe("flow");
    expect([...after.trailCollapsedSteps]).toEqual([]);
    expect(after.trailShowSuperseded).toBe(false);
    expect(after.paneSplitPct.survey).toBe(45);
    expect(after.oskMode.survey).toBe("desktop");
    expect(after.scrollTop).toEqual({});
    expect(after.compareSelection).toBeNull();
  });

  it("a fresh mount after start-over shows no trace of the discarded session's view state", () => {
    useViewStateStore.getState().setFlowMapSection("completeness");
    useViewStateStore.getState().reset();

    render(<FlowMapView />);
    // Rendered only in the "flow" section — proves the fresh mount landed on
    // the documented default, not on the discarded session's "completeness".
    expect(screen.getByText("gate (conditional next)")).toBeTruthy();
  });
});
