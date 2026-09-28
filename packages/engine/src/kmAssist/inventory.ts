/**
 * kmAssist inventory summary — spec 082 Track C read-only v1 (FR-023).
 *
 * Read-only v1 exposes the working copy's confirmed inventory as data:
 * user store names (for `any()`/`index()`/`outs()` name completion) and the
 * characters the keyboard can produce (for output completion). The future
 * autocomplete UI consumes this; v1 ships the data plus tests only.
 *
 * READ-ONLY: pure function, no mutation.
 */
import type { KeyboardIR } from "@keyboard-studio/contracts";

/** Confirmed inventory drawn from the working copy's IR. */
export interface RuleInventory {
  /** Non-system store names in declaration order (completion candidates). */
  stores: string[];
  /** Distinct producible characters, sorted by code point. */
  chars: string[];
}

/**
 * Summarize the inventory from an IR: user store names plus every character
 * producible by a rule output or stored in a user store.
 */
export function summarizeInventory(ir: KeyboardIR): RuleInventory {
  const stores = ir.stores
    .filter((store) => !store.isSystem)
    .map((store) => store.name);

  const chars = new Set<string>();
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      for (const el of rule.output) {
        if (el.kind === "char") chars.add(el.value);
      }
    }
  }
  for (const store of ir.stores) {
    if (store.isSystem) continue;
    for (const item of store.items) {
      if (item.kind === "char") chars.add(item.value);
    }
  }

  const sorted = [...chars].sort(
    (a, b) => (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0),
  );
  return { stores, chars: sorted };
}
