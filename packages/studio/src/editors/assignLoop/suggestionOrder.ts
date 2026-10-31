// suggestionOrder — the order of the mechanism gallery's suggestion chips and
// the method the gallery pre-selects for a character (spec 106).
//
// Lifted out of MechanismGallery so a headless caller applies the same
// "top suggestion" and "pre-selected method" the chip row and the method
// card show. The component calls these; it holds no second copy.

import type {
  KeyboardIR,
  MechanismAssignment,
  ScriptClass,
} from "@keyboard-studio/contracts";
import type { PlacementSeedEntry } from "../../survey/placementSeeds.ts";
import type { ScoredCandidate } from "../../survey/placementRationale.ts";
import { proposeS02TriggerKey } from "./deadkeyPurpose.ts";
import { isGatedAccentCompositionCandidate } from "./siblingAccents.ts";

/**
 * The visible suggestion chips ordered by weighted score, best first. The
 * ranked list's own order is the stable tiebreak (Array.prototype.sort is
 * stable). The first entry is the chip the gallery offers as the top
 * suggestion for the character.
 */
export function orderVisibleSuggestions(
  visibleSuggestions: readonly PlacementSeedEntry[],
  suggestionScores: ReadonlyMap<PlacementSeedEntry, ScoredCandidate>,
): PlacementSeedEntry[] {
  return [...visibleSuggestions].sort(
    (a, b) =>
      (suggestionScores.get(b)?.total ?? 0) -
      (suggestionScores.get(a)?.total ?? 0),
  );
}

/** What the gallery pre-fills for a character before the author touches it. */
export interface MethodPreselection {
  /** The deadkey trigger proposed for the character (one deadkey per purpose). */
  proposedTriggerKey: string;
  /**
   * "deadkey" for a decomposable accented letter outside an abugida (defaults
   * first: the natural method is a deadkey); null leaves the default method.
   */
  method: "deadkey" | null;
  /** The base letter pre-filled on the deadkey card, or "" when `method` is null. */
  deadkeyBaseLetter: string;
}

export function preselectMethod(params: {
  currentChar: string;
  scriptClass: ScriptClass | undefined;
  sessionAssignments: readonly MechanismAssignment[];
  workingIr: KeyboardIR | null;
}): MethodPreselection {
  const { currentChar, scriptClass, sessionAssignments, workingIr } = params;
  const baseLetter = [...currentChar.normalize("NFD")][0] ?? "";
  const proposedTriggerKey = proposeS02TriggerKey({
    currentChar,
    baseLetter,
    sessionAssignments,
    workingIr,
  });
  return isGatedAccentCompositionCandidate(currentChar, scriptClass)
    ? { proposedTriggerKey, method: "deadkey", deadkeyBaseLetter: baseLetter }
    : { proposedTriggerKey, method: null, deadkeyBaseLetter: "" };
}
