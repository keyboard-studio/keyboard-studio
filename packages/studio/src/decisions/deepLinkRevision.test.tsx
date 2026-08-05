// deepLinkRevision.test — spec 057 T044, SC-008.
//
// "Revising an answer through a deep link produces exactly one new decision
// entry linked to the one it replaces, and marks the same steps stale as
// making the same change in the ordinary walk would."
//
// The way this is proven: the SAME edit (re-completing the "touch" editor
// step with a changed summary) is run through StepHost TWICE — once reached
// by an ordinary walk, once reached by `jumpToLocation` from a simulated
// trail entry — and the two runs' resulting decision-log entries and
// working-copy `staleSteps` are compared. FR-032/FR-033 are the claim that
// StepHost's revise-and-return (T043) changes ONLY where the author lands
// afterward, never what recording or staleness do — so "compare the two
// paths' side effects" is a direct test of that claim, not an indirect one.
//
// "touch" is the fixture target because it is the one step whose completion
// drives a REAL staleness side effect through the ordinary, unconditional
// reducer path (`applyStepCompletion`'s TOUCH_STEP_ID case calls
// `deps.clearStale("touch")` regardless of the mutate-seam flag) — no IR /
// write-graph ceremony needed to exercise it, unlike "mechanisms".
//
// Deliberately at the store/StepHost level, matching wizardEntryPoints.test.tsx's
// own stated reason: the promise under test is "the same side effects run, and
// only the destination differs", and that is a store-level promise, not a
// layout one. `e2e/decision-deeplink.spec.ts` is the browser-level version.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { EditorStep, EditorStepProps, Step } from "../steps/types.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useWorkingCopyStore, bindManifest } from "../stores/workingCopyStore.ts";
import { useDecisionLogStore, resetDecisionEntryIds } from "./decisionLogStore.ts";
import type { ReducerDeps } from "../steps/reducer.ts";

// ---------------------------------------------------------------------------
// A trivial "touch" step — StepHost resolves it by id, and its onComplete is
// driven by a plain button so the test controls exactly when a "revision"
// happens, without pulling in the real TouchGallery's OSK/compile stack.
// ---------------------------------------------------------------------------

function TrivialTouchStep({ onComplete }: EditorStepProps): React.ReactElement {
  return (
    <button
      type="button"
      data-testid="touch-confirm"
      onClick={() => onComplete({ assignments: [], baseIr: null, baseVfs: null })}
    >
      confirm
    </button>
  );
}

// StepHost resolves the manifest step by id, and `steps/advance.ts` imports
// the SAME module path for its own step-order logic (the identical pattern
// StepHost.test.tsx already relies on) — mocking it here mocks both call
// sites, and `jumpToLocation`'s internal resolution (it also reads
// `../steps/manifest.ts`) sees this same one-step manifest too, which is
// exactly what lets `resolveLocation` find "touch" below.
vi.mock("../steps/manifest.ts", () => ({
  manifest: [
    {
      kind: "editor-step",
      id: "touch",
      title: "Touch",
      inputs: [],
      writes: [],
      component: TrivialTouchStep,
    },
  ],
}));

import { StepHost } from "../components/StepHost.tsx";
import { jumpToLocation, clearPendingJump } from "../lib/jumpToLocation.ts";

// ---------------------------------------------------------------------------
// Staleness fixture for `bindManifest` (workingCopyStore's OWN write/inputs
// graph — a different "manifest" input from the one mocked above, which only
// feeds StepHost/advance's step list).
//
// "touch" has NO input-graph edge onto "mechanisms" — reducer.ts's own
// TOUCH_STEP_ID comment says so explicitly: "the production manifest gives
// 'touch' inputs: [] and a mechanisms→touch stale-propagation edge does not
// exist". Production marks "touch" stale DIRECTLY (MechanismGallery calls
// `markStale(TOUCH_STEP_ID)` itself after an unlock-and-reedit), not via
// closure propagation from "mechanisms". So the fixture mirrors that: "touch"
// is marked stale as its OWN root, and `clearStale("touch")` — the real
// staleness side effect `applyStepCompletion`'s TOUCH_STEP_ID case fires —
// clears it by removing that same root, exactly as an ordinary re-completion
// of "touch" does today.
// ---------------------------------------------------------------------------

function makeEditorStep(id: string): EditorStep {
  return {
    kind: "editor-step",
    id,
    title: id,
    spine: true,
    component: (() => null) as EditorStep["component"],
    inputs: [],
    writes: [],
  };
}

const STALENESS_MANIFEST: readonly Step[] = [makeEditorStep("touch")];

function seedProject(): void {
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, {
    vfs: createVirtualFS([{ path: "source/basic_kbdus.kmn", content: "c\n", isBinary: false }]),
    ir: makeTestIR([]),
  });
}

/** A minimal, hand-rolled `recordDecision` — appends a synthetic editor-action
 * entry for "touch" directly, via the SAME `decisionLogStore.append` the real
 * recorder ultimately calls. This is deliberately NOT `recordEditorStep.ts`
 * (which needs a real IR/assignment graph to compute its counts) — what this
 * test proves is StepHost's generic wiring and the log's own supersession,
 * neither of which depends on how the summary's counts were derived. */
function makeRecordDecision(touchKeysAffected: number): ReducerDeps["recordDecision"] {
  return ({ stepId }) => {
    if (stepId !== "touch") return;
    useDecisionLogStore.getState().append({
      stepId,
      payload: {
        kind: "editor-action",
        actionType: "touch_edit",
        summary: { touchKeysAffected, sample: [], sampleTruncated: false },
      },
      provenance: { agency: "hand-set" },
    });
  };
}

function makeReducerDeps(touchKeysAffected: number): ReducerDeps {
  return {
    lockDesktop: vi.fn(),
    setTouchLayoutJson: vi.fn(),
    // The REAL store action — this is the staleness side effect under test,
    // not a spy standing in for it.
    clearStale: (stepId) => useWorkingCopyStore.getState().clearStale(stepId),
    instantiateFromBase: vi.fn(),
    instantiateFromExisting: vi.fn(),
    buildTouchLayoutJson: vi.fn(() => ({ json: null, warnings: [] })),
    resolveBaseTouchJson: vi.fn(() => undefined),
    instantiateFromBaseIfConfirmed: vi.fn(() => true),
    recordDecision: makeRecordDecision(touchKeysAffected),
  };
}

/** Common ground both scenarios start from: a project, a stale "touch" (as
 * if a Mechanisms edit re-opened it for review), and one already-recorded
 * "touch" decision — the entry the revision below is expected to supersede. */
function resetToCommonGround(): string | null {
  useSurveySessionStore.getState().reset();
  useWorkingCopyStore.getState().reset();
  useDecisionLogStore.getState().reset();
  resetDecisionEntryIds();
  clearPendingJump();
  bindManifest(STALENESS_MANIFEST);
  seedProject();
  // As if an earlier Mechanisms edit (after unlock) re-opened Touch for
  // review — MechanismGallery's own direct `markStale(TOUCH_STEP_ID)` call,
  // reproduced here without needing the gallery itself.
  useWorkingCopyStore.getState().markStale("touch");
  expect(useWorkingCopyStore.getState().staleSteps.has("touch")).toBe(true);
  return useDecisionLogStore.getState().append({
    stepId: "touch",
    payload: {
      kind: "editor-action",
      actionType: "touch_edit",
      summary: { touchKeysAffected: 5, sample: [], sampleTruncated: false },
    },
    provenance: { agency: "hand-set" },
  });
}

interface ScenarioResult {
  staleAfter: ReadonlySet<string>;
  entriesAfter: number;
  newEntrySupersedes: string | null;
}

/** Drive the SAME revision (touchKeysAffected 5 -> 8) either by an ordinary
 * walk onto "touch", or by a decision-trail deep link onto it. */
async function runRevision(viaDeepLink: boolean): Promise<ScenarioResult> {
  const firstEntryId = resetToCommonGround();

  if (viaDeepLink) {
    // Walk through "touch" once (so it is REACHED — jumpToLocation refuses
    // to skip a step the author never actually visited) and past it, then
    // activate what a trail entry's jump control would.
    useSurveySessionStore.getState().advance("touch");
    useSurveySessionStore.getState().advance("help");
    jumpToLocation({ route: "survey", step: "touch" }, { returnTo: { route: "trail" } });
  } else {
    // Ordinary walk: "touch" is simply where the author is.
    useSurveySessionStore.getState().advance("touch");
  }
  expect(useSurveySessionStore.getState().activeStepId).toBe("touch");

  await act(async () => {
    render(
      <StepHost reducerDeps={makeReducerDeps(8)} onStartOver={() => {}} />,
    );
  });
  fireEvent.click((await import("@testing-library/react")).screen.getByTestId("touch-confirm"));
  cleanup();

  const record = useDecisionLogStore.getState().read();
  const touchEntries = record.entries.filter((e) => e.stepId === "touch");
  const newEntry = touchEntries.find((e) => e.entryId !== firstEntryId);

  return {
    staleAfter: new Set(useWorkingCopyStore.getState().staleSteps),
    entriesAfter: touchEntries.length,
    newEntrySupersedes: newEntry?.supersedes ?? null,
  };
}

afterEach(() => {
  cleanup();
});

describe("deep link -> revise -> supersede -> staleness (SC-008)", () => {
  it("supersedes the existing entry exactly once, and clears the same staleness, via an ordinary walk", async () => {
    const result = await runRevision(false);
    expect(result.entriesAfter).toBe(2);
    expect(result.newEntrySupersedes).not.toBeNull();
    expect(result.staleAfter.has("touch")).toBe(false);
  });

  it("supersedes the existing entry exactly once, and clears the same staleness, via a deep link", async () => {
    const result = await runRevision(true);
    expect(result.entriesAfter).toBe(2);
    expect(result.newEntrySupersedes).not.toBeNull();
    expect(result.staleAfter.has("touch")).toBe(false);
  });

  it("the deep-link path and the ordinary-walk path leave IDENTICAL staleness and supersession outcomes", async () => {
    const ordinary = await runRevision(false);
    const deepLinked = await runRevision(true);

    expect(deepLinked.entriesAfter).toBe(ordinary.entriesAfter);
    expect(deepLinked.staleAfter).toEqual(ordinary.staleAfter);
    // Both supersede SOME entry (not a fresh, unlinked append) — the actual
    // entryId differs between the two independent runs (resetDecisionEntryIds
    // starts the counter over each time, and `resetToCommonGround` produces a
    // fresh `firstEntryId` per run), so equality is asserted on presence, not
    // on the id string itself.
    expect(ordinary.newEntrySupersedes).not.toBeNull();
    expect(deepLinked.newEntrySupersedes).not.toBeNull();
  });

  it("a deep-linked revision returns the author to the trail, not onward through the walk", async () => {
    resetToCommonGround();
    useSurveySessionStore.getState().advance("touch");
    useSurveySessionStore.getState().advance("help");
    jumpToLocation({ route: "survey", step: "touch" }, { returnTo: { route: "trail" } });
    window.location.hash = "#survey";

    const { screen } = await import("@testing-library/react");
    await act(async () => {
      render(<StepHost reducerDeps={makeReducerDeps(8)} onStartOver={() => {}} />);
    });
    fireEvent.click(screen.getByTestId("touch-confirm"));

    // StepHost's revise-and-return (T043) calls jumpToLocation({route:"trail"})
    // rather than following the ordinary "next step" outcome — observable
    // here as the address bar landing on the trail, not on whatever "touch"
    // would ordinarily advance to.
    expect(window.location.hash).toBe("#trail");
  });
});
