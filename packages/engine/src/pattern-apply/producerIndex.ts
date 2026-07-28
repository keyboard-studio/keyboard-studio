/**
 * buildProducerIndex — "how many places emit this character?" (spec 051, FR-003b).
 *
 * The collateral guard in the carve gallery needs to know whether a needed
 * character would become UNPRODUCIBLE if a coordinated drop took one of its
 * slots away. That question is "does this character have another producer?",
 * which is a fact about the IR — so it lives here, beside `analyzeStores` and
 * `collectCharContributors`, not in the studio (spec 051 NFR-004).
 *
 * What counts as a producer (one pass over `ir.groups[].rules[]`):
 *
 *   | Producer                                              | Counted |
 *   |-------------------------------------------------------|---------|
 *   | A rule whose ENTIRE NFC output is exactly the char     | +1      |
 *   | An OUTPUT-store slot (index()/outs() target) holding it | +1 per slot |
 *   | An any()-consumed INPUT-store slot                     | no      |
 *   | An S-02 trigger rule (isDeadkeyOnlyOutput)             | no      |
 *   | A notany() store slot                                  | no      |
 *   | An opaque RawKmnFragment                               | no      |
 *
 * The input-side exclusion is the whole point: `collectCharContributors`
 * deliberately merges input and output slots (a *removal* must reach every
 * store a char appears in), but a *producer count* must not — an any()-consumed
 * store holds things you TYPE, not things the keyboard EMITS (spec 051 FR-002).
 *
 * Opaque fragments are not counted, and are unreachable in practice: any blocked
 * contributor shields a trim candidate outright before the producer-count test
 * runs. Counting them would be unsound — the codec cannot statically confirm
 * what an opaque fragment emits.
 *
 * Complexity: O(rules + store items), computed ONCE per IR. Callers must hoist
 * it alongside the existing `analyzeStores` hoist; computing it per candidate
 * character would make the proposal loop O(chars x rules) (spec 051 invariant D4).
 *
 * Pure, browser-safe, no I/O.
 */

import type { KeyboardIR, IRStore } from "@keyboard-studio/contracts";
import { isDeadkeyOnlyOutput } from "../shared/rule-shape.js";

/** NFC character (as produced) -> number of distinct places that produce it. */
export type ProducerIndex = ReadonlyMap<string, number>;

/**
 * Count the producers of every character the keyboard emits.
 *
 * Keys are NFC-normalized exactly as `collectCharContributors` normalizes its
 * target, so `producerIndex.get(ch)` and `collectCharContributors(ir, ch)` speak
 * the same language. On a keyboard with no input-store occurrences the count
 * equals `ruleNodeIds.length + storeSlotIds.length`.
 *
 * @param ir The KeyboardIR to scan.
 * @returns  A read-only char -> producer-count map.
 */
export function buildProducerIndex(ir: KeyboardIR): ProducerIndex {
  const counts = new Map<string, number>();

  const storeMap = new Map<string, IRStore>(ir.stores.map((s) => [s.name, s]));

  // A store slot is one producer no matter how many rules index() into it —
  // the slot is the surgical unit, so counting per rule would double-count a
  // store that is fanned out from two keys.
  const seenStoreSlotIds = new Set<string>();

  const bump = (ch: string) => {
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
  };

  for (const group of ir.groups) {
    for (const rule of group.rules) {
      // S-02 trigger rules emit a deadkey token, not a glyph. Excluded for the
      // same reason `collectCharContributors` skips them.
      if (isDeadkeyOnlyOutput(rule)) continue;

      const outEls = rule.output as { kind: string; value?: string; storeRef?: string }[];

      // (a) Output-store slots — index()/outs() targets. Every char item in the
      //     referenced store is emitted through this rule, so each matching slot
      //     is a producer of its own character.
      let storeMatched = false;
      for (const el of outEls) {
        if ((el.kind !== "index" && el.kind !== "outs") || el.storeRef === undefined) continue;
        const store = storeMap.get(el.storeRef);
        if (store === undefined) continue;
        storeMatched = true;
        for (let i = 0; i < store.items.length; i++) {
          const item = store.items[i];
          if (item === undefined || item.kind !== "char") continue;
          const slotId = `${store.nodeId}#${i}`;
          if (seenStoreSlotIds.has(slotId)) continue;
          seenStoreSlotIds.add(slotId);
          bump(item.value.normalize("NFC"));
        }
      }
      // A store-producing rule is not ALSO a whole-rule producer: the rule emits
      // the whole store's worth of characters, mirroring collectCharContributors.
      if (storeMatched) continue;

      // (b) Literal producer — the rule's entire output is exactly one character
      //     run. Partial producers (a char buried in a longer literal output) are
      //     not counted: they are `blocked`, not surgically removable, so the
      //     guard never gets to ask about them.
      const charVals = outEls.filter((el) => el.kind === "char").map((el) => el.value ?? "");
      if (charVals.length === 0 || charVals.length !== outEls.length) continue;
      bump(charVals.join("").normalize("NFC"));
    }
  }

  return counts;
}
