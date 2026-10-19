// marksHandoff.integration — the marks-series handoff at the integrated
// flow level (issue #2293, scope addition 2026-10-19).
//
// Matthew's report: after pasting the prompted text sample, the
// mechanisms gallery asked him to place BOTH the composed forms and the
// bare marks. Two seams could produce that even with a correct
// per-gallery filter:
//   (a) the prompted pass (#1784 MarksTextSamplePrompt, deferred
//       completion) landing a DIFFERENT alphabet on the session than the
//       voluntary pass (sample pasted in the build list before Done);
//   (b) session.marksWorklist absent or lagging at gallery entry in the
//       live decision-store flow (spec 090 T023 documented the session
//       copy lagging the marks decision value) — a worklist-gated filter
//       never fires without it.
//
// This suite drives BOTH sample paths through the real pieces, in the
// real order the live flow composes them:
//   characters draft (real inventory ops + real engine harvestFromText
//   + real draftConfirmedAlphabet) → recordPhase (the store action
//   StepHost calls with CharactersStep's emitted result) → the real
//   MarksStepHost/MarksSeriesStep walked with default answers →
//   completion wired exactly as StepHost.handleComplete wires a
//   SurveyPhaseResult for the session slices: recordPhase(result)
//   followed by the spec-093 rebuild (rebuildWorkingCopyFromStores, the
//   function StudioShell injects) over the decision ids the completion
//   recorded. StepHost's other two calls (recordAnswersAsDecisions /
//   applyDecisionEffects) write decision records and IR patches — the
//   marks renderer already records its decision value through the host
//   during the walk (T023), and the rebuild replays that record's apply;
//   neither touches the session slices asserted here.
//
// Assertions, per path and across paths:
//   - the prompted path's pre-sample alphabet really is the deferral
//     case (marksLackingPairingEvidence covers all 3 marks);
//   - both paths land IDENTICAL session alphabets (22 attested stacks),
//     confirmed inventories, marks worklists, and placement sets;
//   - session.marksWorklist deep-equals the completion's worklist AFTER
//     the rebuild installed its derived working copy (the lag check);
//   - the placement set derived from the session (lib/placementInventory)
//     never walks BOTH forms: it is one treatment's units plus the
//     non-alphabet complement, never marks + composed forms together.

import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup, act, fireEvent } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import {
  createVirtualFS,
  makeConfirmedAlphabet,
  nonAlphabetConfirmedInventory,
  type ConfirmedAlphabet,
  type PlacementWorklist,
  type StartKeyboard,
  type SurveyPhaseResult,
} from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import {
  createCharacterDiscoveryService,
  marksLackingPairingEvidence,
  type CldrLoader,
} from "@keyboard-studio/engine";
import { MarksStepHost } from "./MarksStepHost.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { useSurveyAnswerStore } from "../../stores/surveyAnswerStore.ts";
import {
  getCharacterInventoryValue,
  inventoryOps,
  resetInventoryDraft,
} from "../useInventoryDraft.ts";
import { draftConfirmedAlphabet } from "../phaseBDraftOps.ts";
import { nfcDedup } from "../charNormUtils.ts";
import {
  rebuildWorkingCopyFromStores,
  resetRebuildTrail,
} from "../../decisions/rebuildWorkingCopy.ts";
import { questionRegistry } from "../questions/registry.ts";
import { derivePlacementInventory } from "../../lib/placementInventory.ts";
import {
  BAFUT_BASES,
  BAFUT_COMPOSED,
  BAFUT_MARKS,
  BAFUT_STACKS,
} from "../../test/bafutFixture.ts";

// harvestFromText reads neither the loader nor the completer (the
// MarksSeriesStep.textSample.test precedent).
const service = createCharacterDiscoveryService(
  {} as CldrLoader,
  async () => {
    throw new Error("not used");
  },
);

/** A fully-NFD Bafut-shaped passage: every attested stack, space-joined. */
const SAMPLE = BAFUT_STACKS.map(([base, mark]) => `${base}${mark}`).join(" ");

interface PathOutcome {
  alphabet: ConfirmedAlphabet;
  confirmedInventory: string[];
  marksWorklist: PlacementWorklist | undefined;
  placement: string[];
  completionWorklist: PlacementWorklist | undefined;
}

function resetAllStores(): void {
  cleanup();
  useWorkingCopyStore.getState().reset();
  useDecisionStore.getState().reset();
  useSurveySessionStore.getState().reset();
  useSurveyAnswerStore.setState({ steps: {}, recordedScreenOf: {} });
  resetInventoryDraft();
  resetRebuildTrail();
}

async function runPath(path: "voluntary" | "prompted"): Promise<PathOutcome> {
  resetAllStores();
  useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, {
    vfs: createVirtualFS([]),
    ir: makeTestIR([]),
  });

  // --- Characters: the build list starts from the CLDR exemplar offer
  // (bases + BARE marks — the Bafut repro's starting point).
  const ops = inventoryOps("characters");
  for (const base of BAFUT_BASES) ops.addProposed(base, "cldr");
  for (const mark of BAFUT_MARKS) ops.addProposed(mark, "cldr");

  // The text sample's confirm path (TextSampleAffordance.handleConfirm →
  // seedFromProposal, per-character "text" attribution — simulated at
  // the op level exactly as MarksSeriesStep.textSample.test does).
  const harvested = await service.harvestFromText(SAMPLE, {} as StartKeyboard);
  const addSample = (): void => {
    for (const { char } of harvested) ops.addProposed(char, "text");
  };

  if (path === "voluntary") {
    // Sample pasted in the build list, before Done.
    addSample();
  } else {
    // Prompted: Done fires first with the bare-mark alphabet — the
    // deferral condition CharactersStep checks — and only then does the
    // prompt's harvest land in the same draft.
    const bare = draftConfirmedAlphabet(getCharacterInventoryValue());
    expect(new Set(marksLackingPairingEvidence(bare))).toEqual(new Set(BAFUT_MARKS));
    addSample();
  }

  // CharactersStep.completeCharacters: re-read the draft at fire time,
  // attach the alphabet; StepHost lands it via recordPhase.
  const alphabet = draftConfirmedAlphabet(getCharacterInventoryValue());
  const chars = getCharacterInventoryValue().chars;
  useWorkingCopyStore.getState().recordPhase(
    { phase: "B", answers: [], confirmedInventory: nfcDedup(chars, []), alphabet },
    { stepId: "characters" },
  );

  // --- Marks: the real hosted series, walked with default answers.
  let completion: SurveyPhaseResult | null = null;
  const onComplete = (result: unknown): void => {
    const r = result as SurveyPhaseResult;
    // StepHost.handleComplete's session-facing sequence, in order.
    useWorkingCopyStore.getState().recordPhase(r, { stepId: "marks" });
    const changed: string[] = [];
    for (const answer of r.answers) {
      const mod = questionRegistry[answer.questionId];
      if (mod?.provides !== undefined) changed.push(...mod.provides);
    }
    if (changed.length > 0) rebuildWorkingCopyFromStores(changed);
    completion = r;
  };
  act(() => {
    render(<MarksStepHost onComplete={onComplete} />, { withStepNav: true });
  });
  for (let i = 0; i < 12 && completion === null; i++) {
    if (screen.queryByTestId("guard-station") !== null) {
      fireEvent.click(screen.getByTestId("guard-option-emit"));
    }
    const next = screen.queryByTestId("marks-continue");
    if (next === null) break;
    fireEvent.click(next);
  }
  expect(completion).not.toBeNull();

  const session = useWorkingCopyStore.getState().session;
  return {
    alphabet: session.alphabet ?? makeConfirmedAlphabet({ bases: [], marks: [], attestedStacks: [] }),
    confirmedInventory: session.confirmedInventory,
    marksWorklist: session.marksWorklist,
    placement: derivePlacementInventory(
      session.confirmedInventory,
      session.alphabet,
      session.marksWorklist,
    ),
    completionWorklist: (completion as SurveyPhaseResult | null)?.marksWorklist,
  };
}

afterEach(() => {
  cleanup();
});

describe("marks handoff — voluntary vs prompted text sample (issue #2293)", () => {
  it("both paths land identical alphabets, worklists, and placement sets on the session", async () => {
    const voluntary = await runPath("voluntary");
    const prompted = await runPath("prompted");

    // The enriched alphabet reached the session in BOTH paths: all 22
    // attested stacks from the sample. A stale bare alphabet on the
    // prompted path would show 0 stacks and a different series.
    for (const outcome of [voluntary, prompted]) {
      expect(outcome.alphabet.bases).toEqual(BAFUT_BASES);
      expect(outcome.alphabet.marks).toEqual(BAFUT_MARKS);
      expect(outcome.alphabet.attestedStacks).toHaveLength(BAFUT_STACKS.length);
    }
    expect(prompted.alphabet).toEqual(voluntary.alphabet);
    expect(prompted.confirmedInventory).toEqual(voluntary.confirmedInventory);

    // The lag check (spec 090 T023): after recordPhase + the spec-093
    // rebuild, the session copy still carries the completion's worklist
    // whole — in both paths.
    for (const outcome of [voluntary, prompted]) {
      expect(outcome.completionWorklist).toBeDefined();
      expect(outcome.marksWorklist).toEqual(outcome.completionWorklist);
      const worklistMarks = (outcome.marksWorklist?.markUnits ?? []).map((u) => u.mark);
      expect(new Set(worklistMarks)).toEqual(new Set(BAFUT_MARKS));
    }
    expect(prompted.marksWorklist).toEqual(voluntary.marksWorklist);

    // The placement set the galleries derive from the session: identical
    // across paths, and never both forms at once (Matthew's repro).
    expect(prompted.placement).toEqual(voluntary.placement);
    const placement = new Set(voluntary.placement);
    // The series' own proposals for a fully-attested sample record the
    // own-key/postfix treatment (the author's smoke-test choice): the
    // walk is the bases + the 3 marks, and NONE of the 22 composed
    // forms — the exact inverse of the repro, where both forms walked.
    expect(BAFUT_MARKS.every((m) => placement.has(m))).toBe(true);
    expect(BAFUT_COMPOSED.some((c) => placement.has(c.normalize("NFC")))).toBe(false);

    // AC1 identity: placement = worklist units + non-alphabet complement.
    const session = useWorkingCopyStore.getState().session;
    const expected = new Set<string>([
      ...(voluntary.marksWorklist?.ownLetterUnits ?? []),
      ...(voluntary.marksWorklist?.markUnits ?? []).map((u) => u.mark),
      ...nonAlphabetConfirmedInventory(session.confirmedInventory, session.alphabet),
    ]);
    expect(placement).toEqual(expected);
  }, 120_000);
});
