/**
 * replayKmnEdits — rebuild the Layout-tab edits from the `kmn-edits` log
 * (spec 113, contracts/layout-ops.md "Replay is not a plain reduce").
 *
 * The list is normalised first: a `clear-key` drops the earlier `set-key`
 * entries for its `(vkey, layer)` (and is itself spent: it has no IR effect of
 * its own). The survivors apply in order through `applyLayoutOp`, so later
 * entries on the same slot win and replaying the same log on the same IR is
 * idempotent.
 */

import type { KeyboardIR, KmnEdit } from "@keyboard-studio/contracts";
import { applyLayoutOp } from "./applyLayoutOp.js";
import { sameLayer } from "./ruleMatch.js";
import type { ReplayMiss } from "./types.js";

export interface ReplayResult {
  ir: KeyboardIR;
  misses: ReplayMiss[];
}

/** The entries replay actually applies: clear-keys resolved away, order kept. */
export function normaliseKmnEdits(entries: readonly KmnEdit[]): KmnEdit[] {
  const out: KmnEdit[] = [];
  for (const entry of entries) {
    if (entry.op === "clear-key") {
      for (let i = out.length - 1; i >= 0; i--) {
        const e = out[i];
        if (e !== undefined && e.op === "set-key" && e.vkey === entry.vkey && sameLayer(e.layer, entry.layer)) {
          out.splice(i, 1);
        }
      }
      continue;
    }
    out.push(entry);
  }
  return out;
}

export function replayKmnEdits(ir: KeyboardIR, entries: readonly KmnEdit[]): ReplayResult {
  let current = ir;
  for (const entry of normaliseKmnEdits(entries)) {
    current = applyLayoutOp(current, entry).ir;
  }
  return { ir: current, misses: [] };
}
