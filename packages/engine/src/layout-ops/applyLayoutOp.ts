/**
 * applyLayoutOp — one Layout-tab edit as a pure IR-to-IR mutation
 * (spec 117, contracts/layout-ops.md).
 *
 * Operates on the entry keys-group (the group `begin Unicode` uses). Like the
 * deadkey-lifecycle mutations it deep-clones the input and never mutates it;
 * refusals run BEFORE the clone and throw, so a refused edit leaves the input
 * untouched. The returned {@link KmnEditEffect} lists exactly what was
 * inserted and removed, so a local undo needs no rebuild (`invertEffect`).
 *
 * `clear-key` has no IR effect here: it cannot know what the rules looked like
 * before the slot's `set-key`s. Replay drops those entries instead
 * (`replayKmnEdits`) and the live path restores the slot (`clearKeyLive`).
 * `decline-case-partner` is record-only.
 */

import type {
  IRGroup,
  IRRule,
  KeyboardIR,
  LayerCombo,
  LayoutOperation,
} from "@keyboard-studio/contracts";
import { canonicalizeCombo } from "../pattern-apply/modifierCombos.js";
import { insertBeforeTerminalRules } from "../pattern-apply/ir-insert.js";
import {
  assertDeadkeyKnown,
  contextKeys,
  entryGroupForEdit,
  isMnemonicKeyboard,
  ruleIsContextFreeOn,
  ruleOnSlot,
  sameLayer,
  toContextElements,
  toOutputElements,
  usedNodeIds,
} from "./ruleMatch.js";
import type { KmnEditEffect } from "./types.js";

export interface ApplyLayoutOpResult {
  ir: KeyboardIR;
  effect: KmnEditEffect;
}

const NO_EFFECT: KmnEditEffect = { groupNodeId: "", inserted: [], removed: [] };

function noEffect(ir: KeyboardIR): ApplyLayoutOpResult {
  return { ir, effect: { ...NO_EFFECT, inserted: [], removed: [] } };
}

/**
 * Refuse when an opaque fragment in the entry group is a rule on this slot:
 * the codec could not model it, so we can neither match it nor safely write
 * a rule that would sit alongside it.
 */
function assertNoOpaqueRuleOnSlot(
  ir: KeyboardIR,
  group: IRGroup,
  vkey: string,
  layer: LayerCombo,
): void {
  for (const frag of ir.raw) {
    if (frag.groupNodeId !== group.nodeId) continue;
    for (const m of frag.sourceText.matchAll(/\[([^\]]*)\]/g)) {
      const tokens = (m[1] ?? "").split(/\s+/).filter((t) => t.length > 0);
      if (!tokens.includes(vkey)) continue;
      const mods = tokens.filter((t) => t !== vkey);
      if (sameLayer(mods, layer)) {
        throw new Error(
          `Layout edit refused: ${vkey} is handled by an opaque rule the editor cannot change`,
        );
      }
    }
  }
}

function deadkeyIdsOf(op: LayoutOperation): string[] {
  const ids: string[] = [];
  if (op.op === "set-key" && op.output.kind === "deadkey") ids.push(op.output.deadkeyId);
  if (op.op === "set-row" || op.op === "remove-row") {
    for (const el of op.context) if (el.kind === "deadkey") ids.push(el.deadkeyId);
  }
  if (op.op === "set-row" && !("kind" in op.becomes)) {
    for (const el of op.becomes) if (el.kind === "deadkey") ids.push(el.deadkeyId);
  }
  return ids;
}

/** A node id unique in `used`, preferring a stable one derived from the op's seq. */
function freshNodeId(used: Set<string>, seq: number): string {
  const base = `layout-edit:${seq}`;
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  return id;
}

export function applyLayoutOp(ir: KeyboardIR, op: LayoutOperation): ApplyLayoutOpResult {
  if (op.op === "decline-case-partner" || op.op === "clear-key") return noEffect(ir);

  if (isMnemonicKeyboard(ir)) {
    throw new Error("Layout edit refused: mnemonic keyboards are not editable on the Layout tab");
  }
  const entry = entryGroupForEdit(ir);
  assertNoOpaqueRuleOnSlot(ir, entry, op.vkey, op.layer);
  for (const id of deadkeyIdsOf(op)) assertDeadkeyKnown(ir, id);
  if (op.op === "set-key" && op.output.kind === "text" && op.output.text.length === 0) {
    throw new Error("Layout edit refused: set-key text is empty");
  }
  if (op.op === "set-row" && !("kind" in op.becomes) && op.becomes.length === 0) {
    throw new Error("Layout edit refused: set-row has an empty result");
  }
  const modifiers = canonicalizeCombo(op.layer);

  const ctx = op.op === "set-key" ? [] : contextKeys(op.context);
  const matches = (r: IRRule): boolean =>
    op.op === "set-key" ? ruleIsContextFreeOn(r, op.vkey, op.layer) : ruleOnSlot(r, op.vkey, op.layer, ctx);

  // Copy only the spine the edit changes (the IR, the groups array, the entry group); the rules
  // are replaced, never mutated, so the rest is shared with the input. A full structuredClone
  // per op made replaying a long log cost O(entries x IR size) on every rebuild and projection.
  const next: KeyboardIR = { ...ir, groups: ir.groups.map((g) => (g.nodeId === entry.nodeId ? { ...g } : g)) };
  const group = next.groups.find((g) => g.nodeId === entry.nodeId);
  if (group === undefined) throw new Error("applyLayoutOp: entry group vanished after copy");

  const removed: KmnEditEffect["removed"] = [];
  const kept: IRRule[] = [];
  group.rules.forEach((rule, index) => {
    if (matches(rule)) removed.push({ rule, index });
    else kept.push(rule);
  });
  group.rules = kept;

  const inserted: string[] = [];
  if (op.op !== "remove-row") {
    const vkeyEl = { kind: "vkey" as const, name: op.vkey, modifiers: [...modifiers] };
    const preContext = op.op === "set-key" ? [] : toContextElements(op.context);
    const rule: IRRule = {
      nodeId: freshNodeId(usedNodeIds(next), op.seq),
      context:
        preContext.length === 0
          ? [vkeyEl]
          : [...preContext, { kind: "raw", text: "+" }, vkeyEl],
      output: toOutputElements(op.op === "set-key" ? singleOutput(op.output) : op.becomes),
      authorEdit: "layout-tab",
    };
    group.rules = insertBeforeTerminalRules(group.rules, rule);
    inserted.push(rule.nodeId);
  }

  return { ir: next, effect: { groupNodeId: group.nodeId, inserted, removed } };
}

function singleOutput(
  output: Extract<LayoutOperation, { op: "set-key" }>["output"],
): Parameters<typeof toOutputElements>[0] {
  if (output.kind === "nul") return { kind: "nul" };
  return [output];
}
