/**
 * clearKeyLive — the live `clear-key` (spec 117, contracts/layout-ops.md).
 *
 * The live path applies one entry and records its effect rather than
 * replaying, but a `clear-key` cannot be an IR inverse: it must give back the
 * slot's context-free rules as replay WITHOUT the cleared `set-key`s would
 * produce them. So it rebuilds that IR from the starting point and the log,
 * then swaps only the slot's context-free rules in the current IR for the
 * rebuilt ones. Everything else (other keys, contextual rows, later edits)
 * stays as the live IR has it. The result is tested equal to replay for the slot.
 */

import type { IRRule, KeyboardIR, KmnEdit, LayoutOperation } from "@keyboard-studio/contracts";
import { insertBeforeTerminalRules } from "../pattern-apply/ir-insert.js";
import type { ApplyLayoutOpResult } from "./applyLayoutOp.js";
import { replayKmnEdits } from "./replayKmnEdits.js";
import { entryGroupForEdit, ruleIsContextFreeOn } from "./ruleMatch.js";
import type { KmnEditEffect } from "./types.js";

type ClearKeyOp = Extract<LayoutOperation, { op: "clear-key" }>;

export function clearKeyLive(
  ir: KeyboardIR,
  op: ClearKeyOp,
  /** The IR the log was recorded against (the working copy's starting point). */
  startIr: KeyboardIR,
  /** The log entries recorded before `op`. */
  earlier: readonly KmnEdit[],
): ApplyLayoutOpResult {
  const rebuilt = replayKmnEdits(startIr, [...earlier, op]).ir;
  const want = entryGroupForEdit(rebuilt).rules.filter((r) => ruleIsContextFreeOn(r, op.vkey, op.layer));
  const wantIds = new Set(want.map((r) => r.nodeId));

  const entry = entryGroupForEdit(ir);
  const next = structuredClone(ir);
  const group = next.groups.find((g) => g.nodeId === entry.nodeId);
  if (group === undefined) throw new Error("clearKeyLive: entry group vanished after clone");

  const removed: KmnEditEffect["removed"] = [];
  const kept: IRRule[] = [];
  group.rules.forEach((rule, index) => {
    if (ruleIsContextFreeOn(rule, op.vkey, op.layer) && !wantIds.has(rule.nodeId)) {
      removed.push({ rule, index });
    } else {
      kept.push(rule);
    }
  });
  group.rules = kept;

  const present = new Set(kept.map((r) => r.nodeId));
  const rebuiltRules = entryGroupForEdit(rebuilt).rules;
  const inserted: string[] = [];
  for (const rule of want) {
    if (present.has(rule.nodeId)) continue;
    // Land before the first later rule (in rebuilt order) that the live group also holds,
    // so the slot keeps the order replay gives it; else before the terminal rules.
    const after = rebuiltRules.slice(rebuiltRules.indexOf(rule) + 1).find((r) => present.has(r.nodeId));
    const copy = structuredClone(rule);
    const at = after === undefined ? -1 : group.rules.findIndex((r) => r.nodeId === after.nodeId);
    group.rules =
      at === -1
        ? insertBeforeTerminalRules(group.rules, copy)
        : [...group.rules.slice(0, at), copy, ...group.rules.slice(at)];
    present.add(copy.nodeId);
    inserted.push(copy.nodeId);
  }

  return { ir: next, effect: { groupNodeId: group.nodeId, inserted, removed } };
}
