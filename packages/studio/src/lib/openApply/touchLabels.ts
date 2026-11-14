// touchLabels -- patch key labels into a touch layout's own text.
//
// The engine's keycap-label step re-serialises the whole touch layout when it
// changes a label, so a file that is not in the engine's canonical layout
// would be rewritten wholesale (FR-010: only the affected keys may change).
// On Open the changed `text` values are located in the ORIGINAL text and only
// those string literals are replaced; every other byte stays. The text work is
// `patchTouchText` (touchText.ts); this keeps the guard that only labels differ.
import { patchTouchText } from "./touchText.ts";

type Seg = string | number;

/** Paths where two parsed JSON values differ, with both values. */
function diffs(a: unknown, b: unknown, path: Seg[] = []): { path: Seg[]; before: unknown; after: unknown }[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.flatMap((x, i) => diffs(x, b[i], [...path, i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap((k) =>
      diffs((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], [...path, k]),
    );
  }
  return [{ path, before: a, after: b }];
}

/**
 * `before` with only the label changes of `after` applied, byte for byte
 * elsewhere. Undefined when `after` differs in anything but key `text` values,
 * or the change cannot be placed in `before`.
 */
export function labelPatchedTouchText(before: string, after: string): string | undefined {
  if (before === after) return before;
  let a: unknown;
  let b: unknown;
  try {
    a = JSON.parse(before);
    b = JSON.parse(after);
  } catch {
    return undefined;
  }
  for (const d of diffs(a, b)) {
    if (d.path[d.path.length - 1] !== "text" || typeof d.after !== "string") return undefined;
    if (d.before !== undefined && typeof d.before !== "string") return undefined;
  }
  return patchTouchText(before, b);
}
