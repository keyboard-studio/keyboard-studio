// marksTreatment module tests (spec 090 T023): the module contract, the
// apply's guard behaviour from the completion payload (ported from the
// retired reducer MARKS-handler tests in steps/reducer.test.ts), and the
// MarksStepHost R10 migration-flag mirror. The hosted series flow end to
// end is covered by survey/marks/MarksSeriesStep.test.tsx.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { irPath, type KeyboardIR } from "@keyboard-studio/contracts";
import { render } from "../../../test/renderWithI18n.tsx";
import marksTreatment from "./marksTreatment.ts";
import { MarksSeriesStep } from "../../marks/MarksSeriesStep.tsx";
import { MarksStepHost } from "../../marks/MarksStepHost.tsx";
import {
  recordMarksTreatmentValue,
  type MarksCompletion,
  type MarksTreatmentValue,
} from "../../marks/marksValue.ts";
import { runApplyDeterministically } from "../../../decisions/applyDeterminism.ts";
import type { ApplyContext } from "../../types.ts";
import { applyMutatePatch } from "../../../steps/mutateApply.ts";
import { useDecisionStore } from "../../../stores/decisionStore.ts";
import { useSurveySessionStore } from "../../../stores/surveySessionStore.ts";

const ACUTE = "́";

function irWithRule(output: string): KeyboardIR {
  return makeTestIR([
    {
      nodeId: "g-main",
      name: "main",
      usingKeys: true,
      rules: [
        {
          nodeId: "r1",
          context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
          output: [{ kind: "char", value: output }],
        },
      ],
    },
  ]);
}

function makeContext(ir: KeyboardIR | null): ApplyContext {
  return {
    ir,
    writes: marksTreatment.writes,
    decisions: {},
    currentHistoryEntryState: null,
  };
}

function completedValue(over: Partial<MarksCompletion> = {}): MarksTreatmentValue {
  return {
    answers: {},
    contextTolerance: null,
    completion: {
      worklist: {
        ownLetterUnits: ["a", "k"],
        markUnits: [{ mark: ACUTE, inputOrder: "postfix" }],
        blockedCombinations: [{ base: "k", mark: ACUTE }],
      },
      outputForm: "base-plus-mark",
      migrationNeeded: false,
      ...over,
    },
  };
}

function fingerprintStores(): string {
  return JSON.stringify({ decisions: useDecisionStore.getState().decisions });
}

beforeEach(() => {
  useDecisionStore.getState().reset();
  useSurveySessionStore.getState().reset();
});
afterEach(cleanup);

describe("marksTreatment module contract", () => {
  it("provides marks-treatment, requires character-inventory, writes groups+stores", () => {
    expect(marksTreatment.provides).toEqual(["marks-treatment"]);
    expect(marksTreatment.requires).toEqual(["character-inventory"]);
    expect(marksTreatment.writes).toEqual([irPath("groups"), irPath("stores")]);
    expect(marksTreatment.renderer).toBe(MarksSeriesStep);
  });
});

describe("marksTreatment apply — the mark guards (spec 071 FR-021)", () => {
  it("applies blocking guard rules from the completion payload", () => {
    const patch = runApplyDeterministically({
      apply: marksTreatment.apply,
      value: completedValue(),
      makeContext: () => makeContext(irWithRule("a")),
      fingerprintStores,
      runs: 3,
    });
    expect(patch.ir).toBeDefined();
    const merged = applyMutatePatch(irWithRule("a"), patch.ir!, marksTreatment.writes);
    const guard = merged.groups.find((g) => g.name === "generated_marks_guard");
    expect(guard?.rules).toHaveLength(1);
  });

  it("is a no-op while completion is null (answers never guard)", () => {
    const patch = marksTreatment.apply(
      { answers: { "marks.marks_attachment.x": "a" }, completion: null, contextTolerance: null },
      makeContext(irWithRule("a")),
    );
    expect(patch).toEqual({});
  });

  it("is a no-op when the worklist has nothing to block or unwrap", () => {
    const patch = marksTreatment.apply(
      completedValue({
        worklist: { ownLetterUnits: [], markUnits: [], blockedCombinations: [] },
      }),
      makeContext(irWithRule("a")),
    );
    expect(patch).toEqual({});
  });

  it("is a no-op without a working IR", () => {
    expect(marksTreatment.apply(completedValue(), makeContext(null))).toEqual({});
    expect(marksTreatment.apply(undefined, makeContext(irWithRule("a")))).toEqual({});
  });

  it("re-applying the same completion changes nothing further (idempotent)", () => {
    const base = irWithRule("a");
    const first = marksTreatment.apply(completedValue(), makeContext(base));
    const guarded = applyMutatePatch(base, first.ir!, marksTreatment.writes);
    const second = marksTreatment.apply(completedValue(), makeContext(guarded));
    const reguarded =
      second.ir === undefined ? guarded : applyMutatePatch(guarded, second.ir, marksTreatment.writes);
    expect(JSON.stringify(reguarded.groups)).toBe(JSON.stringify(guarded.groups));
    expect(JSON.stringify(reguarded.stores)).toBe(JSON.stringify(guarded.stores));
  });
});

describe("MarksStepHost — the R10 migration flag mirror", () => {
  it("sets the session flag when the recorded completion determined it", () => {
    recordMarksTreatmentValue(completedValue({ migrationNeeded: true }));
    render(<MarksStepHost onComplete={() => {}} />);
    expect(useSurveySessionStore.getState().marksMigrationNeeded).toBe(true);
  });

  it("leaves the flag unset when the completion did not determine it", () => {
    recordMarksTreatmentValue(completedValue({ migrationNeeded: false }));
    render(<MarksStepHost onComplete={() => {}} />);
    expect(useSurveySessionStore.getState().marksMigrationNeeded).toBe(false);
  });
});
