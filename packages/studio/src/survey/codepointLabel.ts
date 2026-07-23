// Compact multi-code-point chip label for the alphabet UI
// (specs/047-alphabet-inventory-categories, FR-014). A studio-local helper that
// leaves the locked contract util `toUPlusNotation` (which reads only
// codePointAt(0)) untouched — the multi-code-point rendering is scoped to the
// alphabet chips where the spec asks for it, not to every toUPlusNotation call
// site (FR-012).

export interface CodepointLabel {
  /** What the chip shows: "U+0061" for one code point, "U+018F+" for many. */
  label: string;
  /** Hover / accessible name: every code point, space-separated. */
  title: string;
}

function toU(ch: string): string {
  const cp = ch.codePointAt(0);
  const hex = cp === undefined ? "????" : cp.toString(16).toUpperCase().padStart(4, "0");
  return "U+" + hex;
}

/**
 * Build the code-point label for a grapheme.
 *
 * - Single code point  -> `{ label: "U+0061", title: "U+0061" }`.
 * - Multi code point    -> `{ label: "U+<first>+", title: "U+.. U+.. …" }`,
 *   e.g. `Ə́` (U+018F U+0301) -> `{ label: "U+018F+", title: "U+018F U+0301" }`.
 */
export function codepointLabel(grapheme: string): CodepointLabel {
  const codePoints = [...grapheme];
  const all = codePoints.map(toU);
  const title = all.join(" ");
  if (codePoints.length <= 1) {
    return { label: title, title };
  }
  return { label: `${all[0]}+`, title };
}
