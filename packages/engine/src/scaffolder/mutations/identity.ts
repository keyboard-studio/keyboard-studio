/**
 * IR mutation: identity propagation.
 *
 * Updates the &NAME, &COPYRIGHT, &VERSION, &KEYBOARDVERSION system stores
 * in the IR to reflect the new keyboard's identity, and mirrors those values
 * into ir.header for the survey/UI layer.
 *
 * Only existing stores are rewritten — missing stores are not created. This
 * matches the original text-level behaviour (applyKmnTransforms only rewrote
 * existing lines).
 */

import type { KeyboardIR, IRStore, StoreItem } from "@keyboard-studio/contracts";
import { kmnStringEscape } from "../kmn-utils.js";

/**
 * Convert a string to a StoreItem array of {kind:"char"} nodes.
 * Each Unicode code-point becomes one item.
 */
function stringToCharItems(s: string): StoreItem[] {
  return [...s].map((c) => ({ kind: "char" as const, value: c }));
}

/**
 * Mutate (shallow-clone) a KeyboardIR to propagate a new keyboard identity.
 *
 * The following system stores are updated when they already exist (case-insensitive
 * name match against `store.name`):
 *   - NAME        -> displayName (apostrophe-escaped)
 *   - COPYRIGHT   -> "Copyright © <year> <displayName>" (apostrophe-escaped)
 *   - VERSION     -> "1.0"
 *   - KEYBOARDVERSION -> "1.0"
 *
 * ir.header is also updated (unescaped values — the header holds clean Unicode
 * for the survey/UI layer; stores drive emit).
 *
 * @param ir          The source IR (not mutated in-place).
 * @param keyboardId  New keyboard identifier.
 * @param displayName Human-readable display name (raw, may contain apostrophes).
 * @returns           A new KeyboardIR with the stores and header updated.
 */
export function mutateIdentity(
  ir: KeyboardIR,
  keyboardId: string,
  displayName: string
): KeyboardIR {
  const year = new Date().getFullYear();
  const escapedName = kmnStringEscape(displayName);
  const copyright = `Copyright © ${year} ${escapedName}`;
  const version = "1.0";

  const updatedStores: IRStore[] = ir.stores.map((store) => {
    if (!store.isSystem) return store;
    const upperName = store.name.toUpperCase();
    switch (upperName) {
      case "NAME":
        return { ...store, items: stringToCharItems(escapedName) };
      case "COPYRIGHT":
        return { ...store, items: stringToCharItems(copyright) };
      case "VERSION":
        return { ...store, items: stringToCharItems(version) };
      case "KEYBOARDVERSION":
        return { ...store, items: stringToCharItems(version) };
      default:
        return store;
    }
  });

  return {
    ...ir,
    header: {
      ...ir.header,
      keyboardId,
      name: displayName,
      copyright: `Copyright © ${year} ${displayName}`,
      version,
      bcp47: [], // reset to empty; Phase A fills this later
    },
    stores: updatedStores,
  };
}
