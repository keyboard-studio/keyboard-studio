/**
 * US-QWERTY character → physical-key mapping and rule-key resolution, shared by
 * the construction classifiers that reason about which PHYSICAL keys a rule
 * handles (spec 041). Keyboards match a keystroke three ways — a positional
 * `[vkey]`, a character literal (`+ "a"`, matching the key that produces 'a'),
 * or a store match `any(store)` (matching every key the store enumerates) — and
 * for a per-physical-key facet (fallback-posture) all three must resolve to the
 * same physical-key vocabulary. Shift state is irrelevant: `[SHIFT K_1]` and
 * `K_1` are the same physical key, so shifted chars fold onto the base key.
 */

import type { ContextElement, IRStore, StoreItem } from "@keyboard-studio/contracts";

/**
 * US-QWERTY character (unshifted or shifted) → physical vkey name. Covers the
 * standard character-producing keys (the fall-through universe). Both glyphs on
 * a key fold onto the one physical key.
 */
export const US_CHAR_TO_KEY: ReadonlyMap<string, string> = new Map([
  // Letters — lower and upper fold onto the same key.
  ..."abcdefghijklmnopqrstuvwxyz".split("").map((c) => [c, `K_${c.toUpperCase()}`] as const),
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((c) => [c, `K_${c}`] as const),
  // Digit row, unshifted then shifted.
  ["1", "K_1"], ["2", "K_2"], ["3", "K_3"], ["4", "K_4"], ["5", "K_5"],
  ["6", "K_6"], ["7", "K_7"], ["8", "K_8"], ["9", "K_9"], ["0", "K_0"],
  ["!", "K_1"], ["@", "K_2"], ["#", "K_3"], ["$", "K_4"], ["%", "K_5"],
  ["^", "K_6"], ["&", "K_7"], ["*", "K_8"], ["(", "K_9"], [")", "K_0"],
  // Punctuation keys, unshifted then shifted.
  ["`", "K_BKQUOTE"], ["~", "K_BKQUOTE"],
  ["-", "K_HYPHEN"], ["_", "K_HYPHEN"],
  ["=", "K_EQUAL"], ["+", "K_EQUAL"],
  ["[", "K_LBRKT"], ["{", "K_LBRKT"],
  ["]", "K_RBRKT"], ["}", "K_RBRKT"],
  ["\\", "K_BKSLASH"], ["|", "K_BKSLASH"],
  [";", "K_COLON"], [":", "K_COLON"],
  ["'", "K_QUOTE"], ['"', "K_QUOTE"],
  [",", "K_COMMA"], ["<", "K_COMMA"],
  [".", "K_PERIOD"], [">", "K_PERIOD"],
  ["/", "K_SLASH"], ["?", "K_SLASH"],
]);

/** Extract the physical `K_…` vkey name from a raw store token (e.g. "[SHIFT K_1]" → "K_1"). */
function vkeyFromRaw(text: string): string | undefined {
  return /\bK_[A-Z0-9_]+/.exec(text)?.[0];
}

/** The physical key(s) a single store item enumerates as keystroke inputs. */
function keysFromStoreItem(item: StoreItem): string[] {
  switch (item.kind) {
    case "vkey":
      return [item.name];
    case "char": {
      const k = US_CHAR_TO_KEY.get(item.value);
      return k ? [k] : [];
    }
    case "raw": {
      // Modified vkeys (`[SHIFT K_1]`) parse to a raw token; recover the base key.
      const k = vkeyFromRaw(item.text);
      return k ? [k] : [];
    }
    default:
      return []; // deadkey / any — not a physical-key enumeration
  }
}

/**
 * The physical keys a rule's struck key matches. `key` is the last context
 * element (see {@link ruleKey}). Resolves a `[vkey]` to itself, a char literal
 * via {@link US_CHAR_TO_KEY}, and `any(store)` by enumerating the store's items.
 * `notany(store)` matches the complement (every key NOT in the store) — too
 * broad to enumerate as "handled", so it contributes nothing (conservative:
 * under-counts blocking rather than over-claiming it).
 */
export function physicalKeysForRuleKey(
  key: ContextElement | undefined,
  stores: ReadonlyMap<string, IRStore>,
): string[] {
  if (!key) return [];
  switch (key.kind) {
    case "vkey":
      return [key.name];
    case "char": {
      const k = US_CHAR_TO_KEY.get(key.value);
      return k ? [k] : [];
    }
    case "any": {
      const store = stores.get(key.storeRef);
      return store ? store.items.flatMap(keysFromStoreItem) : [];
    }
    default:
      return [];
  }
}
