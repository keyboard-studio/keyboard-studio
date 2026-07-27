// Group identity helpers for the CharacterMapPane extraction — shared by
// CharacterMapPane.tsx (the "blocks my keyboard uses" / per-group hide toggle
// handler) and CharacterMapGroupSection.tsx (the group-render loop).

import type { CharacterMapGroup } from "../../lib/services.ts";

// Stable identity for a group — used as the React list key. Includes `script`
// because the multi-script grid can carry several groups that share a generic
// fallback block name (e.g. several scripts share the "Digits", "Punctuation",
// or "Combining marks" fallback labels; the letter fallback is script-qualified
// like "Latin letters"); without the script the key collides across scripts and
// React drops/merges same-key sections.
export function groupKey(group: CharacterMapGroup): string {
  return `${group.tier}-${group.script}-${group.block}`;
}

// DOM-id-safe derivation of groupKey() — used to pair the per-group Hide/Show
// button's aria-controls with the cell-grid div's id. groupKey() can contain
// spaces/punctuation (block names like "Combining Diacritical Marks"), which
// are legal in an HTML id but awkward; collapse anything outside
// [A-Za-z0-9_-] to a single hyphen so the id stays a plain token.
export function groupGridId(key: string): string {
  return `char-map-group-grid-${key.replace(/[^A-Za-z0-9_-]+/g, "-")}`;
}
