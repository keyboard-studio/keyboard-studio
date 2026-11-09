// Key-scoped caps rewrite (spec 112, research R6): the transform `&CasedKeys`
// actually replaces. On the given keys, rules that test CAPS are deleted and
// the NCAPS token is removed from rules that test it (the rule is kept).

import type { KeyboardIR, IRRule } from "@keyboard-studio/contracts";

const isCaps = (m: string): boolean => m.toUpperCase() === "CAPS";
const isNcaps = (m: string): boolean => m.toUpperCase() === "NCAPS";

/** `keys` holds upper-cased names; source spelling (`K_oE2`) may differ. */
const inKeys = (keys: ReadonlySet<string>, name: string): boolean => keys.has(name.toUpperCase());

function testsCapsOn(rule: IRRule, keys: ReadonlySet<string>): boolean {
  return rule.context.some(
    (el) => el.kind === "vkey" && inKeys(keys, el.name) && el.modifiers.some(isCaps),
  );
}

/** Delete CAPS-testing rules and remove NCAPS tokens, on the given keys only. */
export function replaceCapsRules(ir: KeyboardIR, keys: ReadonlySet<string>): void {
  for (const group of ir.groups) {
    if (group.readonly) continue;
    group.rules = group.rules.filter((r) => !testsCapsOn(r, keys));
    for (const rule of group.rules) {
      rule.context = rule.context.map((el) =>
        el.kind === "vkey" && inKeys(keys, el.name) && el.modifiers.some(isNcaps)
          ? { ...el, modifiers: el.modifiers.filter((m) => !isNcaps(m)) }
          : el,
      );
    }
  }
}
