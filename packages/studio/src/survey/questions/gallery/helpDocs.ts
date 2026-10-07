// helpDocs — gallery decision module for `help-docs` (spec 090).
//
// Stub landed with T008 so the FR-002 coverage test pins this decision's
// provider from the start. T052 (US5) lands 090's slice of the step: the
// gallery-host REGISTRATION — the PhaseFGate wrapper records this decision
// at gate completion (composeHelpDocsValue below), and the completion
// recorder (T050) turns the record into the decision's log entry. The
// renderer stays the placeholder and there is still no `apply` here: the
// Phase F flow's questions, their applies, and the working-copy help-docs
// composition are 089's (research Q3) — this module adds no second write
// path beside them; it only names the composite decision the flow settles.
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes leave
// via onChange, recorded and applied by the gallery host.

import type { SurveyAnswer } from "@keyboard-studio/contracts";
import type { GalleryModule } from "../../types.ts";
import { UnmigratedGalleryRenderer } from "./placeholderRenderer.tsx";

export const definition = {
  id: "helpDocs",
  type: "notice" as const,
  prompt: "What should the help pages say?",
  audit_label: "Help docs",
};

/**
 * The help-docs decision value: the Phase F help/welcome answers as one
 * composite. Owned by 089 (research Q3) — 090 hosts the module and logs
 * the decision (T052); the shape is not redefined here.
 */
export interface HelpDocsValue {
  answers: Readonly<Record<string, string | string[] | undefined>>;
}

/**
 * Compose the `help-docs` decision value from a Phase F completion's
 * answers: every answer the flow settled, keyed by question id. This is a
 * RECORDING composition, not a second write path — the working-copy
 * help-docs slice is composed from the same answers by 089's
 * helpDocsFromDecisions over the recorded `help-*` decisions; this value
 * is the composite the decision log names as one decision.
 *
 * Answer values outside the declared shape (a boolean, should a future
 * Phase F question gain one) are omitted rather than coerced: the value
 * type is the boundary, and a coercion here would put words in the record
 * the author never settled.
 */
export function composeHelpDocsValue(
  answers: readonly SurveyAnswer[],
): HelpDocsValue {
  const composed: Record<string, string | string[] | undefined> = {};
  for (const answer of answers) {
    if (typeof answer.value === "string" || Array.isArray(answer.value)) {
      composed[answer.questionId] = answer.value;
    }
  }
  return { answers: composed };
}

const helpDocs: GalleryModule<HelpDocsValue> = {
  definition,
  provides: ["help-docs"],
  requires: ["physical-layout", "touch-layout"],
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

export default helpDocs;
