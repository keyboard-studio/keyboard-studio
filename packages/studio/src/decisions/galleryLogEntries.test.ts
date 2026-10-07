// galleryLogEntries — spec 090 US5 (T051): the HANDOFF G7 gaps, verified at
// the store level through the REAL StepHost and the REAL decision recorder
// (createStudioDecisionRecorder composed exactly as StudioShell composes
// it). Each G7 gallery step's completion leaves exactly one live
// `decision`-kind log entry carrying the decision's settled value — the
// entries SC-003 counts. The gallery steps complete with `undefined`
// results here (as the real adapters do); the settled decisions are seeded
// into the decision store first, as the gallery host / step adapters record
// them during the step.
//
// Also verified, per the HANDOFF's own wording: the G7 *starting-point*
// item. Completing choose_base with NO instantiated working copy leaves NO
// base-contribution entry — the recorder's recordBaseContribution returns
// null when the working copy was never seeded, and the recorder fires
// synchronously inside handleComplete, before StudioShell's doCommit
// effect instantiates the copy. That residue is RECORDED in
// specs/090-gallery-decision-modules/followups.md (an 088/092-boundary
// item), not fixed here; the live-walk spec (e2e/decision-log.spec.ts)
// deliberately does not assert base-contribution presence either.

import { createElement } from "react";
import { screen, fireEvent, act, cleanup } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StepHost } from "../components/StepHost.tsx";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDecisionStore, getDecisionSnapshot } from "../stores/decisionStore.ts";
import {
  liveEntryForSlot,
  resetDecisionEntryIds,
  slotKeyOf,
  useDecisionLogStore,
  type DecisionEntry,
} from "./decisionLogStore.ts";
import { createStudioDecisionRecorder } from "./createStudioDecisionRecorder.ts";
import type { ReducerDeps } from "../steps/reducer.ts";
import type { Snapshotter } from "../steps/snapshotter.ts";
import type { DecisionInput } from "./decisionTypes.ts";

// This file is .ts (per T051's named path), so the trivial steps are built
// with createElement rather than JSX.
function TrivialStep({
  onComplete,
}: {
  onComplete: (r: unknown) => void;
  onBack?: () => void;
}) {
  return createElement(
    "button",
    { type: "button", "data-testid": "complete", onClick: () => onComplete(undefined) },
    "Complete",
  );
}

function ChooseBaseStep({
  onComplete,
}: {
  onComplete: (r: unknown) => void;
  onBack?: () => void;
}) {
  // InstantiateResult-shaped (spec 053's shape): the recorder's choose_base
  // branch reads it; with no instantiated working copy the base
  // contribution must still come back null.
  return createElement(
    "button",
    {
      type: "button",
      "data-testid": "complete",
      onClick: () =>
        onComplete({
          base: { id: "basic_kbdus" },
          baseKeyboard: { id: "basic_kbdus" },
          instantiationMode: "copy",
        }),
    },
    "Complete",
  );
}

vi.mock("../steps/manifest.ts", () => ({
  manifest: [
    { kind: "editor-step", id: "choose_base", title: "Choose base", inputs: [], writes: [], component: ChooseBaseStep },
    { kind: "editor-step", id: "layout", title: "Layout", inputs: [], writes: [], component: TrivialStep },
    { kind: "editor-step", id: "punctuation", title: "Punctuation", inputs: [], writes: [], component: TrivialStep },
    { kind: "editor-step", id: "convenience", title: "Convenience", inputs: [], writes: [], component: TrivialStep },
    { kind: "editor-step", id: "deadkeys", title: "Deadkeys", inputs: [], writes: [], component: TrivialStep },
    { kind: "editor-step", id: "rules", title: "Rules", inputs: [], writes: [], component: TrivialStep },
    { kind: "editor-step", id: "touch_seed_source", title: "Touch seed source", inputs: [], writes: [], component: TrivialStep },
    { kind: "editor-step", id: "help", title: "Help", inputs: [], writes: [], component: TrivialStep },
  ],
  // steps/stepOrder.ts re-publishes the manifest's derivation (spec 091
  // T008/T016), so the stub must model these exports too — mirroring the
  // real screens/trails for the mocked steps above.
  derivedScreens: [
    { id: "choose_base", kind: "custom", decisionIds: ["base-keyboard"], moduleIds: [], spine: true },
    { id: "layout", kind: "custom", decisionIds: ["windows-layout"], moduleIds: [], spine: true },
    { id: "punctuation", kind: "custom", decisionIds: ["punctuation-inventory"], moduleIds: [], spine: true },
    { id: "convenience", kind: "custom", decisionIds: ["retained-convenience-chars"], moduleIds: [], spine: true },
    { id: "deadkeys", kind: "custom", decisionIds: ["deadkeys-defined"], moduleIds: [], spine: true },
    { id: "rules", kind: "custom", decisionIds: ["rule-set"], moduleIds: [], spine: true },
    { id: "touch_seed_source", kind: "custom", decisionIds: ["touch-seed-source"], moduleIds: [], spine: false, joinTarget: "touch" },
    { id: "help", kind: "custom", decisionIds: ["help-docs"], moduleIds: [], spine: true },
  ],
  screenTrails: new Map([
    ["choose_base", { spine: true }],
    ["layout", { spine: true }],
    ["punctuation", { spine: true }],
    ["convenience", { spine: true }],
    ["deadkeys", { spine: true }],
    ["rules", { spine: true }],
    ["touch_seed_source", { spine: false, joinTarget: "touch" }],
    ["help", { spine: true }],
    ["package", { spine: true }],
  ]),
  screenGates: new Map(),
}));

const snapshotter: Snapshotter = {
  captureAtBoundary: () => Promise.resolve(null),
  reset: () => {},
};

function depsWithRealRecorder(): ReducerDeps {
  return {
    instantiateFromBase: vi.fn(),
    instantiateFromExisting: vi.fn(),
    instantiateFromBaseIfConfirmed: vi.fn(() => true),
    recordDecision: createStudioDecisionRecorder({
      getWorkingCopyState: useWorkingCopyStore.getState,
      snapshotter,
      getDecisions: () => getDecisionSnapshot(),
    }),
  };
}

beforeEach(() => {
  useDecisionStore.getState().reset();
  useDecisionLogStore.getState().reset();
  resetDecisionEntryIds();
  useSurveySessionStore.getState().reset();
});

afterEach(() => {
  cleanup();
});

function completeStep(stepId: string, deps: ReducerDeps): void {
  act(() => {
    useSurveySessionStore.getState().advance(stepId);
  });
  const view = render(createElement(StepHost, { reducerDeps: deps, onStartOver: () => {} }));
  act(() => {
    fireEvent.click(screen.getByTestId("complete"));
  });
  view.unmount();
}

function liveDecisionEntry(decisionId: string): DecisionEntry | undefined {
  const slot = slotKeyOf("probe", {
    kind: "decision",
    decisionId,
    value: null,
    summary: "probe",
  });
  return liveEntryForSlot(useDecisionLogStore.getState().record.entries, slot);
}

function liveDecisionEntries(): DecisionEntry[] {
  const { entries } = useDecisionLogStore.getState().record;
  // Liveness mirrors the store's own model: an entry is superseded when a
  // later entry's `supersedes` names it.
  const superseded = new Set(
    entries.map((e) => e.supersedes).filter((id) => id !== null),
  );
  return entries.filter((e) => !superseded.has(e.entryId) && e.payload.kind === "decision");
}

// The G7 gaps named in tasks.md T051, with the value each step's host
// settles (shapes per the modules' value types).
const G7_CASES: ReadonlyArray<{
  stepId: string;
  record: DecisionInput;
}> = [
  {
    stepId: "layout",
    record: { id: "windows-layout", value: { layoutId: "basic_french" }, provenance: "asked" },
  },
  {
    stepId: "rules",
    record: {
      id: "rule-set",
      value: { additions: [{ id: "rule_acute" }, { id: "rule_grave" }] },
      provenance: "asked",
    },
  },
  {
    stepId: "touch_seed_source",
    record: { id: "touch-seed-source", value: "import-adapt", provenance: "asked" },
  },
  {
    stepId: "deadkeys",
    record: {
      id: "deadkeys-defined",
      value: { ops: [{ kind: "define", triggerOutput: "´", combiningOutput: "́" }] },
      provenance: "asked",
    },
  },
  {
    stepId: "punctuation",
    record: {
      id: "punctuation-inventory",
      value: {
        accepted: [{ char: "«", provenance: "asked" }],
        declined: [{ char: "»", provenance: "asked" }],
      },
      provenance: "asked",
    },
  },
  {
    stepId: "convenience",
    record: {
      id: "retained-convenience-chars",
      value: { retained: [{ char: "@", provenance: "asked" }], rejected: ["#"] },
      provenance: "asked",
    },
  },
];

describe("spec 090 T051 — G7 gallery decisions leave exactly one live log entry", () => {
  for (const { stepId, record } of G7_CASES) {
    it(`${record.id} (${stepId})`, () => {
      const deps = depsWithRealRecorder();
      useDecisionStore.getState().record(record);
      completeStep(stepId, deps);

      const live = liveDecisionEntry(record.id);
      expect(live).toBeDefined();
      expect(live?.stepId).toBe(stepId);
      if (live?.payload.kind !== "decision") throw new Error("expected decision payload");
      expect(live.payload.value).toEqual(record.value);
      expect(live.payload.summary.length).toBeGreaterThan(0);
      expect(live.payload.summary.length).toBeLessThanOrEqual(200);
      // Exactly one live decision-kind entry overall for this walk.
      expect(liveDecisionEntries()).toHaveLength(1);
    });
  }

  it("help-docs: the record T052's gate writes is logged at help completion", () => {
    const deps = depsWithRealRecorder();
    useDecisionStore.getState().record({
      id: "help-docs",
      value: { answers: { pf_welcome_paragraph: "Welcome!" } },
      provenance: "derived",
      step: "help",
    });
    completeStep("help", deps);
    const live = liveDecisionEntry("help-docs");
    expect(live).toBeDefined();
    if (live?.payload.kind !== "decision") throw new Error("expected decision payload");
    expect(live.payload.value).toEqual({ answers: { pf_welcome_paragraph: "Welcome!" } });
  });

  it("an unchanged re-completion appends nothing; a changed value supersedes", () => {
    const deps = depsWithRealRecorder();
    const rules = G7_CASES.find((c) => c.record.id === "rule-set");
    if (rules === undefined) throw new Error("fixture missing");
    useDecisionStore.getState().record(rules.record);
    completeStep("rules", deps);
    const afterFirst = useDecisionLogStore.getState().record.entries.length;
    expect(afterFirst).toBeGreaterThan(0);

    completeStep("rules", deps);
    expect(useDecisionLogStore.getState().record.entries.length).toBe(afterFirst);
    expect(liveDecisionEntries()).toHaveLength(1);

    useDecisionStore.getState().record({
      ...rules.record,
      value: { additions: [{ id: "rule_acute" }] },
    });
    completeStep("rules", deps);
    expect(liveDecisionEntries()).toHaveLength(1);
    const live = liveDecisionEntry("rule-set");
    if (live?.payload.kind !== "decision") throw new Error("expected decision payload");
    expect(live.payload.value).toEqual({ additions: [{ id: "rule_acute" }] });
  });
});

describe("spec 090 T051 — HANDOFF G7 starting-point verification (residue, not fixed)", () => {
  it("choose_base completion with no instantiated working copy leaves NO base-contribution entry", () => {
    const deps = depsWithRealRecorder();
    completeStep("choose_base", deps);
    const { entries } = useDecisionLogStore.getState().record;
    expect(
      entries.filter((e) => e.payload.kind === "base-contribution"),
    ).toHaveLength(0);
  });
});
