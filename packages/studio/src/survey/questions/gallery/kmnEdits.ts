// kmnEdits -- decision module for `kmn-edits` (spec 113, research R12).
//
// The value is the Layout tab's ordered edit log (`KmnEditsValue`). Unlike the wizard's gallery
// modules it is recorded at EDIT time -- the Layout tab applies each confirmed edit to the live
// IR and records the log -- and it is not a wizard step: it is registered for replay and
// decision lookup only (survey/questions/registry.ts `layoutEditModules`), so it forms no screen.
//
// apply replays the entries over the context IR through the engine's replayKmnEdits and returns
// the groups array as its patch. Called with no value (the second pass a rebuild runs for
// downstream decisions) it composes from the recorded decision, like deadkeysDefined.
//
// No extract: a starting point carries no Layout-tab edits. Boundary (FR-003): a pure
// descriptor -- no store imports.

import { irPath } from "@keyboard-studio/contracts";
import type { KmnEditsValue } from "@keyboard-studio/contracts";
import { replayKmnEdits } from "@keyboard-studio/engine";
import type { GalleryModule } from "../../types.ts";
import { KmnEditsRenderer } from "./KmnEditsRenderer.tsx";

export type { KmnEditsValue };

export const definition = {
  id: "kmnEdits",
  type: "notice" as const,
  prompt: "Which keys did you change in the Layout tab?",
  audit_label: "Layout edits",
};

const kmnEdits: GalleryModule<KmnEditsValue> = {
  definition,
  provides: ["kmn-edits"],
  // Replays after every decision that writes rules. `requires` only orders: an unrecorded
  // requirement does not block replay (research R12).
  requires: ["carved-layout", "deadkeys-defined", "rule-set", "physical-layout"],
  inputs: [],
  writes: [irPath("groups")],
  apply: (value, ctx) => {
    const effective = value ?? (ctx.decisions["kmn-edits"]?.value as KmnEditsValue | undefined);
    if (effective === undefined || ctx.ir === null || effective.entries.length === 0) return {};
    const { ir } = replayKmnEdits(ctx.ir, effective.entries);
    return { ir: { groups: ir.groups } };
  },
  renderer: KmnEditsRenderer,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default kmnEdits;
