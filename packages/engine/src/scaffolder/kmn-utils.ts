/**
 * Shared KMN text-emission utilities used across scaffolder mutations.
 */

import type { KeyboardIR, IRStore } from "@keyboard-studio/contracts";

/**
 * Escape straight apostrophes to RIGHT SINGLE QUOTATION MARK (U+2019).
 * KMN single-quoted strings have no escape sequence; U+2019 is the safe
 * typographic substitute that the compiler accepts as a literal character.
 */
export function kmnStringEscape(s: string): string {
  return s.replace(/'/g, "’");
}

/**
 * Find a system store by name (case-insensitive).
 *
 * @param ir    The KeyboardIR to search.
 * @param name  Store name to match (e.g. "NAME", "CasedKeys").
 * @returns     The matching IRStore, or undefined if not found.
 */
export function findSystemStore(ir: KeyboardIR, name: string): IRStore | undefined {
  return ir.stores.find(
    (s) => s.isSystem && s.name.toUpperCase() === name.toUpperCase()
  );
}
