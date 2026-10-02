// Mark-class grouping (spec 071, FR-010): group marks that behave alike so the
// mental-model confirmation is asked once per CLASS, not once per mark. Two
// signals, per the spec's Key Entities: how similarly the marks attach across
// base letters (attachment-set similarity over the attested stacks) and their
// shared linguistic function (canonical combining class from the pinned Unicode
// table — above-marks vs below-marks vs per-class fixed-position marks
// (Arabic) vs other — the only function signal derivable from Unicode data
// alone; finer splits like "quality accents" vs "tone marks" are calibration
// work, spec assumption "thresholds calibrated later"). A designer can still
// split an individual mark out of its class's answer downstream (the
// MentalModelDecision override map).

import type { ConfirmedAlphabet } from "@keyboard-studio/contracts";
import { getCCC } from "@keyboard-studio/contracts/unicode";
import { caseCounterpart } from "../character-discovery/casePair.js";

export interface MarkClass {
  /** Stable within a session (deterministic from the alphabet). */
  id: string;
  /** Plain-language label (never "Unicode"/"normalization" wording). */
  label: string;
  /** Member marks, first-appearance order. */
  marks: string[];
}

/**
 * Jaccard similarity threshold above which two same-function marks fall into
 * one class. Named constant — expected to be calibrated against real
 * orthographies after this feature ships (spec assumption).
 */
export const ATTACHMENT_SIMILARITY_THRESHOLD = 0.5;

/** Function bucket from the mark's canonical combining class (pinned Unicode table). */
type FunctionBucket = "above" | "below" | "other" | `fixed-${number}`;

/**
 * Canonical combining classes that render above the base (UAX #44 semantics):
 * 230 Above, 232 Above right, 234 Double above, 228 Above left,
 * 214 Above attached, 216 Above right attached.
 */
const ABOVE_CCC = new Set([214, 216, 228, 230, 232, 234]);

/**
 * Canonical combining classes that render below the base: 220 Below,
 * 218 Below left, 222 Below right, 233 Double below, 202 Below attached,
 * 200 Below left attached, 240 iota subscript (written below the base vowel).
 * UAX #44 defines no attached-below-right class.
 */
const BELOW_CCC = new Set([200, 202, 218, 220, 222, 233, 240]);

/** First and last Arabic fixed-position canonical combining classes (UAX #44). */
const ARABIC_FIXED_CCC_MIN = 27;
const ARABIC_FIXED_CCC_MAX = 35;

function bucketLabel(bucket: FunctionBucket): string {
  if (bucket === "above") return "Marks above the letter";
  if (bucket === "below") return "Marks below the letter";
  if (bucket === "other") return "Other marks";
  // `fixed-<ccc>`: each Arabic fixed-position class is its own bucket.
  return `Fixed-position marks (position class ${bucket.slice("fixed-".length)})`;
}

function bucketOf(mark: string): FunctionBucket {
  // Canonical combining class from the pinned Unicode table (spec 082,
  // FR-021) — the single authoritative source; new hand-rolled codepoint
  // ranges are forbidden. This retires the v1 gap documented here before:
  // the old hand-rolled 0x0300–0x036F-style ranges approximated above/below
  // and got some wrong (U+035C "COMBINING DOUBLE BREVE BELOW", ccc 233, was
  // bucketed "above"), and every Arabic harakat merged into "other"
  // regardless of position.
  //
  // 230 → above, 220 (and its positional family) → below. Arabic
  // fixed-position classes 27–35 each get their own bucket so marks sharing
  // attachment sets still split by position (fatha ≠ kasra ≠ shadda),
  // dissolving the harakat merge problem without hand-rolled ranges.
  //
  // Remaining approximation, unchanged from v1: Hebrew fixed-position classes
  // (10–26), Thai/Lao/Tibetan fixed classes, overlays (1), nuktas (7), kana
  // voicing (8), and viramas (9) still land in "other", where classing relies
  // on attachment similarity alone.
  const cp = mark.codePointAt(0);
  if (cp === undefined) return "other";
  const ccc = getCCC(cp);
  if (ccc === undefined) return "other"; // unassigned codepoint: not a real mark
  if (ccc >= ARABIC_FIXED_CCC_MIN && ccc <= ARABIC_FIXED_CCC_MAX) {
    return `fixed-${ccc}`;
  }
  if (ABOVE_CCC.has(ccc)) return "above";
  if (BELOW_CCC.has(ccc)) return "below";
  return "other";
}

/**
 * Case-symmetric attestation. Every consumer of {@link attestedBasesOf} takes
 * the same pair so grouping, proposals and the treatment prefill agree about
 * which letters a mark was seen on.
 */
export interface AttestationCaseFold {
  /**
   * Treat attestation as case-symmetric: a mark seen on either case of a cased
   * letter counts as seen on both, when the other case is in the confirmed
   * alphabet. Pass the same gate that opens spec 049's lowercase-only display
   * (casing facet `cased` or `mixed`).
   */
  caseFold?: boolean;
  /** Locale for the case pairing (Turkic dotted/dotless I). */
  bcp47?: string;
}

/** The base's case counterpart, when folding is on and the counterpart is confirmed. */
function confirmedCounterpart(
  alphabet: ConfirmedAlphabet,
  fold: AttestationCaseFold,
): (base: string) => ReturnType<typeof caseCounterpart> {
  if (fold.caseFold !== true) return () => null;
  const bases = new Set(alphabet.bases);
  return (base) => {
    const pair = caseCounterpart(base, fold.bcp47);
    return pair !== null && bases.has(pair.counterpart) ? pair : null;
  };
}

/**
 * Attested base set per mark, from the order-preserving stacks. With
 * `caseFold`, each attested base also adds its confirmed case counterpart
 * (additive only: nothing is removed).
 */
export function attestedBasesOf(
  alphabet: ConfirmedAlphabet,
  fold: AttestationCaseFold = {},
): Map<string, Set<string>> {
  const counterpartOf = confirmedCounterpart(alphabet, fold);
  const byMark = new Map<string, Set<string>>();
  for (const mark of alphabet.marks) byMark.set(mark, new Set());
  for (const stack of alphabet.attestedStacks) {
    for (const mark of stack.marks) {
      const set = byMark.get(mark);
      if (set === undefined) continue;
      set.add(stack.base);
      const pair = counterpartOf(stack.base);
      if (pair !== null) set.add(pair.counterpart);
    }
  }
  return byMark;
}

/**
 * How many distinct LETTERS a set of attested bases covers: with `caseFold`,
 * one letter in two cases counts once, not twice. Without it, every base is
 * its own letter.
 */
export function attestedLetterCount(
  alphabet: ConfirmedAlphabet,
  set: ReadonlySet<string>,
  fold: AttestationCaseFold = {},
): number {
  const counterpartOf = confirmedCounterpart(alphabet, fold);
  return new Set(
    [...set].map((base) => {
      const pair = counterpartOf(base);
      return pair?.direction === "toLower" ? pair.counterpart : base;
    }),
  ).size;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

/**
 * Group the alphabet's marks into mark-classes: single-link clustering within
 * each function bucket, linking two marks when their attested base sets meet
 * {@link ATTACHMENT_SIMILARITY_THRESHOLD}. Deterministic: classes and members
 * keep first-appearance order; ids are `<bucket>-<n>` in emission order.
 *
 * Pass the same `fold` as `proposeAttachments`: otherwise a mark seen only on
 * `N` and a sibling seen only on `n` share no base and never link.
 */
export function groupMarkClasses(
  alphabet: ConfirmedAlphabet,
  fold: AttestationCaseFold = {},
): MarkClass[] {
  const attested = attestedBasesOf(alphabet, fold);
  const byBucket = new Map<FunctionBucket, string[]>();
  for (const mark of alphabet.marks) {
    const bucket = bucketOf(mark);
    const list = byBucket.get(bucket);
    if (list !== undefined) list.push(mark);
    else byBucket.set(bucket, [mark]);
  }

  const classes: MarkClass[] = [];
  for (const [bucket, marks] of byBucket) {
    // Single-link clustering over the bucket's marks.
    const clusters: string[][] = [];
    for (const mark of marks) {
      const markBases = attested.get(mark) ?? new Set<string>();
      const linked = clusters.filter((cluster) =>
        cluster.some(
          (member) =>
            jaccard(markBases, attested.get(member) ?? new Set()) >=
            ATTACHMENT_SIMILARITY_THRESHOLD,
        ),
      );
      if (linked.length === 0) {
        clusters.push([mark]);
      } else {
        // Merge every linked cluster plus the new mark into the first one.
        const [head, ...rest] = linked;
        if (head === undefined) continue;
        head.push(mark);
        for (const other of rest) {
          head.push(...other);
          clusters.splice(clusters.indexOf(other), 1);
        }
      }
    }
    clusters.forEach((cluster, i) => {
      const label = bucketLabel(bucket);
      classes.push({
        id: `${bucket}-${i + 1}`,
        label: clusters.length === 1 ? label : `${label} (group ${i + 1})`,
        marks: cluster,
      });
    });
  }
  return classes;
}
