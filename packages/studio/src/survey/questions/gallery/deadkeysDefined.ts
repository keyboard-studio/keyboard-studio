// deadkeysDefined — gallery decision module for `deadkeys-defined` (spec 090).
//
// The value is the author's deadkey lifecycle op log (data-model.md):
// the same DeadkeyOperation list the working copy's deadkeyOverlay
// accumulates at edit time (survey/deadkeys/deadkeyOps.ts). The module's apply
// replays the ops over the context IR through that module's IR-level
// replay — the same primitives the projection's VFS replay uses — and
// returns the groups/stores/raw subtrees as its patch. Recording is
// step-side: the DeadkeyAdapter records the overlay's ops as this
// decision when the author completes the step (the base-keyboard
// precedent — editor steps record their own decision).
//
// No extract: the base keyboard's deadkeys are carried by the base IR
// itself, not by ops — the op log holds author lifecycle edits only,
// so there is nothing to probe. An unrecorded decision means the
// author has not completed the step; a recorded { ops: [] } means
// they completed it with no edits.
//
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes leave
// via onChange, recorded and applied by the gallery host.

import { irPath } from "@keyboard-studio/contracts";
import type { GalleryModule } from "../../types.ts";
import {
  applyDeadkeyOpsToIr,
  type DeadkeysDefinedValue,
} from "../../deadkeys/deadkeyOps.ts";
import { DeadkeyDecisionRenderer } from "../../deadkeys/DeadkeyDecisionRenderer.tsx";

// The value type is declared with the op type in survey/deadkeys/deadkeyOps.ts
// (the D-090-8 pattern) and re-exported for module consumers.
export type { DeadkeysDefinedValue };

export const definition = {
  id: "deadkeysDefined",
  type: "notice" as const,
  prompt: "Which deadkeys does your keyboard define?",
  audit_label: "Deadkeys defined",
};

const deadkeysDefined: GalleryModule<DeadkeysDefinedValue> = {
  definition,
  provides: ["deadkeys-defined"],
  screen: "deadkeys",
  requires: ["carved-layout"],
  inputs: [],
  // DEADKEY_WRITES (steps/editorMutate.ts): the deadkey lifecycle writes
  // groups, stores, and raw fragments — mirrored in decisionIRPaths.
  writes: [irPath("groups"), irPath("stores"), irPath("raw")],
  apply: (value, ctx) => {
    // Pass-2 composition (089 semantics, relayed 2026-10-07): when a
    // completion records carved-layout, this apply also runs — with
    // value undefined — and must compose from ctx.decisions: the
    // recorded op log, if one exists, is the effective value.
    const effective =
      value ??
      (ctx.decisions["deadkeys-defined"]?.value as DeadkeysDefinedValue | undefined);
    if (effective === undefined || ctx.ir === null || effective.ops.length === 0) return {};
    const { ir, changed } = applyDeadkeyOpsToIr(ctx.ir, effective.ops);
    if (!changed) return {};
    return { ir: { groups: ir.groups, stores: ir.stores, raw: ir.raw } };
  },
  renderer: DeadkeyDecisionRenderer,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default deadkeysDefined;
