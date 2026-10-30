// assignmentFromSuggestion — the MechanismAssignment values the mechanism
// gallery records, built as pure functions of their inputs.
//
// Lifted out of MechanismGallery's click handlers (a suggestion chip's
// Accept, the "Assign to a key" card's Apply, the deadkey card's Apply, and
// the displacement banner's confirm) so a headless caller records the same
// value the UI would. The handlers keep the side effects (recording,
// companion proposals, dismissals, resets) and call these for the value.

import type {
  KeyboardIR,
  MechanismAssignment,
} from "@keyboard-studio/contracts";
import { toUPlusSequence } from "@keyboard-studio/contracts";
import {
  buildShiftRuleLines,
  buildStartRuleLines,
  canonicalizeCombo,
  comboToKeySpec,
  planShiftAssignment,
  type ModifierToken,
} from "@keyboard-studio/engine";
import {
  resolveKeyPickerSelection,
  resolvedVkeyOf,
  type KeyPickerResolution,
  type KeyPickerResolveOptions,
} from "../../lib/charInput.ts";
import type { PlacementSeedEntry } from "../../survey/placementSeeds.ts";
import { slotKeyFor, type SlotOccupant } from "../../survey/slotOccupancy.ts";
import {
  formatDeadkeyEscapes,
  proposeS02TriggerKey,
  rememberedDeadkeyEscapes,
  resolveS02DeadkeyIdentity,
  s02BaseClash,
  sessionDeadkeys,
} from "./deadkeyPurpose.ts";
import { PATTERN_DEADKEY, PATTERN_RALT, PATTERN_SWAP } from "./patternIds.ts";

// The S-02 deadkey trigger's resolved custom character is reused as
// `accentChar` — the deadkey's own literal output — so it needs the same
// delimiter guard as the character boxes, unlike the SWAP/RALT/touch
// host-key pickers (which resolve solely to a K_ vkey id).
export const TRIGGER_KEY_RESOLVE_OPTIONS: KeyPickerResolveOptions = {
  blockDelimiters: true,
};

/**
 * Build the S-02 (deadkey) {@link MechanismAssignment} shape — shared by the
 * manual deadkey method, the S-02 suggestion accept, and the case-pair
 * companion confirm, so the write paths cannot drift on this mechanism's
 * slotValues shape (see docs/design-notes/mechanism-gallery-flow.md's
 * "Method -> assignment" seam).
 *
 * The deadkeyName/accentChar values come from `resolveS02DeadkeyIdentity`
 * (the S-02 id/allocation seam) for new mints; the companion reuses the
 * proposal's preserved identity. This builder never derives an id.
 */
export function buildDeadkeyAssignment(params: {
  currentChar: string;
  baseLetter: string;
  triggerVkey: string;
  deadkeyName: string;
  accentChar: string;
  /** Set only on a deadkey's FIRST placement (see deadkeyPurpose.ts's trigger escapes). */
  escapes?: string | undefined;
}): MechanismAssignment {
  const { currentChar, baseLetter, triggerVkey, deadkeyName, accentChar, escapes } = params;
  return {
    scope: "individual",
    target: currentChar,
    modality: "physical",
    mechanisms: [
      {
        patternId: PATTERN_DEADKEY,
        strategyId: "S-02",
        slotValues: {
          triggerKey: triggerVkey,
          deadkeyName,
          baseLetters: baseLetter,
          accentedForms: currentChar,
          accentChar,
          ...(escapes !== undefined ? { escapes } : {}),
        },
      },
    ],
    source: "user",
  };
}

/**
 * The `escapes` value for a deadkey about to be placed on `triggerVkey`: the
 * remembered choice when the trigger has no session deadkey yet, else
 * undefined (that deadkey already chose). AltGr drops out when AltGr + the
 * trigger already types something.
 */
export function newTriggerEscapes(
  triggerVkey: string,
  sessionAssignments: readonly MechanismAssignment[],
  slotOccupancy: ReadonlyMap<string, SlotOccupant>,
): string | undefined {
  if (sessionDeadkeys(sessionAssignments).has(triggerVkey)) return undefined;
  const escapes = rememberedDeadkeyEscapes(sessionAssignments);
  if (slotOccupancy.has(slotKeyFor(triggerVkey, ["RALT"]))) escapes.delete("altgr");
  return formatDeadkeyEscapes(escapes);
}

/** A deadkey placement: the assignment plus the identity its companion reuses. */
export interface DeadkeyPlacement {
  assignment: MechanismAssignment;
  triggerVkey: string;
  deadkeyName: string;
  accentChar: string;
  baseLetter: string;
}

/**
 * The S-02 assignment for placing `currentChar` as trigger + `baseLetter`,
 * through the shared identity seam. Null when the trigger does not resolve.
 * The manual deadkey card and the S-02 suggestion accept both call this, so
 * the two write paths cannot drift.
 */
export function deadkeyPlacementFor(params: {
  currentChar: string;
  baseLetter: string;
  triggerKey: string;
  triggerResolution: KeyPickerResolution;
  workingIr: KeyboardIR | null;
  sessionAssignments: readonly MechanismAssignment[];
  slotOccupancy: ReadonlyMap<string, SlotOccupant>;
}): DeadkeyPlacement | null {
  const {
    currentChar,
    baseLetter,
    triggerKey,
    triggerResolution,
    workingIr,
    sessionAssignments,
    slotOccupancy,
  } = params;
  const triggerVkey = resolvedVkeyOf(triggerResolution);
  if (triggerVkey === null) return null;
  // The id + accent char come from the shared S-02 seam. accentChar keeps the
  // convention (the trigger key's literal character, so trigger+trigger
  // escapes back to the bare character); the id is the trigger's existing
  // session deadkey, else freshly allocated.
  const { deadkeyName, accentChar } = resolveS02DeadkeyIdentity({
    triggerKey,
    triggerResolution,
    workingIr,
    sessionAssignments,
  });
  return {
    assignment: buildDeadkeyAssignment({
      currentChar,
      baseLetter,
      triggerVkey,
      deadkeyName,
      accentChar,
      escapes: newTriggerEscapes(triggerVkey, sessionAssignments, slotOccupancy),
    }),
    triggerVkey,
    deadkeyName,
    accentChar,
    baseLetter,
  };
}

/**
 * The "Assign to a key" card's assignment: zero modifier layers is a plain S-01
 * base-key swap, a lone SHIFT is the shift plane (S-01 via the CAPS-aware
 * builder), anything else is an S-08 layer combo. `capsHandling` is the
 * key's property, returned for the case-pair companion. Null when the combo
 * cannot be canonicalized.
 */
export function swapAssignmentFor(params: {
  currentChar: string;
  vkey: string;
  chosenTokens: readonly ModifierToken[];
  workingIr: KeyboardIR | null;
}): { assignment: MechanismAssignment; capsHandling: boolean } | null {
  const { currentChar, vkey, chosenTokens, workingIr } = params;
  const s01 = (kmnRules: string): MechanismAssignment => ({
    scope: "individual",
    target: currentChar,
    modality: "physical",
    mechanisms: [{ patternId: PATTERN_SWAP, strategyId: "S-01", slotValues: { kmnRules } }],
    source: "user",
  });
  const keyCapsHandling = (): boolean =>
    workingIr !== null ? planShiftAssignment(workingIr, "main", vkey).capsHandling : false;

  if (chosenTokens.length === 0) {
    // capsHandling is a property of the KEY — a key that already carries
    // explicit CAPS/NCAPS rules needs a CAPS-aware pair (Layer-A Check #10).
    const capsHandling = keyCapsHandling();
    const kmnRules = buildStartRuleLines(vkey, currentChar, { capsHandling }).join("\n");
    return { assignment: s01(kmnRules), capsHandling };
  }
  if (chosenTokens.length === 1 && chosenTokens[0] === "SHIFT") {
    const capsHandling = keyCapsHandling();
    const kmnRules = buildShiftRuleLines(vkey, currentChar, { capsHandling }).join("\n");
    return { assignment: s01(kmnRules), capsHandling };
  }
  let altgrKeyList: string;
  try {
    altgrKeyList = comboToKeySpec(canonicalizeCombo([...chosenTokens]), vkey);
  } catch {
    // canonicalizeCombo only throws for a mutually-exclusive combo.
    return null;
  }
  return {
    assignment: {
      scope: "individual",
      target: currentChar,
      modality: "physical",
      mechanisms: [
        {
          patternId: PATTERN_RALT,
          strategyId: "S-08",
          slotValues: { altgrKeyList, altgrOutputList: currentChar },
        },
      ],
      source: "user",
    },
    capsHandling: false,
  };
}

/** Why a suggestion chip cannot be recorded; the chip is dismissed. */
export type SuggestionDismissReason =
  | "invalid-combo"
  | "no-base-letter"
  | "unknown-strategy";

export type SuggestionAssignment =
  | {
      kind: "assignment";
      assignment: MechanismAssignment;
      /**
       * S-08 only: the base placement's own modifiers (never including SHIFT),
       * for the ralt-layer case-pair companion; null otherwise.
       */
      raltCompanionModifiers: ModifierToken[] | null;
      /** S-02 only: the placement identity for the deadkey companion; null otherwise. */
      deadkey: DeadkeyPlacement | null;
    }
  | {
      /** The S-02 trigger is unresolved or clashes: prefill the deadkey card instead. */
      kind: "prefill-deadkey";
      triggerKey: string;
      baseLetter: string;
    }
  | { kind: "dismiss"; reason: SuggestionDismissReason };

/**
 * Turn an accepted suggestion chip into the assignment the gallery records.
 * `proposedTriggerKey` is the trigger the reset proposed for the character:
 * while the author left `triggerKey` untouched, an S-02 accept re-proposes
 * with the suggestion's own base letter so a clash on the shared deadkey is
 * avoided.
 */
export function assignmentFromSuggestion(params: {
  entry: PlacementSeedEntry;
  currentChar: string;
  sessionAssignments: readonly MechanismAssignment[];
  workingIr: KeyboardIR | null;
  slotOccupancy: ReadonlyMap<string, SlotOccupant>;
  triggerKey: string;
  triggerKeyCustomChar: string;
  proposedTriggerKey: string;
}): SuggestionAssignment {
  const {
    entry,
    currentChar,
    sessionAssignments,
    workingIr,
    slotOccupancy,
    triggerKey,
    triggerKeyCustomChar,
    proposedTriggerKey,
  } = params;
  const { vkey } = entry.topCandidate;

  if (entry.strategyId === "S-01") {
    return {
      kind: "assignment",
      assignment: {
        scope: "individual",
        target: currentChar,
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_SWAP,
            strategyId: "S-01",
            // Every code point: a character with no single ready-made form
            // (a base plus its mark) must reach the rule whole.
            slotValues: { kmnRules: `+ [${vkey}] > ${toUPlusSequence(currentChar)}` },
          },
        ],
        source: "user",
      },
      raltCompanionModifiers: null,
      deadkey: null,
    };
  }

  if (entry.strategyId === "S-08") {
    // Build from the candidate's OWN modifiers — never hardcode RALT. Falls
    // back to bare RALT when the candidate carries none.
    const candidateModifiers = entry.topCandidate.modifiers;
    const tokens = (
      candidateModifiers.length > 0 ? candidateModifiers : ["RALT"]
    ) as ModifierToken[];
    let altgrKeyList: string;
    try {
      altgrKeyList = comboToKeySpec(canonicalizeCombo(tokens), vkey);
    } catch {
      return { kind: "dismiss", reason: "invalid-combo" };
    }
    return {
      kind: "assignment",
      assignment: {
        scope: "individual",
        target: currentChar,
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_RALT,
            strategyId: "S-08",
            slotValues: { altgrKeyList, altgrOutputList: currentChar },
          },
        ],
        source: "user",
      },
      // A candidate that already carries SHIFT is itself the uppercase
      // case-pair fallback, so it is the companion — no further proposal.
      raltCompanionModifiers: tokens.includes("SHIFT") ? null : tokens,
      deadkey: null,
    };
  }

  if (entry.strategyId === "S-02") {
    const baseLetter = entry.topCandidate.baseLetter;
    if (baseLetter === undefined || baseLetter.length === 0) {
      return { kind: "dismiss", reason: "no-base-letter" };
    }
    const acceptTriggerKey =
      triggerKey === proposedTriggerKey
        ? proposeS02TriggerKey({ currentChar, baseLetter, sessionAssignments, workingIr })
        : triggerKey;
    const triggerResolution = resolveKeyPickerSelection(
      acceptTriggerKey,
      triggerKeyCustomChar,
      TRIGGER_KEY_RESOLVE_OPTIONS,
    );
    const resolvedTriggerVkey = resolvedVkeyOf(triggerResolution);
    if (
      resolvedTriggerVkey === null ||
      s02BaseClash({
        triggerKey: resolvedTriggerVkey,
        baseLetter,
        currentChar,
        sessionAssignments,
      }) !== null
    ) {
      return { kind: "prefill-deadkey", triggerKey: acceptTriggerKey, baseLetter };
    }
    const placement = deadkeyPlacementFor({
      currentChar,
      baseLetter,
      triggerKey: acceptTriggerKey,
      triggerResolution,
      workingIr,
      sessionAssignments,
      slotOccupancy,
    });
    // resolvedTriggerVkey is non-null above, so the placement resolves.
    if (placement === null) return { kind: "prefill-deadkey", triggerKey: acceptTriggerKey, baseLetter };
    return {
      kind: "assignment",
      assignment: placement.assignment,
      raltCompanionModifiers: null,
      deadkey: placement,
    };
  }

  return { kind: "dismiss", reason: "unknown-strategy" };
}

/**
 * The demotion assignment for `targetChar` under a displacement proposal: an
 * S-08 RAlt assignment on the SAME key (rank 1), or — only when the RAlt
 * slot was taken/unavailable at propose time — an S-02 deadkey assignment
 * (the demoted glyph is its own base letter: trigger + its old key's letter
 * produces it again). Null when the shape cannot be built (unresolvable
 * trigger / combo / base clash).
 */
export function demotionAssignmentFor(params: {
  targetChar: string;
  vkey: string;
  demotionMethod: "ralt" | "deadkey";
  sessionAssignments: readonly MechanismAssignment[];
  workingIr: KeyboardIR | null;
}): MechanismAssignment | null {
  const { targetChar, vkey, demotionMethod, sessionAssignments, workingIr } = params;
  if (demotionMethod === "ralt") {
    let altgrKeyList: string;
    try {
      altgrKeyList = comboToKeySpec(canonicalizeCombo(["RALT"]), vkey);
    } catch {
      return null;
    }
    return {
      scope: "individual",
      target: targetChar,
      modality: "physical",
      mechanisms: [
        {
          patternId: PATTERN_RALT,
          strategyId: "S-08",
          slotValues: { altgrKeyList, altgrOutputList: targetChar },
        },
      ],
      source: "user",
    };
  }
  // The demoted glyph is typed as trigger + itself — propose its trigger on
  // its own (one deadkey per purpose), not the current character's.
  const demotionTriggerKey = proposeS02TriggerKey({
    currentChar: targetChar,
    baseLetter: targetChar,
    sessionAssignments,
    workingIr,
  });
  const triggerResolution = resolveKeyPickerSelection(
    demotionTriggerKey,
    "",
    TRIGGER_KEY_RESOLVE_OPTIONS,
  );
  const resolvedTriggerVkey = resolvedVkeyOf(triggerResolution);
  if (resolvedTriggerVkey === null) return null;
  if (
    s02BaseClash({
      triggerKey: resolvedTriggerVkey,
      baseLetter: targetChar,
      currentChar: targetChar,
      sessionAssignments,
    }) !== null
  ) {
    return null;
  }
  const { deadkeyName, accentChar } = resolveS02DeadkeyIdentity({
    triggerKey: demotionTriggerKey,
    triggerResolution,
    workingIr,
    sessionAssignments,
  });
  return buildDeadkeyAssignment({
    currentChar: targetChar,
    baseLetter: targetChar,
    triggerVkey: resolvedTriggerVkey,
    deadkeyName,
    accentChar,
  });
}
