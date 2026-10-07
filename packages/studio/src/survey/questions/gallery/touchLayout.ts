// touchLayout — gallery decision module for `touch-layout` (spec 090).
//
// The value is the author's key-edit overlay (survey/assignLoop/
// touchLayoutValue.ts): the spec-014 key-edit operations in order
// plus the deleted touch key ids — replaying the ops reproduces the
// overlay exactly, per-key provenance keeping spec 014's vocabulary
// inside the ops. Recording is step-side: AddTouchAdapter records
// the overlay snapshot as this decision when the author completes
// the step (the editor-step precedent; ratified by D-090-31).
//
// `apply` is a deliberate no-op (execution shape D-090-38, the
// D-090-12 / D-090-30 wall): R2's build does not consume the ops at
// all — `buildTouchLayoutJson` takes baseIr + TouchAssignment[] +
// {baseTouchJson, mods, seedSource} (completion-time inputs the
// value does not carry), and its output lands in the bare
// `touchLayoutJson` store string, for which 089's patch contract
// has no channel. The ops replay onto the gallery's derived layout,
// never the IR, so there is no deadkeys-style replay for an apply
// to perform. The R2 effects re-homed to the step's completion
// wiring (lib/assignLoopCompletion.ts, fired by the adapter and by
// journey-runner's replay) when the reducer's R2 hook retired; the
// gallery's live write paths (`setTouchDraft` / `deleteTouchKey`
// into the overlay, `touchDraft` as the persisted applied view)
// are unchanged.
//
// No extract: touch assignments are authored in the gallery; the
// seed-source fork is its own decision (touch-seed-source), and no
// starting-point seed produces key-edit ops today. Live extraction
// is 092's work.
//
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes
// leave via onChange, recorded and applied by the gallery host.

import type { GalleryModule } from "../../types.ts";
import type { TouchLayoutValue } from "../../assignLoop/touchLayoutValue.ts";
import { TouchDecisionRenderer } from "../../assignLoop/TouchDecisionRenderer.tsx";

// The value type is declared with the overlay it snapshots in
// survey/assignLoop/touchLayoutValue.ts (the D-090-8 pattern) and
// re-exported for module consumers.
export type { TouchLayoutValue } from "../../assignLoop/touchLayoutValue.ts";

export const definition = {
  id: "touchLayout",
  type: "notice" as const,
  prompt: "How should the touch layout look?",
  audit_label: "Touch layout",
};

const touchLayout: GalleryModule<TouchLayoutValue> = {
  definition,
  provides: ["touch-layout"],
  requires: ["physical-layout", "touch-seed-source"],
  inputs: [],
  // decisionIRPaths maps this decision to [] today; a story that gives the
  // module real IR writes updates decisionIRPaths in the same change
  // (decisionIRConsistency.test.ts pins the two together).
  writes: [],
  apply: () => ({}),
  renderer: TouchDecisionRenderer,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default touchLayout;
