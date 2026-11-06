// The contexts the keyboard uses ("after ..." views): literal contexts and deadkeys,
// each with the number of keys that take part in it.

import type { KeyboardIR, LayoutContext } from "@keyboard-studio/contracts";
import { classifyEntryRules } from "./entryRules.js";

function contextId(context: LayoutContext): string {
  return context
    .map((el) => (el.kind === "text" ? `t:${el.text}` : `d:${el.deadkeyId.toLowerCase()}`))
    .join("\u0001");
}

/**
 * Every non-empty literal context in the entry group, plus every deadkey a key or rule
 * produces (a deadkey with no rows yet is still a context an author can add rows to).
 * `keyCount` counts distinct key+layer pairs with a row in that context; a fan-out table
 * counts one per base character.
 */
export function listContexts(ir: KeyboardIR): Array<{ context: LayoutContext; keyCount: number }> {
  const contexts = new Map<string, { context: LayoutContext; keys: Set<string> }>();
  const add = (context: LayoutContext, key: string | null): void => {
    const id = contextId(context);
    let entry = contexts.get(id);
    if (entry === undefined) {
      entry = { context, keys: new Set() };
      contexts.set(id, entry);
    }
    if (key !== null) entry.keys.add(key);
  };

  for (const { rule, cls } of classifyEntryRules(ir)) {
    if (cls.fanout !== undefined) {
      for (const p of cls.fanout.pairs) add(cls.context, `fanout:${p.base}`);
      continue;
    }
    if (cls.context.length > 0) {
      for (const k of cls.keys) add(cls.context, `${k.vkey}|${k.layer.join("+")}`);
      if (cls.keys.length === 0) add(cls.context, null);
    }
    if ("output" in rule) {
      for (const el of rule.output) {
        if (el.kind === "deadkey") add([{ kind: "deadkey", deadkeyId: el.id.toString(16).toLowerCase().padStart(4, "0") }], null);
        else if (el.kind === "namedDeadkey") add([{ kind: "deadkey", deadkeyId: el.name }], null);
      }
    }
  }
  return [...contexts.values()].map((c) => ({ context: c.context, keyCount: c.keys.size }));
}
