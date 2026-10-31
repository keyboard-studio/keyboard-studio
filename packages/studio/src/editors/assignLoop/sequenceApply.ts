// sequenceApply -- the S-03 sequence builder's pure core (spec 107 FR-040).
//
// Lifted out of SequenceBuilderPanel so a headless caller types a content and
// an indicator and applies them through the same function the panel's Apply
// button calls. The panel (and the gallery) import from here; nothing in this
// module reads a store or holds state.

import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { resolveMessage } from "../../lib/i18nResolve.ts";
import type { MechanismAssignment, MechanismRef } from "@keyboard-studio/contracts";
import { resolveCharInput, type ResolveCharInputOptions } from "../../lib/charInput.ts";
import { charToVkey } from "../../lib/keyOptions.ts";
import { PATTERN_SEQUENCE, isSequenceAssignmentForChar } from "./patternIds.ts";


// ---------------------------------------------------------------------------
// partitionSequenceAssignment — splits `sessionAssignments` into this char's
// recorded PATTERN_SEQUENCE mechanisms and everything else. The underlying
// "does this assignment belong to `char`'s PATTERN_SEQUENCE bucket?"
// predicate (scope:"individual" + target === char + at least one
// PATTERN_SEQUENCE mechanism) is NOT reimplemented here — it is hoisted to
// `isSequenceAssignmentForChar` in ./patternIds.ts, the single source of
// truth every read site (this panel's existing-sequences memo,
// MechanismGallery's canGoNext / "Sequence recorded" badge) and every write
// site (workingCopyStore's unflagCharForSequence, MechanismGallery's
// handleRemoveCovered) derives from, so a future predicate tweak can't miss
// a call site. This function just wraps that predicate into the two-way
// split callers here need: `mechs` (this char's PATTERN_SEQUENCE refs,
// already flattened out of whichever assignment held them) and `rest`
// (every other assignment, untouched) — write sites splice their own
// rebuilt assignment back into `rest`; a read site only needs `mechs`.
// ---------------------------------------------------------------------------

export function partitionSequenceAssignment(
  sessionAssignments: MechanismAssignment[],
  char: string,
): { mechs: MechanismRef[]; rest: MechanismAssignment[] } {
  const existing = sessionAssignments.find((a) => isSequenceAssignmentForChar(a, char));
  const mechs =
    existing?.mechanisms.filter((m) => m.patternId === PATTERN_SEQUENCE) ?? [];
  const rest = sessionAssignments.filter((a) => !isSequenceAssignmentForChar(a, char));

  return { mechs, rest };
}

/** True when `char` already has at least one recorded PATTERN_SEQUENCE mechanism. */
export function hasSequenceForChar(
  sessionAssignments: MechanismAssignment[],
  char: string,
): boolean {
  return partitionSequenceAssignment(sessionAssignments, char).mechs.length > 0;
}

// ---------------------------------------------------------------------------
// Char-box resolve options — reuses the shared resolveCharInput/
// reflectCharInput helper (packages/studio/src/lib/charInput.ts).
// ---------------------------------------------------------------------------

// Content ("seqFirst") — the sequence's left-context box. NOT singleGrapheme:
// content may legitimately span several graphemes (a digraph/trigraph
// collapse, e.g. "ng"), per domain guidance.
export const SEQ_CONTENT_RESOLVE_OPTIONS: ResolveCharInputOptions = {
  multiToken: true,
  blockDelimiters: true,
};

// Indicator ("seqSecond") — a single keystroke. singleGrapheme is
// grapheme-aware (Intl.Segmenter), so a lone combining mark typed as the
// indicator is NOT hard-rejected — only more than one grapheme is.
//
// singleGraphemeReason is user-facing chrome (an error string), but this
// object is constructed at module scope where no useLingui() is available —
// buildSeqIndicatorResolveOptions(i18n) below builds the localized version
// per-render, called from the component (which has a live i18n instance).
// Takes an optional i18n + resolves via msg()/resolveMessage() rather than a
// bare `t` parameter — Lingui's macro tracks the specific binding introduced
// by useLingui(), so a re-bound `t` parameter is a distinct binding the
// extractor does not follow (see resolveMessage in lib/i18nResolve.ts).
export function buildSeqIndicatorResolveOptions(i18n?: I18n): ResolveCharInputOptions {
  return {
    multiToken: true,
    singleGrapheme: true,
    blockDelimiters: true,
    singleGraphemeReason: resolveMessage(i18n, msg({ id: "editor.sequences.indicatorSingleGraphemeReason", message: "Enter one indicator character." })),
  };
}

export interface SequenceApplied {
  /** `firstLetterOut` — the content letter, case-shifted in the parallel combo. */
  content: string;
  /** `secondLetter` — the indicator key; NEVER case-shifted. */
  indicator: string;
  /** Identity of the assignment that now carries this char's sequence bucket. */
  assignment: MechanismAssignment;
}

/** The outcome of typing a content and an indicator and pressing Apply. */
export type SequenceApplyOutcome =
  | { kind: "unresolved" }
  /** An identical (content, indicator) pair is already recorded: nothing to record. */
  | { kind: "noop" }
  | { kind: "record"; next: MechanismAssignment[]; applied: SequenceApplied };

/**
 * What Apply does for the typed `content` and `indicator`: resolve both boxes,
 * require the indicator to be a physical key, and add the sequence to `char`'s
 * multi_char_sequence assignment (deduplicating an identical pair). Pure: the
 * panel's handleApply records `next` and hands `applied` to the gallery.
 */
export function sequenceApplyFor(params: {
  char: string;
  content: string;
  indicator: string;
  sessionAssignments: MechanismAssignment[];
  /** The panel passes its localized options; a headless caller omits them. */
  indicatorOptions?: ResolveCharInputOptions;
}): SequenceApplyOutcome {
  const { char, content, indicator, sessionAssignments } = params;
  const indicatorOptions = params.indicatorOptions ?? buildSeqIndicatorResolveOptions();
  const contentValue = resolveCharInput(content, SEQ_CONTENT_RESOLVE_OPTIONS);
  const indicatorValue = resolveCharInput(indicator, indicatorOptions);
  if (!contentValue.ok || !indicatorValue.ok) return { kind: "unresolved" };
  if (charToVkey(indicatorValue.value) === null) return { kind: "unresolved" };

  // `char` (== MechanismGallery's currentChar) is used directly as the
  // sequence's collapsedChar/target with no per-method NFC guard here — it
  // does not need one. mergePhaseResults (packages/contracts/src/surveySession.ts)
  // NFC-normalizes every confirmedInventory entry before it ever reaches
  // session state, so lettersToAdd (useInventoryDiff) and therefore
  // currentChar are already NFC at the source. Every other method
  // (swap/deadkey/ralt — MechanismGallery.tsx) also uses currentChar
  // directly as `target` with no local normalize() call; this panel matches
  // that pattern rather than re-adding a sequence-only guard the retired
  // SequenceGallery.handleApply used to carry.
  const { mechs: existingMechs, rest } = partitionSequenceAssignment(sessionAssignments, char);

  // Dedup by (firstLetterOut, secondLetter) — an identical sequence is a
  // no-op rather than a duplicate ref.
  const alreadyRecorded = existingMechs.some(
    (m) =>
      m.slotValues?.["firstLetterOut"] === contentValue.value &&
      m.slotValues?.["secondLetter"] === indicatorValue.value,
  );
  if (alreadyRecorded) return { kind: "noop" };

  const newRef: MechanismRef = {
    patternId: PATTERN_SEQUENCE,
    strategyId: "S-03",
    slotValues: {
      firstLetterOut: contentValue.value,
      secondLetter: indicatorValue.value,
      collapsedChar: char,
    },
  };
  const assignment: MechanismAssignment = {
    scope: "individual",
    target: char,
    modality: "physical",
    mechanisms: [...existingMechs, newRef],
    source: "user",
  };
  return {
    kind: "record",
    next: [...rest, assignment],
    applied: { content: contentValue.value, indicator: indicatorValue.value, assignment },
  };
}
