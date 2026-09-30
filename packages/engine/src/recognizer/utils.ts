import type { IRStore, IRRule } from "@keyboard-studio/contracts";

/**
 * FR-021: a rule carrying `ownedByBehaviour` is behaviour-owned. Behaviour-owned
 * rules are never pattern candidates — the marker ALONE determines behaviour
 * ownership (no shape heuristics). Every pattern matcher skips them alongside
 * the `ownedByPattern` claimed-guard, so a behaviour-owned rule can never gain
 * an `ownedByPattern` stamp (FR-002 mutual exclusivity) and is never treated as
 * author content or as a carve target by recognition.
 *
 * Both-markers conflict (invalid per FR-002, rejected by the zod schema at
 * validation boundaries): if a rule somehow carries both markers in memory,
 * the behaviour marker wins candidacy deterministically — the rule is skipped
 * by pattern matchers and keeps its `ownedByBehaviour` stamp. The pre-existing
 * `assertOwnershipConsistency` invariant in index.ts remains authoritative for
 * the `ownedByPattern` stamp itself: a both-marked rule whose pattern stamp
 * dangles (no such pattern in `ir.recognizedPatterns`) throws exactly as any
 * dangling-stamp rule would. Recognition stays honest rather than silently
 * laundering an inconsistent stamp.
 */
export function isBehaviourOwned(rule: IRRule): boolean {
  return rule.ownedByBehaviour !== undefined;
}

/**
 * Convert a JS string to "U+XXXX" or "U+XXXX U+YYYY" (multi-codepoint) form.
 */
export function toUPlus(value: string): string {
  const parts: string[] = [];
  for (const cp of value) {
    const codePoint = cp.codePointAt(0);
    if (codePoint !== undefined) {
      parts.push("U+" + codePoint.toString(16).toUpperCase().padStart(4, "0"));
    }
  }
  return parts.join(" ");
}

/**
 * Concatenate the char items of an IRStore into a plain string.
 * Non-char items contribute an empty string.
 */
export function storeItemsToCharString(store: IRStore): string {
  return store.items
    .map((item) => (item.kind === "char" ? item.value : ""))
    .join("");
}

/**
 * Format a vkey modifier list as a space-separated prefix string.
 * Returns e.g. "SHIFT " (with trailing space) or "" when there are no modifiers.
 * Used to build rule context strings like "+ [SHIFT K_Q] > ...".
 */
export function formatVKeyModifiers(mods: string[]): string {
  return mods.length > 0 ? `${mods.join(" ")} ` : "";
}

/**
 * Format a deadkey id as "dk_XXXX" (uppercase hex, zero-padded to 4 digits).
 * e.g. 96 -> "dk_0060"
 */
export function formatDkName(id: number): string {
  return "dk_" + id.toString(16).toUpperCase().padStart(4, "0");
}
