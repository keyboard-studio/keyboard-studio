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
  keptAttestedStacks,
  marksSeriesAnswers,
  marksStationDefaults,
  resolveOutputStation,
  resolveToleranceDecision,
  seriesResult,
  startOfLineSeed,
  visibleMarksStations,
} from "./marksSeriesValue.ts";
import { ATTACHMENT_START_OF_LINE } from "./marksViews.ts";

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
    });
    expect(none).toEqual([]);
    const all = visibleMarksStations({
      proposals: d.state.proposals,
      classes: d.classes,
      posture: [],
      stackingEvidence: true,
      showToleranceStation: true,
    });
    expect(all.slice(-2)).toEqual(["marks_stacking", "marks_context_tolerance"]);
  });
});

describe("assembleMarksSeries", () => {
  function assemble(over: { tol?: MarksContextToleranceDecision | null } = {}) {
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
    expect(out.completion).toMatchObject({ migrationNeeded: false });
    for (const a of out.answers) expect(out.value.answers[a.questionId]).toEqual(a.value);
    expect(out.value.contextTolerance).toBeNull();
    expect(out.value).not.toHaveProperty("guardSpecification");
  });

  it("answers every visible station under the pinned question ids", () => {
    const { out } = assemble();
    const ids = out.answers.map((a) => a.questionId);
    expect(ids).toContain(`marks.marks_attachment.${ACUTE}`);
    expect(ids).toContain(`marks.marks_attachment.${GRAVE}`);
    expect(ids).toContain("marks.marks_output_form.form");
    expect(ids).toContain("marks.marks_output_form.backspace");
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
    const v = buildMarksTreatmentValue(answers, null, null);
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

describe("start-of-line default", () => {
  const legacy = (behaviour: "emit" | "swallow", confirmed: boolean) =>
    ({ ...EMPTY_MARKS_VALUE, guardSpecification: { behaviour, confirmed } }) as typeof EMPTY_MARKS_VALUE;

  it("opens unticked, and only a confirmed legacy emit record or the import seed ticks it", () => {
    expect(startOfLineSeed(EMPTY_MARKS_VALUE, false)).toEqual({ migrated: false, defaultTicked: false });
    expect(startOfLineSeed(EMPTY_MARKS_VALUE, true)).toEqual({ migrated: false, defaultTicked: true });
    expect(startOfLineSeed(legacy("emit", true), false)).toEqual({ migrated: true, defaultTicked: true });
    expect(startOfLineSeed(legacy("emit", false), false)).toEqual({ migrated: false, defaultTicked: false });
    expect(startOfLineSeed(legacy("swallow", true), false)).toEqual({ migrated: false, defaultTicked: false });
  });

  it("marksStationDefaults seeds every attachment row's start-of-line box from it", () => {
    const off = defaults();
    const on = marksStationDefaults({ alphabet: ALPHABET, startIr: null, bcp47: "und", startOfLineDefault: true });
    for (const mark of [ACUTE, GRAVE]) {
      expect(off.state.attachmentChecked[mark]?.[ATTACHMENT_START_OF_LINE]).toBe(false);
      expect(on.state.attachmentChecked[mark]?.[ATTACHMENT_START_OF_LINE]).toBe(true);
    }
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
