// carvedLayout — gallery decision module for `carved-layout` (spec 090).
//
// The value is the carve outcome (survey/carve/carveValue.ts): the
// removal set (per-item provenance RULED flat enum, T003), the spec-076
// carve dispositions unchanged, and the closed-keyboard card outcome.
// Recording is step-side: the CarveAdapter records the overlay-derived
// value as this decision when the author completes the step (the
// base-keyboard / deadkeys precedent — editor steps record their own
// decision; ratified for editor-backed steps by D-090-31).
//
// `apply` is a deliberate no-op (lead ruling D-090-30, option (a) —
// the characters-precedent cut): 089's apply contract has no channel
// for the carve overlay, and the applied view (carved IR / emitted
// .kmn) is produced by lib/projectWorkingCopyVfs.ts from the
// persisted overlay, which remains the canonical producer. Replay
// support — reconstructing the overlay from this value — belongs to
// 093's overlay accumulator, which grows a carve-overlay fold as the
// named downstream handoff (D-090-31); writing the carved IR through
// the `ir` channel here instead would create a second producer whose
// inputs (session aggregates, entry-group deferral, rule-additions
// splice) the value does not carry.
//
// No extract: no starting-point seed for carve exists today — carve
// proposals are computed in-gallery as author-facing suggestions but
// never seed the overlay, and every live removal is an author action
// (see carveValue.ts on per-item provenance). Live extraction is
// 092's work.
//
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes
// leave via onChange, recorded and applied by the gallery host.

import type { GalleryModule } from "../../types.ts";
import type { CarvedLayoutValue } from "../../carve/carveValue.ts";
import { CarveDecisionRenderer } from "../../carve/CarveDecisionRenderer.tsx";

// The value types are declared with the overlay they snapshot in
// survey/carve/carveValue.ts (the D-090-8 pattern) and re-exported
// for module consumers.
export type { CarveRemovalItem, CarvedLayoutValue } from "../../carve/carveValue.ts";

export const definition = {
  id: "carvedLayout",
  type: "notice" as const,
  prompt: "What should be removed from the base keyboard?",
  audit_label: "Carved layout",
};

const carvedLayout: GalleryModule<CarvedLayoutValue> = {
  definition,
  provides: ["carved-layout"],
  screen: "carve",
  requires: ["base-keyboard", "windows-layout", "marks-treatment", "punctuation-inventory", "invisibles-inventory", "retained-convenience-chars"],
  inputs: [],
  // decisionIRPaths maps this decision to [] today; a story that gives the
  // module real IR writes updates decisionIRPaths in the same change
  // (decisionIRConsistency.test.ts pins the two together).
  writes: [],
  apply: () => ({}),
  renderer: CarveDecisionRenderer,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default carvedLayout;
