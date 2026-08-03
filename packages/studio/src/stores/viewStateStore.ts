// viewStateStore — per-tab presentation settings (spec 057 US5, FR-050…FR-053).
//
// "Which section of the flow map was open", "which stages were collapsed",
// "where the pane divider sat" — settings with no authoring meaning that today
// live in component `useState` and are therefore destroyed by the route
// unmount every tab switch causes.
//
// SESSION-SCOPED BY CONSTRUCTION (Q9, D-5). This is a module-level zustand
// singleton with NO storage layer: it outlives a route unmount because the
// module outlives the React tree, and it dies with the JS context, so a reload
// starts fresh. That is exactly the required lifetime, achieved with zero
// persistence code — there is deliberately no `persist` middleware, no
// sessionStorage, and no slot in the durable draft envelope (FR-051, FR-071).
//
// FR-053: every slot here is presentation-only. Reading or writing one must
// never reach a compile, a validator run, or any authoring store. A value that
// could change an emitted artifact does not belong in this file.
//
// `reset()` is called from exactly the two existing start-over paths —
// `StudioShell.handleStartOver()` and WelcomeScreen's "I'm new" — so view
// state is cleared with the session it belongs to and never outlives it
// (FR-052).

import { create } from "zustand";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import type { OskMode } from "../components/OskModeToggle.tsx";

/** The flow map's section tabs (mirrors `Section` in dashboard/DashboardView.tsx). */
export type FlowMapSection = "flow" | "routing" | "strategy" | "completeness";

/** The surfaces that own a resizable two-pane split. */
export type SplitSurface = "survey" | "compare" | "output";

/** The surfaces that own an OSK desktop/touch toggle. */
export type OskSurface = "survey" | "compare";

/**
 * A keyboard loaded on the Compare tab for inspection (data-model.md
 * CompareSession). It carries NO reference to the working copy and is never
 * serialized — see the Compare isolation contract (FR-021).
 */
export interface CompareSession {
  readonly baseKeyboard: BaseKeyboard;
  readonly oskMode: OskMode;
}

/**
 * Initial pane splits, per surface. These mirror the per-screen `initPct`
 * constants the surfaces pass to `useResizablePanes` today
 * (SURVEY_LEFT_INIT_PCT in StudioShell.tsx; LEFT_INIT_PCT in
 * components/previewOutputLayout.ts), so backing the split with the store
 * changes no default.
 */
const INITIAL_SPLIT_PCT: Record<SplitSurface, number> = {
  survey: 45,
  compare: 40,
  output: 40,
};

const INITIAL_OSK_MODE: Record<OskSurface, OskMode> = {
  survey: "desktop",
  compare: "desktop",
};

export interface ViewState {
  /** Flow Map: which section tab is open. Replaces DashboardView's useState. */
  flowMapSection: FlowMapSection;
  /** Decision trail: which stages are collapsed. Replaces DecisionTrailView's useState. */
  trailCollapsedSteps: ReadonlySet<string>;
  /** Decision trail: whether superseded entries are revealed. */
  trailShowSuperseded: boolean;
  /** Left-pane percentage per surface. Clamped on read, never on write. */
  paneSplitPct: Readonly<Record<SplitSurface, number>>;
  /** OSK desktop/touch/tablet choice per surface. */
  oskMode: Readonly<Record<OskSurface, OskMode>>;
  /**
   * Scroll offsets keyed by a STABLE pane identifier — never an array index,
   * so adding a pane cannot silently re-target a restored offset.
   */
  scrollTop: Readonly<Record<string, number>>;
  /** The keyboard currently loaded on the Compare tab, if any (Q5). */
  compareSelection: CompareSession | null;

  setFlowMapSection: (section: FlowMapSection) => void;
  setTrailCollapsedSteps: (steps: ReadonlySet<string>) => void;
  toggleTrailStage: (stepId: string) => void;
  setTrailShowSuperseded: (show: boolean) => void;
  setPaneSplitPct: (surface: SplitSurface, pct: number) => void;
  setOskMode: (surface: OskSurface, mode: OskMode) => void;
  setScrollTop: (paneId: string, top: number) => void;
  setCompareSelection: (session: CompareSession | null) => void;

  /** Clear every slot back to its initial value (FR-052). */
  reset: () => void;
}

type ViewStateData = Omit<
  ViewState,
  | "setFlowMapSection"
  | "setTrailCollapsedSteps"
  | "toggleTrailStage"
  | "setTrailShowSuperseded"
  | "setPaneSplitPct"
  | "setOskMode"
  | "setScrollTop"
  | "setCompareSelection"
  | "reset"
>;

/**
 * Extracted so `reset()` and the initializer share one source — a new slot
 * added to `ViewState` fails to compile here until it is accounted for, so it
 * can never be silently left out of the start-over clear.
 */
const INITIAL_STATE: ViewStateData = {
  flowMapSection: "flow",
  trailCollapsedSteps: new Set<string>(),
  trailShowSuperseded: false,
  paneSplitPct: INITIAL_SPLIT_PCT,
  oskMode: INITIAL_OSK_MODE,
  scrollTop: {},
  compareSelection: null,
};

export const useViewStateStore = create<ViewState>((set, get) => ({
  ...INITIAL_STATE,

  setFlowMapSection: (flowMapSection) => set({ flowMapSection }),

  setTrailCollapsedSteps: (trailCollapsedSteps) => set({ trailCollapsedSteps }),

  toggleTrailStage: (stepId) => {
    const next = new Set(get().trailCollapsedSteps);
    if (next.has(stepId)) next.delete(stepId);
    else next.add(stepId);
    set({ trailCollapsedSteps: next });
  },

  setTrailShowSuperseded: (trailShowSuperseded) => set({ trailShowSuperseded }),

  setPaneSplitPct: (surface, pct) =>
    set({ paneSplitPct: { ...get().paneSplitPct, [surface]: pct } }),

  setOskMode: (surface, mode) => set({ oskMode: { ...get().oskMode, [surface]: mode } }),

  setScrollTop: (paneId, top) => set({ scrollTop: { ...get().scrollTop, [paneId]: top } }),

  setCompareSelection: (compareSelection) => set({ compareSelection }),

  reset: () => set({ ...INITIAL_STATE, trailCollapsedSteps: new Set<string>() }),
}));

/**
 * Read a surface's pane split, clamped to that screen's current bounds.
 *
 * Clamping happens on READ, not on write: a split stored under one screen's
 * layout must not be able to produce an unusable pane after the layout's
 * min/max change (data-model.md ViewState). A caller passes the same
 * `minPct`/`maxPct` it hands `useResizablePanes`.
 */
export function readPaneSplitPct(
  surface: SplitSurface,
  minPct: number,
  maxPct: number,
): number {
  const stored = useViewStateStore.getState().paneSplitPct[surface];
  return Math.min(maxPct, Math.max(minPct, stored));
}
