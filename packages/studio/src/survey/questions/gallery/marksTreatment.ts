// marksTreatment — gallery decision module for `marks-treatment` (spec 090).
//
// The value is the marks-series answer composite plus, once the series
// completes, the completion payload (worklist + output form) and the
// context-tolerance station's decision (survey/marks/marksValue.ts,
// design record D-090-11).
//
// Apply writes nothing (spec 106 FR-011). The mark guards are generated
// from this value's completion payload by the projection (step 2.6 in
// lib/projectWorkingCopyVfs.ts), which is the only path a rule reaches the
// preview or the download through; generating them into the working IR
// here, as spec 071 did, never reached the artifact. The value itself is
// unchanged. The context-tolerance patch stays with its effect
// (hooks/useContextToleranceApply.ts), which needs the live analysis a
// pure apply cannot await.
//
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes leave
// via onChange, recorded and applied by the gallery host.

import type { GalleryModule } from "../../types.ts";
import { MarksSeriesStep } from "../../marks/MarksSeriesStep.tsx";
import type { MarksTreatmentValue } from "../../marks/marksValue.ts";

export type { MarksCompletion, MarksTreatmentValue } from "../../marks/marksValue.ts";

export const definition = {
  id: "marksTreatment",
  type: "notice" as const,
  prompt: "How should marks behave on your keyboard?",
  audit_label: "Marks treatment",
};

const marksTreatment: GalleryModule<MarksTreatmentValue> = {
  definition,
  provides: ["marks-treatment"],
  screen: "marks",
  requires: ["character-inventory"],
  inputs: [],
  writes: [],
  apply: () => ({}),
  renderer: MarksSeriesStep,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default marksTreatment;
