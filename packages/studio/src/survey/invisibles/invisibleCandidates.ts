// invisibleCandidates — the pure candidate list behind the "Invisible
// characters" spine step (spec 075 US3, FR-013/FR-015).
//
// Three sources, deduped in this order:
//   1. the FIXED FIVE every author is asked about — ZWJ, ZWNJ, ZWSP, SOFT
//      HYPHEN, WORD JOINER (relevance "always");
//   2. the bidi allowlist — every `isBidiControlCodePoint` code point
//      (relevance "rtl"; the step shows this group expanded for a right-to-left
//      author and collapsed, never hidden, for everyone else);
//   3. carried-over format characters (relevance "carried-over") — a `\p{Cf}`
//      character an author already reached through the code-point field, or
//      already decided about on an earlier visit. Nothing an author entered is
//      ever dropped (FR-017).
//
// Every candidate carries a human-readable name (`invisibleCharLabel`), its
// `U+XXXX` notation and the id of a "you need this if…" statement. SC-005 is a
// test asserting all three are non-empty for every candidate.
//
// Pure: no store reads, no React. The step composes it from the draft store
// and the author's Phase A/B direction answer.

import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { isBidiControlCodePoint } from "@keyboard-studio/engine";
import { toUPlusNotation } from "@keyboard-studio/contracts";
import { invisibleCharLabel } from "../../lib/irToCarveNodes.ts";
import { isFormatChar } from "../charNormUtils.ts";

export type InvisibleRelevance = "always" | "rtl" | "carried-over";

export interface InvisibleCharacterCandidate {
  codePoint: number;
  /** `"U+200C"` — the key `invisibleDecisions` is indexed by. */
  notation: string;
  /** `invisibleCharLabel(char)` — never empty. */
  label: string;
  /** `"survey.invisibles.need.u200c"` — resolves through `NEED_STATEMENTS`. */
  needStatementId: string;
  relevance: InvisibleRelevance;
}

/** The five format characters every author is asked about, in offer order. */
export const FIXED_INVISIBLE_CODE_POINTS: readonly number[] = Object.freeze([
  0x200d, // ZERO WIDTH JOINER
  0x200c, // ZERO WIDTH NON-JOINER
  0x200b, // ZERO WIDTH SPACE
  0x00ad, // SOFT HYPHEN
  0x2060, // WORD JOINER
]);

/**
 * Every code point `isBidiControlCodePoint` accepts, in code-point order —
 * derived from the predicate rather than listed twice, so the two cannot drift.
 */
export const BIDI_CONTROL_CODE_POINTS: readonly number[] = Object.freeze(
  [
    ...range(0x200b, 0x200f),
    ...range(0x202a, 0x202e),
    ...range(0x2066, 0x2069),
    0x061c,
    0xfeff,
  ].filter(isBidiControlCodePoint),
);

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let cp = from; cp <= to; cp++) out.push(cp);
  return out;
}

/** `0x200c` -> `"u200c"`; the suffix shared by the need-statement id and the answer questionId. */
export function invisibleIdSuffix(codePoint: number): string {
  return "u" + codePoint.toString(16).toLowerCase().padStart(4, "0");
}

/** `0x200c` -> `"survey.invisibles.need.u200c"`. */
export function needStatementIdFor(codePoint: number): string {
  return "survey.invisibles.need." + invisibleIdSuffix(codePoint);
}

/**
 * The "you need this if…" statement for every candidate the fixed and bidi
 * lists can produce, keyed by code point. Authored here (content-team text)
 * and rendered by the step through `i18n._`; a carried-over character with
 * no entry falls back to `survey.invisibles.need.carriedOver`.
 */
export const NEED_STATEMENTS: Readonly<Record<number, MessageDescriptor>> = {
  0x200d: msg({
    id: "survey.invisibles.need.u200d",
    message:
      "Joins two letters into a ligature or a connected form — Arabic, Devanagari and Sinhala keyboards often need it; it also joins emoji sequences.",
  }),
  0x200c: msg({
    id: "survey.invisibles.need.u200c",
    message:
      "Keeps two letters from joining — Persian and Urdu keyboards use it inside words; Indic scripts use it to show a half-form instead of a conjunct.",
  }),
  0x200b: msg({
    id: "survey.invisibles.need.u200b",
    message:
      "Marks a word boundary where the script writes no space, so long lines can wrap — Thai, Khmer, Lao and Burmese keyboards often need it.",
  }),
  0x00ad: msg({
    id: "survey.invisibles.need.u00ad",
    message:
      "Marks where a long word may be hyphenated at a line break; invisible unless the line actually breaks there.",
  }),
  0x2060: msg({
    id: "survey.invisibles.need.u2060",
    message:
      "Prevents a line break between two characters without adding any width — the modern replacement for U+FEFF inside text.",
  }),
  0x200e: msg({
    id: "survey.invisibles.need.u200e",
    message:
      "Forces neighbouring neutral characters (punctuation, digits) to read left-to-right inside right-to-left text.",
  }),
  0x200f: msg({
    id: "survey.invisibles.need.u200f",
    message:
      "Forces neighbouring neutral characters to read right-to-left — for example a question mark after a Latin word in Arabic or Hebrew text.",
  }),
  0x202a: msg({
    id: "survey.invisibles.need.u202a",
    message:
      "Starts an embedded left-to-right run inside right-to-left text; must be closed with U+202C. Largely superseded by the isolates below.",
  }),
  0x202b: msg({
    id: "survey.invisibles.need.u202b",
    message:
      "Starts an embedded right-to-left run inside left-to-right text; must be closed with U+202C. Largely superseded by the isolates below.",
  }),
  0x202c: msg({
    id: "survey.invisibles.need.u202c",
    message: "Ends the most recent embedding or override (U+202A, U+202B, U+202D, U+202E).",
  }),
  0x202d: msg({
    id: "survey.invisibles.need.u202d",
    message:
      "Forces every following character to display left-to-right regardless of its own direction, until U+202C. Rarely needed on a keyboard.",
  }),
  0x202e: msg({
    id: "survey.invisibles.need.u202e",
    message:
      "Forces every following character to display right-to-left until U+202C. Rarely needed on a keyboard, and often flagged by other software because it is abused.",
  }),
  0x2066: msg({
    id: "survey.invisibles.need.u2066",
    message:
      "Isolates a left-to-right run (an address, a product code) inside right-to-left text; close it with U+2069.",
  }),
  0x2067: msg({
    id: "survey.invisibles.need.u2067",
    message: "Isolates a right-to-left run inside left-to-right text; close it with U+2069.",
  }),
  0x2068: msg({
    id: "survey.invisibles.need.u2068",
    message:
      "Isolates a run whose direction is taken from its first strong letter; close it with U+2069.",
  }),
  0x2069: msg({
    id: "survey.invisibles.need.u2069",
    message: "Ends the most recent isolate (U+2066, U+2067, U+2068).",
  }),
  0x061c: msg({
    id: "survey.invisibles.need.u061c",
    message:
      "Makes neighbouring digits and punctuation follow Arabic-letter directionality — the Arabic-specific counterpart of U+200F.",
  }),
  0xfeff: msg({
    id: "survey.invisibles.need.ufeff",
    message:
      "Historically used to prevent a line break; today it is the byte-order mark, and U+2060 is preferred inside text.",
  }),
};

/** Fallback need statement for a carried-over character with no authored entry. */
export const CARRIED_OVER_NEED_STATEMENT: MessageDescriptor = msg({
  id: "survey.invisibles.need.carriedOver",
  message:
    "You added this invisible character by code point earlier; keep it selected if your keyboard should produce it.",
});

/** The statement for a candidate — its authored entry, or the carried-over fallback. */
export function needStatementFor(codePoint: number): MessageDescriptor {
  return NEED_STATEMENTS[codePoint] ?? CARRIED_OVER_NEED_STATEMENT;
}

export interface InvisibleCandidatesArgs {
  /** The author's writing direction, from the Phase A/B answers; `"unknown"` when unanswered. */
  direction: "rtl" | "ltr" | "unknown";
  /** Format characters already in the draft's `controls` bucket or already decided about. */
  carriedOver: readonly string[];
}

/**
 * The candidate list. `direction` does not add or remove candidates — the
 * bidi group is always offered (so every author's answers cover the same
 * set); it only tells the step whether to show that group expanded.
 */
export function invisibleCandidatesFor(args: InvisibleCandidatesArgs): InvisibleCharacterCandidate[] {
  // `args.direction` is deliberately unread here: it rides on the args so the
  // step passes one object through, but the LIST is direction-invariant (see
  // the docstring) — only the step's collapse state depends on it.
  const { carriedOver } = args;
  const out: InvisibleCharacterCandidate[] = [];
  const seen = new Set<number>();
  const push = (codePoint: number, relevance: InvisibleRelevance): void => {
    if (seen.has(codePoint)) return;
    seen.add(codePoint);
    const char = String.fromCodePoint(codePoint);
    out.push({
      codePoint,
      notation: toUPlusNotation(char),
      label: invisibleCharLabel(char) ?? `FORMAT CHARACTER (${toUPlusNotation(char)})`,
      needStatementId: needStatementIdFor(codePoint),
      relevance,
    });
  };
  for (const cp of FIXED_INVISIBLE_CODE_POINTS) push(cp, "always");
  for (const cp of BIDI_CONTROL_CODE_POINTS) push(cp, "rtl");
  for (const raw of carriedOver) {
    const ch = raw.normalize("NFC");
    if (!isFormatChar(ch)) continue;
    push(ch.codePointAt(0)!, "carried-over");
  }
  return out;
}
