// Compact multi-code-point chip label for the alphabet UI
// (specs/047-alphabet-inventory-categories, FR-014). A studio-local helper that
// leaves the locked contract util `toUPlusNotation` (which reads only
// codePointAt(0)) untouched — the multi-code-point rendering is scoped to the
// alphabet chips where the spec asks for it, not to every toUPlusNotation call
// site (FR-012).

export interface CodepointLabel {
  /** The base (first) code point in U+XXXX notation, e.g. "U+018F". */
  base: string;
  /**
   * The extra code points beyond the first, as their literal characters (the
   * combining marks themselves), e.g. "́" for U+0301. Empty for a single-code-
   * point grapheme. The chip renders these as a bracketed "[+…]" affordance.
   */
  extras: string;
  /** Hover / accessible name: every code point, space-separated. */
  title: string;
}

function toU(ch: string): string {
  const cp = ch.codePointAt(0);
  const hex = cp === undefined ? "????" : cp.toString(16).toUpperCase().padStart(4, "0");
  return "U+" + hex;
}

/**
 * Break a grapheme's code-point label into its display parts (spec 047 FR-014).
 *
 * - Single code point -> `{ base: "U+0061", extras: "", title: "U+0061" }`.
 * - Multi code point   -> `{ base: "U+<first>", extras: "<remaining chars>",
 *   title: "U+.. U+.. …" }`, e.g. `Ə́` (U+018F U+0301) ->
 *   `{ base: "U+018F", extras: "́", title: "U+018F U+0301" }`.
 *
 * The chip shows `base` followed, when `extras` is non-empty, by a bracketed
 * `[+<extras>]` badge in a contrasting color; the full stack is on hover
 * (`title`).
 */
export function codepointLabel(grapheme: string): CodepointLabel {
  const codePoints = [...grapheme];
  const all = codePoints.map(toU);
  return {
    base: all[0] ?? "",
    extras: codePoints.slice(1).join(""),
    title: all.join(" "),
  };
}
