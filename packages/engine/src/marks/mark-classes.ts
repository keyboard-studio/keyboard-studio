// Mark-class grouping (spec 046, FR-010): group marks that behave alike so the
// mental-model confirmation is asked once per CLASS, not once per mark. Two
// signals, per the spec's Key Entities: how similarly the marks attach across
// base letters (attachment-set similarity over the attested stacks) and their
// shared linguistic function (approximated by canonical combining class —
// above-marks vs below-marks vs attached/other — the only function signal
// derivable from Unicode data alone; finer splits like "quality accents" vs
// "tone marks" are calibration work, spec assumption "thresholds calibrated
// later"). A designer can still split an individual mark out of its class's
// answer downstream (the MentalModelDecision override map).

import type { ConfirmedAlphabet } from "@keyboard-studio/contracts";

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

/** Function bucket approximated from where the mark sits relative to the base. */
type FunctionBucket = "above" | "below" | "other";

const BUCKET_LABEL: Record<FunctionBucket, string> = {
  above: "Marks above the letter",
  below: "Marks below the letter",
  other: "Other marks",
};

function bucketOf(mark: string): FunctionBucket {
  // ccc isn't exposed to JS; the standard combining ranges give a serviceable
  // approximation: U+0300–0315 + common above marks are rendered above,
  // U+0316–0333 + friends below. Anything unclassified lands in "other".
  //
  // v1 SCOPE: the above/below split is calibrated for alphabetic scripts
  // using the Combining Diacritical Marks blocks (Latin/Cyrillic/Greek-style
  // orthographies). Marks from other systems — Arabic harakat, Hebrew niqqud,
  // Thai/Lao/Khmer vowel and tone signs, Indic matras/anusvara — all fall
  // into the single "other" bucket, where classing relies on attachment
  // similarity alone and may merge functionally distinct marks. This is a
  // documented v1 gap (same posture as the EuroLatin/IPA gaps in spec.md
  // §7.5). The intended fix is a pinned UnicodeData ccc join (like the
  // DerivedAge.txt join in display-difficulty): ccc gives above (230), below
  // (220), and per-mark fixed-position classes for Arabic (27–35), which
  // dissolves the harakat merge problem without hand-rolled ranges.
  const cp = mark.codePointAt(0);
  if (cp === undefined) return "other";
  if (
    (cp >= 0x0300 && cp <= 0x0315) ||
    (cp >= 0x033d && cp <= 0x0344) ||
    cp === 0x0342 ||
    (cp >= 0x0350 && cp <= 0x0357) ||
    (cp >= 0x035b && cp <= 0x035c) ||
    (cp >= 0x0483 && cp <= 0x0487) ||
    (cp >= 0x1dc0 && cp <= 0x1dcf)
  ) {
    return "above";
  }
  if (
    (cp >= 0x0316 && cp <= 0x0333) ||
    (cp >= 0x0339 && cp <= 0x033c) ||
    (cp >= 0x0345 && cp <= 0x0345) ||
    (cp >= 0x0347 && cp <= 0x034e) ||
    (cp >= 0x0358 && cp <= 0x035a)
  ) {
    return "below";
  }
  return "other";
}

/** Attested base set per mark, from the order-preserving stacks. */
export function attestedBasesOf(alphabet: ConfirmedAlphabet): Map<string, Set<string>> {
  const byMark = new Map<string, Set<string>>();
  for (const mark of alphabet.marks) byMark.set(mark, new Set());
  for (const stack of alphabet.attestedStacks) {
    for (const mark of stack.marks) {
      const set = byMark.get(mark);
      if (set !== undefined) set.add(stack.base);
    }
  }
  return byMark;
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
 */
export function groupMarkClasses(alphabet: ConfirmedAlphabet): MarkClass[] {
  const attested = attestedBasesOf(alphabet);
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
      classes.push({
        id: `${bucket}-${i + 1}`,
        label:
          clusters.length === 1 ? BUCKET_LABEL[bucket] : `${BUCKET_LABEL[bucket]} (group ${i + 1})`,
        marks: cluster,
      });
    });
  }
  return classes;
}
