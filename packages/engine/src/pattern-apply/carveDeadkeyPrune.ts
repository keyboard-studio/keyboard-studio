// Carve pass of the deadkey prune: removes only deadkeys the CARVE made unused
// (consumed in the start IR, unconsumed after). Deadkeys already dead in the
// start keyboard belong to the scaffolder (see scaffold-ir.ts), so the two
// passes never overlap. An emptied output is removed (pass-through) or
// rewritten to an owned `> nul` (swallow), via the suppression compiler's stamp.

import type { KeyboardIR, OutputElement } from "@keyboard-studio/contracts";
import { stampOwnership } from "./carveSuppression.js";
import {
  consumedDeadkeyKeys,
  pruneUnusedDeadkeys as pruneShared,
  type PruneDeadkeysResult,
} from "../shared/pruneUnusedDeadkeys.js";

export function pruneCarveUnusedDeadkeys(
  startIr: KeyboardIR,
  carvedIr: KeyboardIR,
  opts: { swallow: boolean; loud: boolean },
): PruneDeadkeysResult {
  const start = consumedDeadkeyKeys(startIr);
  if (start.unknown) return { ir: carvedIr, notices: [] };
  return pruneShared(carvedIr, {
    onlyKeys: start.keys,
    onEmptied: (rule) => {
      if (!opts.swallow) return null;
      const nul: OutputElement[] = opts.loud ? [{ kind: "nul" }, { kind: "beep" }] : [{ kind: "nul" }];
      return rule.ownedByBehaviour !== undefined ? { ...rule, output: nul } : stampOwnership(rule, nul);
    },
  });
}
