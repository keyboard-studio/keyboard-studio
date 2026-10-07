// marksTreatment — gallery decision module for `marks-treatment` (spec 090).
//
// The value is the marks-series answer composite plus, once the series
// completes, the completion payload (worklist + output form) and the
// context-tolerance station's decision (survey/marks/marksValue.ts,
// design record D-090-11).
//
// Apply performs the mark guards (spec 071 FR-021) from the completion
// payload — the same commit point as the retired reducer MARKS handler:
// while `completion` is null (every answer record before completion,
// and any answer record after one, which clears it) apply is a no-op, so
// the guards can never run against a partial worklist. applyMarkGuards
// is idempotent (it strips and rebuilds its own generated artifacts), so
// a later value record carrying the same completion — the
// context-tolerance hook's appliedFingerprint re-record — re-running
// apply changes nothing. The context-tolerance patch itself stays with
// its effect (hooks/useContextToleranceApply.ts), which needs the live
// analysis a pure apply cannot await; T023 re-keyed that effect's
// decision source to this value's `contextTolerance`.
//
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes leave
// via onChange, recorded and applied by the gallery host.

import { applyMarkGuards } from "@keyboard-studio/engine";
import { irPath, type IRPath, type KeyboardIR } from "@keyboard-studio/contracts";

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

/** The IR subtrees the mark guards replace wholesale (guard group + unwrap stores). */
const MARKS_WRITES: readonly IRPath[] = [irPath("groups"), irPath("stores")];

const marksTreatment: GalleryModule<MarksTreatmentValue> = {
  definition,
  provides: ["marks-treatment"],
  requires: ["character-inventory"],
  inputs: [],
  writes: MARKS_WRITES,
  apply: (value: MarksTreatmentValue | undefined, ctx) => {
    if (value === undefined || value.completion === null || ctx.ir === null) return {};
    const guarded = applyMarkGuards(ctx.ir, value.completion.worklist, value.completion.outputForm);
    if (guarded.ir === ctx.ir) return {};
    const ir: Partial<KeyboardIR> = {};
    if (guarded.ir.groups !== ctx.ir.groups) ir.groups = guarded.ir.groups;
    if (guarded.ir.stores !== ctx.ir.stores) ir.stores = guarded.ir.stores;
    return { ir };
  },
  renderer: MarksSeriesStep,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default marksTreatment;
