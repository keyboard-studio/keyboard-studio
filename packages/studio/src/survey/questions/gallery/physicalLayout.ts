// physicalLayout — gallery decision module for `physical-layout` (spec 090).
//
// The value is the physical key assignment list (survey/assignLoop/
// physicalLayoutValue.ts): exactly the set MechanismGallery works
// with — the phase-C assignments filtered to the physical modality,
// each assignment keeping the provenance it already carries (`source`:
// hand-set vs suggested). Recording is step-side: AddPhysicalAdapter
// records the current list as this decision when the author completes
// the step (the base-keyboard / deadkeys / carve precedent — editor
// steps record their own decision; ratified for editor-backed steps
// by D-090-31).
//
// `apply` is a deliberate no-op (execution shape D-090-38, the
// D-090-12 / D-090-30 wall): 089's apply contract has no channel for
// what R1 did — `lockDesktop()` flips a bare store flag, the
// assignments' applied view is the phase-C `phaseResults` entry that
// `recordAssignments` maintains, and the staleness-gated
// `repropagate` is a store procedure, not a patch. Those effects
// re-homed to the step's completion wiring (lib/assignLoopCompletion
// .ts, fired by the adapter and by journey-runner's replay) when the
// reducer's R1 hook retired; the gallery's live write path
// (`recordAssignments` into phaseResults) is unchanged. Replay
// support — rebuilding the phase-C view from this value — is 093's
// concern, as with carve's overlay fold (D-090-31 handoff).
//
// No extract: assignments are authored in the gallery; no
// starting-point seed produces them today (deadkeys/carve
// precedent). Live extraction is 092's work.
//
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes
// leave via onChange, recorded and applied by the gallery host.

import type { GalleryModule } from "../../types.ts";
import type { PhysicalLayoutValue } from "../../assignLoop/physicalLayoutValue.ts";
import { PhysicalLayoutDecisionRenderer } from "../../assignLoop/PhysicalLayoutDecisionRenderer.tsx";

// The value type is declared with the state it snapshots in
// survey/assignLoop/physicalLayoutValue.ts (the D-090-8 pattern) and
// re-exported for module consumers.
export type { PhysicalLayoutValue } from "../../assignLoop/physicalLayoutValue.ts";

export const definition = {
  id: "physicalLayout",
  type: "notice" as const,
  prompt: "Where does each character go on the physical keyboard?",
  audit_label: "Physical layout",
};

const physicalLayout: GalleryModule<PhysicalLayoutValue> = {
  definition,
  provides: ["physical-layout"],
  requires: ["carved-layout", "deadkeys-defined", "rule-set", "marks-treatment", "windows-layout"],
  inputs: [],
  // decisionIRPaths maps this decision to [] today; a story that gives the
  // module real IR writes updates decisionIRPaths in the same change
  // (decisionIRConsistency.test.ts pins the two together).
  writes: [],
  apply: () => ({}),
  renderer: PhysicalLayoutDecisionRenderer,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default physicalLayout;
