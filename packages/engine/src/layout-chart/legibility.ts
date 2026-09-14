/**
 * legibility — per-key rendering classification for the layout chart
 * (spec 076 T048, FR-016, research R2).
 *
 * SVG text rendering falls to the viewer's own fonts, so "no available glyph"
 * cannot be answered exactly without a font-coverage database. This module
 * approximates it cheaply with a declared script-block coverage table (the
 * testable contract FR-016 asks for) and handles the two cases that ARE exact:
 * a combining mark rendered standalone (needs a carrier to be visible at all)
 * and a key with no output on the layer (needs to look visibly different from
 * one that legitimately produces nothing vs. one this chart simply omitted).
 */

/** How one key's output text is rendered on the chart. */
export type KeyLegibilityKind = "normal" | "combining" | "no-glyph" | "empty";

/** Dotted-circle combining-mark carrier (FR-016). */
export const DOTTED_CIRCLE = "◌";

/** Generic fallback font stack every chart `<text>` element carries (FR-016). */
export const FALLBACK_FONT_STACK = "Noto Sans, Arial, sans-serif";

/** Smaller monospace face for the `U+XXXX` no-glyph label. */
export const NO_GLYPH_FONT_STACK = "Consolas, Menlo, monospace";

/** Keycap CSS class for an ordinary (non-empty) key. */
export const NORMAL_KEYCAP_CLASS = "ks-keycap";

/** Keycap CSS class for a key with no output on this layer — hatched/dimmed, distinct from a normal keycap. */
export const EMPTY_KEYCAP_CLASS = "ks-keycap-empty";

/** Label CSS class for the smaller monospace `U+XXXX` no-glyph label. */
export const NO_GLYPH_LABEL_CLASS = "ks-key-label-noglyph";

// Unicode general categories Mn (nonspacing mark), Mc (spacing combining
// mark), Me (enclosing mark) — FR-016's "combining mark" set.
const COMBINING_MARK_RE = /\p{M}/u;

/** One named script-block range in the coverage table. */
export interface ScriptCoverageRange {
  readonly name: string;
  readonly from: number;
  readonly to: number;
}

/**
 * Script blocks the chart font stack is assumed to cover (FR-016's testable
 * contract): Latin (Basic + Latin-1 Supplement + Extended-A/B), Greek,
 * Cyrillic (+ Supplement), and common punctuation/currency symbols. A code
 * point outside every range renders as its `U+XXXX` scalar name instead.
 *
 * Deliberately a small block table rather than a query against the generated
 * per-code-point script lookup (`facets/generated/scriptLookup.ts`): the
 * question here is "will a generic viewer font stack have a glyph", which is
 * a font-coverage approximation by Unicode block, not script identity — and
 * FR-016 makes THIS table the testable contract. Review-flagged follow-up: if
 * the coverage set grows past a handful of blocks, derive it from the
 * generated data instead of extending this list by hand.
 */
export const SCRIPT_COVERAGE_RANGES: readonly ScriptCoverageRange[] = [
  { name: "Basic Latin", from: 0x0000, to: 0x007f },
  { name: "Latin-1 Supplement", from: 0x00a0, to: 0x00ff },
  { name: "Latin Extended-A", from: 0x0100, to: 0x017f },
  { name: "Latin Extended-B", from: 0x0180, to: 0x024f },
  { name: "Spacing Modifier Letters", from: 0x02b0, to: 0x02ff },
  { name: "Greek and Coptic", from: 0x0370, to: 0x03ff },
  { name: "Cyrillic", from: 0x0400, to: 0x04ff },
  { name: "Cyrillic Supplement", from: 0x0500, to: 0x052f },
  { name: "General Punctuation", from: 0x2000, to: 0x206f },
  { name: "Currency Symbols", from: 0x20a0, to: 0x20cf },
];

/** True when `codePoint` falls in one of {@link SCRIPT_COVERAGE_RANGES}. */
export function isCodePointCovered(codePoint: number): boolean {
  return SCRIPT_COVERAGE_RANGES.some((range) => codePoint >= range.from && codePoint <= range.to);
}

/** `U+XXXX` scalar-name label for `codePoint` (uppercase hex, zero-padded to at least 4 digits). */
export function formatCodePointLabel(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

/** The classification + rendering directions for one key's output text. */
export interface KeyLegibilityResult {
  readonly kind: KeyLegibilityKind;
  /** What the chart's `<text>` element should contain. */
  readonly displayText: string;
  readonly keycapClassName: string;
  /** `""` when the label needs no special class beyond the keycap's own. */
  readonly labelClassName: string;
  readonly fontStack: string;
}

/**
 * Classify a key's output text for chart rendering (FR-016). Looks only at
 * the output's FIRST code point: a multi-character output (a digraph, a
 * base+mark sequence) is classified by its lead character, matching the
 * chart's one label per key regardless of output length.
 *
 *  - `undefined`/`""` (no output on this layer) -> `"empty"`: a distinct
 *    hatched/dimmed keycap, no label.
 *  - a leading combining mark -> `"combining"`: rendered on a
 *    {@link DOTTED_CIRCLE} carrier so it is visible standalone.
 *  - a leading code point outside {@link SCRIPT_COVERAGE_RANGES} ->
 *    `"no-glyph"`: its `U+XXXX` scalar name, in the smaller monospace face.
 *  - otherwise `"normal"`: the output text itself.
 */
export function classifyKeyLegibility(output: string | undefined): KeyLegibilityResult {
  const text = output ?? "";
  if (text === "") {
    return {
      kind: "empty",
      displayText: "",
      keycapClassName: EMPTY_KEYCAP_CLASS,
      labelClassName: "",
      fontStack: FALLBACK_FONT_STACK,
    };
  }

  const first = [...text][0] ?? "";
  const codePoint = first.codePointAt(0) ?? 0;

  if (COMBINING_MARK_RE.test(first)) {
    return {
      kind: "combining",
      displayText: `${DOTTED_CIRCLE}${text}`,
      keycapClassName: NORMAL_KEYCAP_CLASS,
      labelClassName: "",
      fontStack: FALLBACK_FONT_STACK,
    };
  }

  if (!isCodePointCovered(codePoint)) {
    return {
      kind: "no-glyph",
      displayText: formatCodePointLabel(codePoint),
      keycapClassName: NORMAL_KEYCAP_CLASS,
      labelClassName: NO_GLYPH_LABEL_CLASS,
      fontStack: NO_GLYPH_FONT_STACK,
    };
  }

  return {
    kind: "normal",
    displayText: text,
    keycapClassName: NORMAL_KEYCAP_CLASS,
    labelClassName: "",
    fontStack: FALLBACK_FONT_STACK,
  };
}
