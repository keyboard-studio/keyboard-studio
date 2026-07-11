import type { IRStore } from "@keyboard-studio/contracts";

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
