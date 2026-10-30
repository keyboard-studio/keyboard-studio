// marksSeriesValue — the lifted marks-series station defaults and assembly
// (spec 107 FR-040). MarksSeriesStep's own tests pin the component's use of
// these; this file pins the functions directly, so a headless caller can rely
// on them without React.

import { describe, it, expect } from "vitest";
import {
  makeConfirmedAlphabet,
  makeEmptyPlacementWorklist,
  stackKey,
  type MarksContextToleranceDecision,
} from "@keyboard-studio/contracts";
import type { SavedAnswer } from "../../steps/answerTypes.ts";
import { EMPTY_MARKS_VALUE } from "./marksValue.ts";
import {
  assembleMarksSeries,
  buildMarksTreatmentValue,
  computeMarksGate,
  contextToleranceAnswers,
  guardAnswerFor,
  guardChoiceOf,
  guardRecordForCommit,
  guardSeedFor,
  keptAttestedStacks,
  marksSeriesAnswers,
  marksStationDefaults,
  resolveOutputStation,
  resolveToleranceDecision,
  seriesResult,
  visibleMarksStations,
} from "./marksSeriesValue.ts";
import { DEFAULT_GUARD_BEHAVIOUR, makeGuardSpecification } from "./guardSpecification.ts";

const ACUTE = "́";
const GRAVE = "̀";

/** Two letters, two marks, each pair attested once. */
const ALPHABET = makeConfirmedAlphabet({
  bases: ["a", "e"],
  marks: [ACUTE, GRAVE],
  attestedStacks: [
    { base: "a", marks: [ACUTE] },
    { base: "e", marks: [GRAVE] },
  ],
});

function defaults(overrides?: Parameters<typeof marksStationDefaults>[0]["overrides"]) {
  return marksStationDefaults({
    alphabet: ALPHABET,
    startIr: null,
    bcp47: "und",
    ...(overrides !== undefined ? { overrides } : {}),
  });
}

describe("computeMarksGate", () => {
  it("skips when the alphabet has no marks", () => {
    expect(computeMarksGate(makeConfirmedAlphabet({ bases: ["a"] })).skip).toBe(true);
    expect(computeMarksGate(undefined).skip).toBe(true);
  });

  it("opens when marks exist", () => {
    expect(computeMarksGate(ALPHABET).skip).toBe(false);
  });
});

describe("marksStationDefaults", () => {
  it("yields no stations on a skipped gate", () => {
    const d = marksStationDefaults({
      alphabet: makeConfirmedAlphabet({ bases: ["a"] }),
      startIr: null,
      bcp47: undefined,
    });
    expect(d.gate.skip).toBe(true);
    expect(d.visibleStations).toEqual([]);
  });

  it("opens with the attachment station and ticks exactly the attested pairs", () => {
    const d = defaults();
    expect(d.visibleStations[0]).toBe("marks_attachment");
    const checked = d.state.attachmentChecked;
    expect(checked[ACUTE]?.["a"]).toBe(true);
    expect(checked[GRAVE]?.["e"]).toBe(true);
    expect(checked[ACUTE]?.["e"]).not.toBe(true);
  });

  it("defaults the input order to postfix and the form/backspace to the proposals", () => {
    const d = defaults();
    expect(d.state.inputOrder).toBe("postfix");
    const out = resolveOutputStation({ posture: [], inputOrder: "postfix", saved: {} });
    expect(out.outputForm).toBe("base-plus-mark");
    expect(d.state.outputForm).toBe(
      resolveOutputStation({ posture: [], inputOrder: d.state.inputOrder, saved: {} }).outputForm,
    );
  });

  it("follows an inputOrder override into the output-form proposal", () => {
    const d = defaults({ inputOrder: "prefix" });
    expect(d.state.inputOrder).toBe("prefix");
    expect(d.treatment.inputOrder).toBe("prefix");
    expect(d.state.outputForm).toBe("ready-made");
  });

  it("follows an outputForm override into the backspace default", () => {
    const base = defaults({ outputForm: "base-plus-mark" });
    expect(base.state.outputForm).toBe("base-plus-mark");
    expect(base.state.backspace).toBe("peel");
    const ready = defaults({ outputForm: "ready-made" });
    expect(ready.state.outputForm).toBe("ready-made");
    expect(ready.state.backspace).toBe("whole-stack");
  });

  it("applies a backspace override over the form's default", () => {
    const d = defaults({ outputForm: "base-plus-mark", backspace: "whole-stack" });
    expect(d.state.backspace).toBe("whole-stack");
  });
});

describe("resolveOutputStation", () => {
  const key = resolveOutputStation({ posture: [], inputOrder: "postfix", saved: {} }).outputFormKey;
  const saved: SavedAnswer = {
    value: "ready-made",
    answerType: "select",
    origin: "overturned",
    stage: "confirmed",
    evidenceKey: key,
    screenId: "marks_output_form",
    savedAt: 0,
  };

  it("keeps a saved composition answer whose evidence key still matches", () => {
    const out = resolveOutputStation({
      posture: [],
      inputOrder: "postfix",
      saved: { "marks_output_form.form": saved },
    });
    expect(out.outputForm).toBe("ready-made");
    expect(out.backspace).toBe("whole-stack");
  });
});

describe("visibleMarksStations", () => {
  it("lists a station only when it has something to decide", () => {
    const d = defaults();
    const none = visibleMarksStations({
      proposals: [],
      classes: [],
      posture: [],
      stackingEvidence: false,
      showToleranceStation: false,
      hasOwnKeyMark: false,
    });
    expect(none).toEqual([]);
    const all = visibleMarksStations({
      proposals: d.state.proposals,
      classes: d.classes,
      posture: [],
      stackingEvidence: true,
      showToleranceStation: true,
      hasOwnKeyMark: true,
    });
    expect(all.slice(-3)).toEqual(["marks_stacking", "marks_context_tolerance", "marks_guard"]);
  });
});

describe("assembleMarksSeries", () => {
  function assemble(over: { guard?: ReturnType<typeof guardRecordForCommit>; tol?: MarksContextToleranceDecision | null } = {}) {
    const d = defaults();
    return {
      d,
      out: assembleMarksSeries({
        alphabet: d.gate.alphabet,
        classes: d.classes,
        isCasedBase: d.isCasedBase,
        bcp47: "und",
        expandedAttachments: d.expandedAttachments,
        treatment: d.treatment,
        state: d.state,
        visibleStations: d.visibleStations,
        workingIr: null,
        guard: over.guard ?? null,
        effectiveTolerance: over.tol ?? null,
      }),
    };
  }

  it("builds the phase result the step reports on completion", () => {
    const { d, out } = assemble();
    expect(out.result.phase).toBe("C");
    expect(out.result.marksOutputForm).toBe(d.state.outputForm);
    expect(out.result.marksBackspace).toBe(d.state.backspace);
    expect(out.result.marksWorklist).toEqual(out.completion.worklist);
    expect(out.result.answers).toEqual(out.answers);
    expect(out.result.computedAxes?.markInputOrder).toBeDefined();
    expect(out.result).not.toHaveProperty("marksContextTolerance");
  });

  it("records the same answers and completion in the decision value", () => {
    const { out } = assemble();
    expect(out.value.completion).toEqual(out.completion);
    expect(out.completion).toMatchObject({
      migrationNeeded: false,
      guardReevaluation: [],
    });
    for (const a of out.answers) expect(out.value.answers[a.questionId]).toEqual(a.value);
    expect(out.value.contextTolerance).toBeNull();
    expect(out.value.guardSpecification).toBeNull();
  });

  it("answers every visible station under the pinned question ids", () => {
    const { out } = assemble();
    const ids = out.answers.map((a) => a.questionId);
    expect(ids).toContain(`marks.marks_attachment.${ACUTE}`);
    expect(ids).toContain(`marks.marks_attachment.${GRAVE}`);
    expect(ids).toContain("marks.marks_output_form.form");
    expect(ids).toContain("marks.marks_output_form.backspace");
  });

  it("carries the guard specification into the value", () => {
    const guard = makeGuardSpecification({
      behaviour: "emit",
      origin: "asked",
      confirmed: true,
      supersedesRecord: null,
    });
    const { out } = assemble({ guard });
    expect(out.value.guardSpecification).toBe(guard);
  });

  it("reports a tolerance decision on the result and records it in the value", () => {
    const tol: MarksContextToleranceDecision = {
      decision: "partial",
      acceptedSiteIds: ["s1"],
      proposedSiteIds: ["s1", "s2"],
      fingerprint: "fp",
    };
    const d = defaults();
    const out = assembleMarksSeries({
      alphabet: d.gate.alphabet,
      classes: d.classes,
      isCasedBase: d.isCasedBase,
      bcp47: "und",
      expandedAttachments: d.expandedAttachments,
      treatment: d.treatment,
      state: d.state,
      visibleStations: d.visibleStations,
      workingIr: null,
      guard: null,
      reportedTolerance: tol,
      effectiveTolerance: tol,
    });
    expect(out.result.marksContextTolerance).toBe(tol);
    expect(out.result.answers.map((a) => a.questionId)).toEqual(
      expect.arrayContaining(contextToleranceAnswers(tol).map((a) => a.questionId)),
    );
    expect(out.value.contextTolerance).toBe(tol);
  });
});

describe("seriesResult / buildMarksTreatmentValue", () => {
  it("reports the empty worklist and nothing else on the skip path", () => {
    expect(seriesResult()).toEqual({
      phase: "C",
      answers: [],
      marksWorklist: makeEmptyPlacementWorklist(),
    });
  });

  it("an answer record carries no completion", () => {
    const d = defaults();
    const answers = marksSeriesAnswers(d.visibleStations, d.state);
    const v = buildMarksTreatmentValue(answers, null, null, null);
    expect(v.completion).toBeNull();
    expect(v.answers).not.toEqual(EMPTY_MARKS_VALUE.answers);
  });
});

describe("keptAttestedStacks", () => {
  const stacked = makeConfirmedAlphabet({
    bases: ["a"],
    marks: [ACUTE, GRAVE],
    attestedStacks: [
      { base: "a", marks: [ACUTE] },
      { base: "a", marks: [ACUTE, GRAVE] },
    ],
  });

  it("always keeps single-mark stacks and a multi-mark stack only while allowed and ticked", () => {
    const multi = stacked.attestedStacks[1]!;
    const confirmed = { [stackKey(multi)]: true };
    expect(keptAttestedStacks(stacked, false, confirmed)).toHaveLength(1);
    expect(keptAttestedStacks(stacked, true, {})).toHaveLength(1);
    expect(keptAttestedStacks(stacked, true, confirmed)).toHaveLength(2);
  });
});

describe("guard helpers", () => {
  it("records the default at the guard station's own Continue when nothing else is known", () => {
    const at = guardRecordForCommit({
      station: "marks_guard",
      guardAnswer: null,
      priorGuard: undefined,
      guardSeed: undefined,
    });
    expect(at?.behaviour).toBe(DEFAULT_GUARD_BEHAVIOUR);
    expect(at?.confirmed).toBe(true);
    expect(
      guardRecordForCommit({
        station: "marks_treatment",
        guardAnswer: null,
        priorGuard: undefined,
        guardSeed: undefined,
      }),
    ).toBeNull();
  });

  it("confirms a seed only at the guard station, and rides it provisionally before", () => {
    const seed = guardSeedFor("emit");
    expect(seed?.confirmed).toBe(false);
    const mid = guardRecordForCommit({ station: "marks_treatment", guardAnswer: null, priorGuard: undefined, guardSeed: seed });
    expect(mid).toBe(seed);
    const last = guardRecordForCommit({ station: "marks_guard", guardAnswer: null, priorGuard: undefined, guardSeed: seed });
    expect(last?.confirmed).toBe(true);
    expect(last?.behaviour).toBe("emit");
  });

  it("lets the author's pick win and picks the displayed behaviour in precedence order", () => {
    const pick = guardAnswerFor({ behaviour: "emit", priorGuard: undefined, guardSeed: undefined });
    expect(pick.origin).toBe("asked");
    expect(
      guardRecordForCommit({ station: "marks_guard", guardAnswer: pick, priorGuard: undefined, guardSeed: undefined }),
    ).toBe(pick);
    expect(guardChoiceOf({ guardAnswer: pick, priorGuard: undefined, seedBehaviour: "swallow" })).toBe("emit");
    expect(guardChoiceOf({ guardAnswer: null, priorGuard: undefined, seedBehaviour: "emit" })).toBe("emit");
    expect(guardChoiceOf({ guardAnswer: null, priorGuard: undefined, seedBehaviour: undefined })).toBe(
      DEFAULT_GUARD_BEHAVIOUR,
    );
  });
});

describe("resolveToleranceDecision", () => {
  const prior: MarksContextToleranceDecision = {
    decision: "accept",
    acceptedSiteIds: ["s1"],
    proposedSiteIds: ["s1"],
    fingerprint: "fp",
    appliedFingerprint: "fp",
  };

  it("keeps the prior (and its apply marker) when the same outcome is re-confirmed", () => {
    const taken = { decision: "accept" as const, acceptedSiteIds: ["s1"], proposedSiteIds: ["s1"], fingerprint: "fp" };
    expect(resolveToleranceDecision({ taken, priorTolerance: prior, toleranceFingerprint: "fp" })).toBe(prior);
  });

  it("a decision taken now wins over a prior one", () => {
    const taken = { decision: "decline" as const, acceptedSiteIds: [], proposedSiteIds: ["s1"], fingerprint: "fp" };
    expect(resolveToleranceDecision({ taken, priorTolerance: prior, toleranceFingerprint: "fp" })).toBe(taken);
  });

  it("carries a prior forward only while its fingerprint still matches the rules", () => {
    expect(resolveToleranceDecision({ taken: null, priorTolerance: prior, toleranceFingerprint: "fp" })).toBe(prior);
    expect(resolveToleranceDecision({ taken: null, priorTolerance: prior, toleranceFingerprint: "other" })).toBeUndefined();
    expect(resolveToleranceDecision({ taken: null, priorTolerance: undefined, toleranceFingerprint: "fp" })).toBeUndefined();
  });
});
