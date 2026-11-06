// Shared rule matching for the layout ops: which entry group an edit targets,
// and which of its rules sit on a given (vkey, layer, context) slot.

import {
  deadkeyNameKey,
  isNamedDeadkeyName,
  isPlusSeparator,
  listDeadkeys,
} from "@keyboard-studio/contracts";
import type {
  ContextElement,
  IRGroup,
  IRRule,
  KeyboardIR,
  LayerCombo,
  LayoutContext,
  OutputElement,
} from "@keyboard-studio/contracts";

/** `&MNEMONICLAYOUT` set to `1`: keys are positional by character, not by vkey. */
export function isMnemonicKeyboard(ir: KeyboardIR): boolean {
  const store = ir.stores.find(
    (s) => s.isSystem && s.name.replace(/^&/, "").toUpperCase() === "MNEMONICLAYOUT",
  );
  if (store === undefined) return false;
  let text = "";
  for (const it of store.items) if (it.kind === "char") text += it.value;
  return text.trim() === "1";
}

/**
 * The group `begin <encoding>` uses; the first writable using-keys group when
 * the IR names none (the emitter's own fallback). Refuses a readonly or
 * non-keys entry group rather than quietly editing a different one.
 */
export function entryGroupForEdit(ir: KeyboardIR): IRGroup {
  const named = ir.header.entryPoints?.main;
  const group =
    named !== undefined
      ? (ir.groups.find((g) => g.name === named) ??
        ir.groups.find((g) => g.name.toLowerCase() === named.toLowerCase()))
      : ir.groups.find((g) => g.usingKeys && !g.readonly);
  if (group === undefined) throw new Error("Layout edit refused: the keyboard has no entry group");
  if (group.readonly) {
    throw new Error(`Layout edit refused: entry group "${group.name}" is read-only`);
  }
  if (!group.usingKeys) {
    throw new Error(`Layout edit refused: entry group "${group.name}" does not use keys`);
  }
  return group;
}

function modifierSet(mods: readonly string[]): Set<string> {
  return new Set(mods.map((m) => m.toUpperCase()));
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/** True when the modifier lists name the same SET of modifiers (order-insensitive). */
export function sameLayer(a: readonly string[], b: readonly string[]): boolean {
  return sameSet(modifierSet(a), modifierSet(b));
}

/** A comparable key per context unit: chars flatten to one unit per code point. */
function unitKeys(el: ContextElement): string[] {
  switch (el.kind) {
    case "char":
      return Array.from(el.value, (c) => `c:${c.codePointAt(0)}`);
    case "deadkey":
      return [`d:${el.id}`];
    case "namedDeadkey":
      return [`n:${deadkeyNameKey(el.name)}`];
    default:
      // Never equal to a LayoutContext unit: any/index/if/raw/... stay distinct.
      return [`x:${JSON.stringify(el)}`];
  }
}

/** The comparable keys of a Layout-tab context (`deadkeyId` strings resolved to ids/names). */
export function contextKeys(context: LayoutContext): string[] {
  const out: string[] = [];
  for (const el of context) {
    if (el.kind === "text") {
      for (const c of el.text) out.push(`c:${c.codePointAt(0)}`);
    } else if (isNamedDeadkeyName(el.deadkeyId)) {
      out.push(`n:${deadkeyNameKey(el.deadkeyId.trim())}`);
    } else {
      out.push(`d:${parseInt(el.deadkeyId, 16)}`);
    }
  }
  return out;
}

/** True for a context-free-or-contextual rule on exactly `vkey` + `layer` + `ctx` (comparable keys). */
export function ruleOnSlot(
  rule: IRRule,
  vkey: string,
  layer: LayerCombo,
  ctx: readonly string[],
): boolean {
  if (rule.matchKind !== undefined) return false;
  const elems = rule.context.filter((e) => !isPlusSeparator(e));
  const last = elems[elems.length - 1];
  if (last === undefined || last.kind !== "vkey") return false;
  if (last.name !== vkey || !sameLayer(last.modifiers, layer)) return false;
  const pre = elems.slice(0, -1).flatMap(unitKeys);
  return pre.length === ctx.length && pre.every((k, i) => k === ctx[i]);
}

/** A context-free rule on exactly `vkey` + `layer`. */
export function ruleIsContextFreeOn(rule: IRRule, vkey: string, layer: LayerCombo): boolean {
  return ruleOnSlot(rule, vkey, layer, []);
}

/** IR element for a `deadkeyId` string (numeric = hex, named = verbatim). */
export function deadkeyElement(
  deadkeyId: string,
): { kind: "deadkey"; id: number } | { kind: "namedDeadkey"; name: string } {
  return isNamedDeadkeyName(deadkeyId)
    ? { kind: "namedDeadkey", name: deadkeyId.trim() }
    : { kind: "deadkey", id: parseInt(deadkeyId, 16) };
}

/** Refuse a deadkey id that does not already appear in the IR. */
export function assertDeadkeyKnown(ir: KeyboardIR, deadkeyId: string): void {
  const infos = listDeadkeys(ir);
  const known = isNamedDeadkeyName(deadkeyId)
    ? infos.some((d) => d.name !== undefined && deadkeyNameKey(d.name) === deadkeyNameKey(deadkeyId.trim()))
    : infos.some((d) => d.id === parseInt(deadkeyId, 16));
  if (!known) throw new Error(`Layout edit refused: unknown deadkey id "${deadkeyId}"`);
}

/** Text to per-code-point char elements, with deadkeys as typed elements. */
export function toContextElements(
  items: LayoutContext,
): ContextElement[] {
  return items.flatMap((el): ContextElement[] =>
    el.kind === "text"
      ? Array.from(el.text, (c) => ({ kind: "char", value: c }))
      : [deadkeyElement(el.deadkeyId)],
  );
}

export function toOutputElements(
  items: LayoutContext | { kind: "nul" },
): OutputElement[] {
  if ("kind" in items) return [{ kind: "nul" }];
  return items.flatMap((el): OutputElement[] =>
    el.kind === "text"
      ? Array.from(el.text, (c) => ({ kind: "char", value: c }))
      : [deadkeyElement(el.deadkeyId)],
  );
}

/** nodeIds in use anywhere in the IR. */
export function usedNodeIds(ir: KeyboardIR): Set<string> {
  const ids = new Set<string>();
  for (const g of ir.groups) {
    ids.add(g.nodeId);
    for (const r of g.rules) ids.add(r.nodeId);
  }
  for (const s of ir.stores) ids.add(s.nodeId);
  for (const c of ir.comments) ids.add(c.nodeId);
  for (const r of ir.raw) ids.add(r.nodeId);
  return ids;
}
