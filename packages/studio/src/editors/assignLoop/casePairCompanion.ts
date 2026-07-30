// casePairCompanion — the ONE case-pair proposal shared by all three
// placement mechanisms (physical key, cased combo / dead key, touch).
//
// When an author places a lowercase cased letter, its uppercase counterpart
// almost always belongs on the casing-parallel slot: the Shift/Caps of the
// same physical key, the uppercase form of the same combo, or the shift layer
// of the same touch layer. Per the defaults-first principle (spec v1.3.1 §3c,
// "Defaults are the product") the studio PROPOSES that pairing and the author
// confirms or dismisses it — never a silent auto-insert.
//
// Why this is a module and not three copies:
//   - FR-002 "no second casing path". `propose` is the sole caller of the
//     engine's `caseCounterpart` on this path, and `CasePairProposalInput` is
//     the proposal type MINUS `counterpart` — so a caller structurally cannot
//     smuggle in a locally-derived capital. "Zero new toUpperCase() on the
//     proposal path" is then a reviewable property, not a convention.
//   - FR-011 "the interaction reads identically regardless of mechanism".
//     One hook, one banner (CasePairProposalBanner.tsx), three consumers.
//
// The hook NEVER records anything. Each gallery owns its apply path and its
// confirm handler; this module only decides whether a pairing exists and
// holds the pending proposal.
//
// @see specs/051-uppercase-counterpart-suggestion/contracts/case-pair-proposal.md
// @see specs/051-uppercase-counterpart-suggestion/data-model.md

import { useCallback, useState } from "react";
import type {
  MechanismAssignment,
  MechanismRef,
} from "@keyboard-studio/contracts";
import { caseCounterpart } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import type { TouchLayerId } from "./touchBehavior.ts";

// ---------------------------------------------------------------------------
// Combo shapes (S-02 dead key, S-03 sequence)
//
// Case-shifting applies to the BASE/CONTENT letter and the output — never to
// the trigger/indicator. A shifted accent key would be a broken rule: the
// dead key is an accent selector, not a letter.
// ---------------------------------------------------------------------------

/** PATTERN_DEADKEY (S-02): trigger + accent, then a base letter. */
export interface DeadkeyCombo {
  kind: "deadkey";
  /** Unchanged in the parallel combo. */
  triggerKey: string;
  /** Unchanged in the parallel combo. */
  deadkeyName: string;
  /** Unchanged in the parallel combo. */
  accentChar: string;
  /** Case-shifted in the parallel combo. */
  baseLetter: string;
}

/** PATTERN_SEQUENCE (S-03): content letter followed by an indicator key. */
export interface SequenceCombo {
  kind: "sequence";
  /** `firstLetterOut` — case-shifted. Must be a single cased character. */
  content: string;
  /** `secondLetter` — unchanged (a physical key by construction). */
  indicator: string;
}

export type CasePairCombo = DeadkeyCombo | SequenceCombo;

// ---------------------------------------------------------------------------
// The proposal
// ---------------------------------------------------------------------------

interface CasePairProposalCommon {
  /** The lowercase character whose placement raised this proposal. */
  originalChar: string;
}

interface PhysicalProposalParts {
  mechanism: "physical";
  vkey: string;
  /** From `planShiftAssignment(ir, "main", vkey).capsHandling` — selects the
   *  confirm branch (a CAPS-handling key needs the combined quad, not a
   *  second `[CAPS K_X]` line; Layer-A Check #10). */
  capsHandling: boolean;
  /** Identity (object reference) of the assignment this was raised for. */
  baseAssignment: MechanismAssignment;
}

interface ComboProposalParts {
  mechanism: "combo";
  /** The SOURCE combo, as placed. */
  combo: CasePairCombo;
  /** Identity (object reference) of the assignment this was raised for. */
  baseAssignment: MechanismAssignment;
}

interface TouchProposalParts {
  mechanism: "touch";
  hostKey: string;
  /** Layer the parallel placement targets — always `casePairTouchLayer`'s
   *  output for the combo being edited (the editing combo plus SHIFT). */
  targetLayer: TouchLayerId;
  /** Identity (object reference) of the touch mechanism ref this was raised for. */
  baseRef: MechanismRef;
}

/**
 * A pending proposal. `counterpart` (and, for combos, `parallelCombo`) is
 * supplied by the hook from `caseCounterpart` alone — it is deliberately
 * absent from {@link CasePairProposalInput}.
 */
export type CasePairProposal = CasePairProposalCommon & {
  /** The uppercase counterpart, from `caseCounterpart()` only. */
  counterpart: string;
} & (
    | PhysicalProposalParts
    | (ComboProposalParts & {
        /** The source combo with its input side case-shifted — derived here so
         *  the confirm handler never re-derives a capital of its own. */
        parallelCombo: CasePairCombo;
      })
    | TouchProposalParts
  );

/** What a caller passes to `propose` — the proposal minus everything the hook
 *  derives from `caseCounterpart`. */
export type CasePairProposalInput = CasePairProposalCommon & {
  /**
   * Optional caller predicate for the "counterpart already placed" edge case
   * (spec §Edge Cases): given the derived counterpart, is it ALREADY produced
   * on the parallel slot? `true` raises nothing — a redundant proposal is
   * noise.
   *
   * It is a callback rather than a boolean because the counterpart is not
   * known until `caseCounterpart` has run, and `propose` is deliberately its
   * only caller (FR-002). Answering the question this way lets the gallery
   * inspect its own state without acquiring a second casing path.
   *
   * Never stored on the resulting proposal — it is an input-time gate only.
   */
  alreadyProduced?: (counterpart: string) => boolean;
} & (PhysicalProposalParts | ComboProposalParts | TouchProposalParts);

export interface UseCasePairCompanion {
  /** The pending proposal, or null. At most one at a time. */
  proposal: CasePairProposal | null;
  /**
   * Build and raise a proposal, or do nothing when the mechanism's suppression
   * conditions hold. Returns whether a proposal was raised. This is the ONLY
   * entry point — callers never construct a proposal literal.
   *
   * A suppressed propose leaves any already-pending proposal untouched, which
   * matches the shipping behaviour: applying an unrelated mechanism while a
   * banner is up does not disturb it.
   */
  propose: (input: CasePairProposalInput) => boolean;
  /** Clear without recording anything. */
  dismiss: () => void;
  /** Clear (the caller performs the record, if any). */
  clear: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * The shared case-pair proposal state. Reads the casing locale from the
 * working copy's identity itself (FR-009) so no caller has to plumb it.
 */
export function useCasePairCompanion(): UseCasePairCompanion {
  const [proposal, setProposal] = useState<CasePairProposal | null>(null);

  // Normalize "" → undefined: an identity with an empty tag is "no locale",
  // not "the empty locale". Same normalization the physical companion has
  // always done.
  const identityBcp47 = useWorkingCopyStore((s) => s.identity?.bcp47);
  const bcp47 =
    identityBcp47 !== undefined && identityBcp47 !== ""
      ? identityBcp47
      : undefined;

  const propose = useCallback(
    (input: CasePairProposalInput): boolean => {
      // The single casing source. `caseCounterpart` owns every guard that
      // decides whether a pairing exists at all — one code point, \p{Ll}/\p{Lu}
      // only, one-to-one, locale-aware — so caseless scripts, self-mapping
      // letters (ĸ) and multi-character expansions (ß, ﬃ) all land here as
      // null and raise nothing.
      const pair = caseCounterpart(input.originalChar, bcp47);
      if (pair === null || pair.direction !== "toUpper") return false;

      // Georgian: Unicode gives Mkhedruli a formal Mtavruli uppercase mapping,
      // but that mapping is a stylistic all-caps register, not a Shift
      // companion in ordinary Georgian orthography — Unicode case properties
      // say nothing about orthographic convention. The corpus backs this up:
      // basic_kbdgeo (../keyboards) maps every [SHIFT K_x] to the IDENTICAL
      // codepoint as its base rule, and this project's own facet classifier
      // independently labels it casing: "caseless", caps-handling:
      // notApplicable. Suppressed here rather than in `caseCounterpart` so the
      // engine's case-pair derivation stays a pure Unicode fact and the
      // orthographic-convention judgment call lives with the one caller that
      // turns it into an authored proposal.
      if (isOrthographicallyUnicameral(input.originalChar)) return false;

      // "Counterpart already placed" (spec §Edge Cases) — asked only now that
      // the counterpart exists, and stripped from what gets stored.
      const { alreadyProduced, ...parts } = input;
      if (alreadyProduced?.(pair.counterpart) === true) return false;

      if (parts.mechanism === "combo") {
        // The INPUT side must case-shift too: a parallel combo whose base
        // letter has no confident capital is not a combo we can propose.
        const parallelCombo = caseShiftCombo(parts.combo, bcp47);
        if (parallelCombo === null) return false;
        setProposal({ ...parts, counterpart: pair.counterpart, parallelCombo });
        return true;
      }

      setProposal({ ...parts, counterpart: pair.counterpart });
      return true;
    },
    [bcp47],
  );

  const dismiss = useCallback(() => setProposal(null), []);
  const clear = useCallback(() => setProposal(null), []);

  return { proposal, propose, dismiss, clear };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Scripts where Unicode's Lu/Ll case-pair machinery reports a formal
 * uppercase mapping that does NOT correspond to a Shift-layer relationship in
 * ordinary orthographic practice. Currently Georgian only — see the comment
 * at the `propose` call site for the corpus evidence. Add a script here only
 * on the same kind of evidence (a real keyboard whose Shift layer doesn't
 * case-shift it, ideally corroborated by the facet classifier), never on a
 * hunch; Cherokee is Unicode-bicameral in the same technical sense and is
 * deliberately NOT listed — it keeps proposing.
 */
function isOrthographicallyUnicameral(char: string): boolean {
  return /\p{Script=Georgian}/u.test(char);
}

/**
 * Case-shift a combo's input side through `caseCounterpart`, leaving the
 * trigger/indicator alone. Returns null when the input side has no confident
 * single-character uppercase counterpart — the caller then raises nothing.
 */
function caseShiftCombo(
  combo: CasePairCombo,
  bcp47: string | undefined,
): CasePairCombo | null {
  const source = combo.kind === "deadkey" ? combo.baseLetter : combo.content;
  const pair = caseCounterpart(source, bcp47);
  if (pair === null || pair.direction !== "toUpper") return null;

  return combo.kind === "deadkey"
    ? { ...combo, baseLetter: pair.counterpart }
    : { ...combo, content: pair.counterpart };
}
