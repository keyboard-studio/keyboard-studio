// Shared enumerator of unhandled key positions (spec 109 FR-040; used by spec 108's
// base-keyboard fill, FR-021, and its "filled" provenance, FR-028).
//
// Positional, from the IR alone, and independent of any base keyboard: it lists the
// (key, modifier-state) positions no keystroke rule in the keyboard names. Characters
// are joined in by the caller from base-keyboard data (spec 109 FR-041).
//
// The four modifier states are the ones a base keyboard defines characters for:
// none, shift, AltGr and AltGr+shift. A rule covers a state when its modifier list
// reduces to it (SHIFT/RSHIFT/LSHIFT give shift; RALT, or LCTRL with RALT or LALT,
// give AltGr). Rules in every `using keys` group count, reachable or not.

import { US_BASE_LAYOUT, ruleKeystroke, ruleLhsKind } from "@keyboard-studio/contracts";
import { withoutOutsStores } from "@keyboard-studio/contracts";
import type { KeyboardIR, StoreItem } from "@keyboard-studio/contracts";

export type PositionState = "none" | "shift" | "altgr" | "shiftAltgr";

export interface UnhandledPosition {
  vkey: string;
  state: PositionState;
  /** KMN modifier words for the state. */
  modifiers: readonly string[];
}

const STATES: readonly PositionState[] = ["none", "shift", "altgr", "shiftAltgr"];
const STATE_WORDS: Record<PositionState, readonly string[]> = {
  none: [],
  shift: ["SHIFT"],
  altgr: ["RALT"],
  shiftAltgr: ["RALT", "SHIFT"],
};

const usByChar = new Map<string, { vkey: string; shift: boolean }>();
for (const [k, v] of US_BASE_LAYOUT) {
  const shift = k.startsWith("S+");
  if (!usByChar.has(v)) usByChar.set(v, { vkey: shift ? k.slice(2) : k, shift });
}

function stateOf(words: readonly string[]): PositionState | null {
  const w = new Set(words.map((x) => x.toUpperCase()));
  const shift = w.has("SHIFT") || w.has("RSHIFT") || w.has("LSHIFT");
  const altgr = w.has("RALT") || (w.has("LCTRL") && w.has("LALT"));
  const other = w.has("CTRL") || w.has("ALT") || w.has("LALT") || w.has("LCTRL") || w.has("RCTRL");
  if (other && !altgr) return null;
  return altgr ? (shift ? "shiftAltgr" : "altgr") : shift ? "shift" : "none";
}

function coverKey(vkey: string, state: PositionState): string {
  return `${vkey.toUpperCase()}|${state}`;
}

function storeItems(ir: KeyboardIR, name: string): readonly StoreItem[] {
  const n = name.toLowerCase();
  return ir.stores.find((s) => !s.isSystem && s.name.toLowerCase() === n)?.items ?? [];
}

function coverItem(covered: Set<string>, el: { kind: string; name?: string; value?: string; modifiers?: string[] }): void {
  if (el.kind === "vkey" && el.name !== undefined) {
    const st = stateOf(el.modifiers ?? []);
    if (st !== null) covered.add(coverKey(el.name, st));
  } else if (el.kind === "char" && el.value !== undefined) {
    const us = usByChar.get(el.value);
    if (us) covered.add(coverKey(us.vkey, us.shift ? "shift" : "none"));
  }
}

/**
 * The positions of `vkeys` (main-block keys of the chosen form) that no keystroke rule in
 * `ir` names, in `vkeys` order, then state order. Case of a vkey is ignored (`K_oE2` is
 * `K_OE2`).
 */
export function enumerateUnhandledPositions(source: KeyboardIR, vkeys: Iterable<string>): UnhandledPosition[] {
  // Reads `any(store)` items by position: read without outs() stores (see withoutOutsStores).
  const ir = withoutOutsStores(source);
  const covered = new Set<string>();
  for (const g of ir.groups) {
    if (!g.usingKeys) continue;
    for (const rule of g.rules) {
      if (ruleLhsKind(rule) !== "input") continue;
      const el = ruleKeystroke(rule, g);
      if (el === undefined) continue;
      if (el.kind === "vkey" || el.kind === "char") coverItem(covered, el);
      else if (el.kind === "any") {
        for (const it of storeItems(ir, el.storeRef)) {
          if (it.kind === "vkey") coverItem(covered, { kind: "vkey", name: it.name, modifiers: [] });
          else if (it.kind === "char") coverItem(covered, { kind: "char", value: it.value });
          else if (it.kind === "raw") {
            const m = /^\[\s*((?:[A-Za-z]+\s+)*)([KTU]_[A-Za-z0-9_]+)\s*\]$/.exec(it.text.trim());
            if (m) coverItem(covered, { kind: "vkey", name: m[2] as string, modifiers: (m[1] ?? "").split(/\s+/).filter(Boolean) });
          }
        }
      } else if (el.kind === "raw") {
        const m = /^\[\s*((?:[A-Za-z]+\s+)*)([KTU]_[A-Za-z0-9_]+)\s*\]$/.exec(el.text.trim());
        if (m) coverItem(covered, { kind: "vkey", name: m[2] as string, modifiers: (m[1] ?? "").split(/\s+/).filter(Boolean) });
      }
    }
  }
  const out: UnhandledPosition[] = [];
  for (const vkey of vkeys) {
    for (const state of STATES) {
      if (!covered.has(coverKey(vkey, state))) out.push({ vkey, state, modifiers: STATE_WORDS[state] });
    }
  }
  return out;
}
