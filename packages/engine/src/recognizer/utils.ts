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
