// carveNeededSet — the ONE composition of "what characters does this
// orthography actually need?" as plain functions, lifted out of
// hooks/useCarveNeededSet.ts so the hook and the headless author (spec 107
// FR-040) compose the needed set through the same code.
//
// `composeCarveNeededSet` is the hook's derivation over plain data;
// `resolveCarveNeededSet` is the settled value the hook converges to: the
// same composition after the async CLDR/SLDR lookup has resolved.

import { deriveCarveNeededSet, normalizationFormForOutputForm } from "@keyboard-studio/engine";
import type { CharNormalizationForm } from "@keyboard-studio/engine";
import { nonAlphabetConfirmedInventory } from "@keyboard-studio/contracts";
import type { WorkingCopyState } from "../stores/workingCopyStore.ts";
import { neededCharsForLanguage } from "./services.ts";

type CarveSession = WorkingCopyState["session"];

/** The working-copy fields the needed set is derived from. */
export interface CarveNeededInputs {
  confirmedInventory: CarveSession["confirmedInventory"];
  alphabet: CarveSession["alphabet"];
  marksWorklist: CarveSession["marksWorklist"];
  marksOutputForm: CarveSession["marksOutputForm"];
  /** The resolved identity tag, or undefined before identity is set. */
  bcp47: string | undefined;
}

export interface CarveNeededSetResult {
  /**
   * The orthography's needed characters, normalized to {@link form}: the
   * marks-series tiered set (required primary + optional secondary) unioned
   * with non-alphabet confirmed inventory and, when resolvable, the language's
   * CLDR/SLDR exemplars.
   */
  neededSet: Set<string>;
  /**
   * The tiered/inventory slice alone, unnormalized — the "is there any signal
   * at all?" gate both surfaces use to decide whether to recommend anything.
   */
  tieredNeededSet: Set<string>;
  /**
   * The async CLDR/SLDR slice. `null` means "not yet resolved" or "no CLDR
   * locale for this language" — callers treat it exactly as "not supplied"
   * and fall back to inventory-only behaviour.
   */
  neededChars: Set<string> | null;
  /** NFC or NFD, per the marks series' whole-keyboard output-form decision. */
  form: CharNormalizationForm;
  /** The resolved identity tag, or undefined before identity is set. */
  bcp47: string | undefined;
  /** True once there is any signal to reason about (tiered entries or a resolved CLDR set). */
  hasSignal: boolean;
  /**
   * Composed characters for each `worklist.blockedCombinations` entry (#526
   * AC #3) — NOT unioned into `neededSet`/`tieredNeededSet` (a block-candidate
   * is never "needed"; unioning it there would shield it from removal, the
   * opposite of its purpose). Callers pass this straight through to
   * `recommendedRemovalChars`'s `blockCandidateChars` argument. Empty when the
   * worklist is absent/empty.
   */
  blockCandidateChars: Set<string>;
}

/**
 * Compose the needed set from the working copy's inputs and the CLDR/SLDR
 * slice (`null` while unresolved or when the language has no locale).
 *
 * The chosen whole-keyboard output form drives which Unicode normalization
 * form the comparison (produced vs. needed) normalizes BOTH sides to, so
 * "base-plus-mark" (decomposed) vs. "ready-made" (precomposed) changes what
 * counts as a match. Undefined (marks series skipped) degrades to NFC.
 */
export function composeCarveNeededSet(
  inputs: CarveNeededInputs,
  neededChars: Set<string> | null,
): CarveNeededSetResult {
  const form = normalizationFormForOutputForm(inputs.marksOutputForm);
  const carveNeeded = deriveCarveNeededSet({
    alphabet: inputs.alphabet,
    worklist: inputs.marksWorklist,
    ...(inputs.marksOutputForm !== undefined ? { outputForm: inputs.marksOutputForm } : {}),
  });
  const nonAlphabetConfirmed = nonAlphabetConfirmedInventory(inputs.confirmedInventory, inputs.alphabet);

  // The engine has already composed each blocked-combination pair into its
  // concrete grapheme; here we only re-normalize to `form`, as every other
  // member of the needed set is.
  const blockCandidateChars = new Set([...carveNeeded.blockCandidateChars].map((ch) => ch.normalize(form)));

  const tieredNeededSet = new Set([
    ...carveNeeded.requiredPrimary,
    ...carveNeeded.optionalSecondary,
    ...nonAlphabetConfirmed,
  ]);

  // Members are normalized to `form` at construction: this set is the
  // `coveringSet`/`needed` argument to isCharCoveredForLocale-based passes,
  // whose contract requires the covering set to already be in that form.
  const neededSet = new Set(
    [...(neededChars ? [...neededChars, ...tieredNeededSet] : tieredNeededSet)].map((ch) => ch.normalize(form)),
  );

  return {
    neededSet,
    tieredNeededSet,
    neededChars,
    form,
    bcp47: inputs.bcp47,
    hasSignal: tieredNeededSet.size > 0 || neededChars !== null,
    blockCandidateChars,
  };
}

/**
 * The needed set once the CLDR/SLDR lookup has settled, read from the working
 * copy's current state. A language with no tag, or whose lookup fails, settles
 * to inventory-only (`neededChars` null), as the hook does.
 */
export async function resolveCarveNeededSet(
  state: Pick<WorkingCopyState, "session" | "identity">,
): Promise<CarveNeededSetResult> {
  const bcp47 = state.identity?.bcp47;
  const neededChars = bcp47 ? await neededCharsForLanguage(bcp47).catch(() => null) : null;
  return composeCarveNeededSet(
    {
      confirmedInventory: state.session.confirmedInventory,
      alphabet: state.session.alphabet,
      marksWorklist: state.session.marksWorklist,
      marksOutputForm: state.session.marksOutputForm,
      bcp47,
    },
    neededChars,
  );
}
