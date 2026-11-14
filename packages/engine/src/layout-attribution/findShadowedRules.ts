// Rules that can never fire: an earlier rule in the same group with the same context and
// key element always matches first (shared by never-fires rows and review flag (c)).

import { ruleContextElements, ruleLhsKind } from "@keyboard-studio/contracts";
import type { ContextElement, KeyboardIR } from "@keyboard-studio/contracts";

function elementKey(el: ContextElement): string {
  if (el.kind === "vkey") return `v:${el.name}:${el.modifiers.map((m) => m.toUpperCase()).sort().join("+")}`;
  if (el.kind === "namedDeadkey") return `n:${el.name.toLowerCase()}`;
  return JSON.stringify(el);
}

export function findShadowedRules(ir: KeyboardIR): Array<{ ruleNodeId: string; shadowedBy: string }> {
  const out: Array<{ ruleNodeId: string; shadowedBy: string }> = [];
  for (const group of ir.groups) {
    const seen = new Map<string, string>();
    for (const rule of group.rules) {
      // match/nomatch rules have no key element; a bare transition is never "the same" as another.
      if (ruleLhsKind(rule) !== "input") continue;
      const key = ruleContextElements(rule).map(elementKey).join("\u0001");
      const earlier = seen.get(key);
      if (earlier !== undefined) out.push({ ruleNodeId: rule.nodeId, shadowedBy: earlier });
      else seen.set(key, rule.nodeId);
    }
  }
  return out;
}
