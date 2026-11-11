/**
 * invertEffect — the local inverse of one applied layout edit
 * (spec 117, contracts/layout-ops.md "Undo"): drop the inserted nodes,
 * restore the removed ones at their recorded positions. No rebuild.
 *
 * `ir` is the IR the edit produced; the result emits identically to the IR the
 * edit started from. Pure: deep-clones, never mutates the input.
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";
import type { KmnEditEffect } from "./types.js";

export function invertEffect(ir: KeyboardIR, effect: KmnEditEffect): KeyboardIR {
  if (effect.groupNodeId === "") return ir;
  const next = structuredClone(ir);
  const group = next.groups.find((g) => g.nodeId === effect.groupNodeId);
  if (group === undefined) {
    throw new Error(`invertEffect: group "${effect.groupNodeId}" is not in the IR`);
  }
  const dropped = new Set(effect.inserted);
  const rules = group.rules.filter((r) => !dropped.has(r.nodeId));
  // Ascending pre-edit positions: each splice lands where the rule originally sat.
  for (const { rule, index } of [...effect.removed].sort((a, b) => a.index - b.index)) {
    rules.splice(Math.min(index, rules.length), 0, structuredClone(rule));
  }
  group.rules = rules;
  return next;
}
