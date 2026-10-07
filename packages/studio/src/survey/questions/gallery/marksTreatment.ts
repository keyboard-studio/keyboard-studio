// marksTreatment — gallery decision module for `marks-treatment` (spec 090).
//
// Stub landed with T008 so the FR-002 coverage test pins this decision's
// provider from the start; the real renderer/apply fill in with T023 (US2).
// The value is the composite of the marks-series answers plus the
// context-tolerance outcome; its apply performs applyMarkGuards and the
// context-tolerance patch. T023 retires the reducer's MARKS handler.
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes leave
// via onChange, recorded and applied by the gallery host.

import type { GalleryModule } from "../../types.ts";
import { UnmigratedGalleryRenderer } from "./placeholderRenderer.tsx";

export const definition = {
  id: "marksTreatment",
  type: "notice" as const,
  prompt: "How should marks behave on your keyboard?",
  audit_label: "Marks treatment",
};

/**
 * The marks-treatment decision value (data-model.md): the marks-series
 * answers as one composite, plus the context-tolerance station's outcome
 * (null until that station runs). Answer ids are the existing marks_*
 * question ids — no i18n id changes.
 */
export interface MarksTreatmentValue {
  answers: Readonly<Record<string, string | string[] | undefined>>;
  contextToleranceOutcome: string | null;
}

const marksTreatment: GalleryModule<MarksTreatmentValue> = {
  definition,
  provides: ["marks-treatment"],
  requires: ["character-inventory"],
  inputs: [],
  // decisionIRPaths maps this decision to [] today; a story that gives the
  // module real IR writes updates decisionIRPaths in the same change
  // (decisionIRConsistency.test.ts pins the two together).
  writes: [],
  apply: () => ({}),
  renderer: UnmigratedGalleryRenderer,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default marksTreatment;
