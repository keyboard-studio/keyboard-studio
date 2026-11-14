// deadkeyInverse -- the inverse of a spec 083 DeadkeyOperation, read from the IR before the op runs
// (spec 117 undo kind `ld`). Undo appends the inverse to the overlay (the log is append-only) and
// applies it to the live IR, so the emitted .kmn after undo equals the text before the edit.
//
// `null` means the op has no faithful inverse (delete, rename, merge, repair ...): the caller
// commits it without an undo entry rather than pretending it can be undone.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { getDeadkeyDisplay, listDeadkeys } from "@keyboard-studio/contracts";
import type { DeadkeyOperation } from "../survey/deadkeys/deadkeyOps.ts";
import { findTriggerRules } from "../editors/deadkey/deadkeyWrite.ts";

function storeItems(ir: KeyboardIR, name: string | null) {
  return name === null ? undefined : ir.stores.find((s) => s.name === name)?.items;
}

export function inverseDeadkeyOp(ir: KeyboardIR, op: DeadkeyOperation): DeadkeyOperation | null {
  switch (op.kind) {
    case "define":
      return { kind: "delete", id: op.id };
    case "add-pair": {
      const info = listDeadkeys(ir).find((d) => d.id === op.id);
      if (info === undefined) return null;
      const length = Math.min(
        storeItems(ir, info.baseStore)?.length ?? 0,
        storeItems(ir, info.outputStore)?.length ?? 0,
      );
      return { kind: "remove-pair", id: op.id, index: length };
    }
    case "insert-pair": {
      return { kind: "remove-pair", id: op.id, index: op.index };
    }
    case "remove-pair": {
      const info = listDeadkeys(ir).find((d) => d.id === op.id);
      const base = storeItems(ir, info?.baseStore ?? null)?.[op.index];
      const out = storeItems(ir, info?.outputStore ?? null)?.[op.index];
      if (base?.kind !== "char" || out?.kind !== "char") return null;
      return { kind: "insert-pair", id: op.id, index: op.index, base: base.value, accented: out.value };
    }
    case "set-name": {
      const info = listDeadkeys(ir).find((d) => d.id === op.id);
      return info === undefined ? null : { kind: "set-name", id: op.id, name: info.authorName };
    }
    case "set-display": {
      const rule = findTriggerRules(ir, op.id)[0];
      return rule === undefined ? null : { kind: "set-display", id: op.id, display: getDeadkeyDisplay(rule) };
    }
    case "retarget": {
      const info = listDeadkeys(ir).find((d) => d.id === op.id);
      if (info === undefined || info.triggerKey === null) return null;
      return {
        kind: "retarget",
        id: op.id,
        newTriggerKey: info.triggerKey,
        ...(info.triggerModifiers !== undefined ? { newTriggerModifiers: info.triggerModifiers } : {}),
      };
    }
    default:
      return null;
  }
}
