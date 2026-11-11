// Shared fixture for the layout-ops tests: a small keys-group keyboard with
// duplicate context-free rules, a contextual row, a deadkey, and terminal rules.

import { ruleContextElements } from "@keyboard-studio/contracts";
import type { IRRule, KeyboardIR, LayerCombo } from "@keyboard-studio/contracts";
import { emitRule } from "../codec/emit.js";
import { parse } from "../codec/parse.js";

export const KMN = `store(&VERSION) '10.0'
store(&NAME) 'layout-ops-test'
store(&TARGETS) 'any'
begin Unicode > use(main)

group(main) using keys

+ [K_A] > 'a'
+ [K_A] > 'x'
+ [SHIFT K_A] > 'A'
+ [K_B] > 'b'
+ [K_QUOTE] > dk(0001)
dk(0001) + [K_A] > 'á'
'q' + [K_B] > 'Q'
match > use(tail)

group(tail)
`;

export function parseKmn(text: string = KMN): KeyboardIR {
  return parse(text, "layout-ops-test").ir;
}

export function entryRules(ir: KeyboardIR): IRRule[] {
  const g = ir.groups.find((x) => x.name === "main");
  if (g === undefined) throw new Error("fixture: no main group");
  return g.rules;
}

/** Emitted lines of the context-free rules for a slot, in group order. */
export function slotLines(ir: KeyboardIR, vkey: string, layer: LayerCombo): string[] {
  const want = new Set<string>(layer);
  return entryRules(ir)
    .filter((r) => {
      const els = ruleContextElements(r);
      const el = els[0];
      return (
        els.length === 1 &&
        el !== undefined &&
        el.kind === "vkey" &&
        el.name === vkey &&
        el.modifiers.length === want.size &&
        el.modifiers.every((m) => want.has(m))
      );
    })
    .map((r) => emitRule(r, true));
}
