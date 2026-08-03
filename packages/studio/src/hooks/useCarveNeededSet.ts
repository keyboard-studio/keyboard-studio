// useCarveNeededSet — the ONE derivation of "what characters does this
// orthography actually need?", shared by the pre-carve convenience question
// and the carve gallery itself.
//
// Extracted from CarveGallery so the two surfaces cannot drift. That matters
// concretely: the convenience question's whole job is to offer exactly the
// letters carve is about to propose removing. If the question computed
// "surplus" from a slightly different needed-set than the gallery does, it
// would either ask about letters carve was going to keep anyway (noise) or
// stay silent about letters carve then proposes (the defect the question
// exists to prevent).
//
// What this hook does NOT include: `session.retainedConvenienceChars`. Those
// are the ANSWER to the convenience question, and folding them in here would
// be circular — a kept letter would stop being offered the moment it was kept,
// so the author could never uncheck it again. The gallery unions them on top
// of this set at its own call site; the question reads this set raw.

import { useEffect, useMemo, useState } from "react";
import { composeCombo, deriveCarveNeededSet, normalizationFormForOutputForm } from "@keyboard-studio/engine";
import type { CharNormalizationForm } from "@keyboard-studio/engine";
import { nonAlphabetConfirmedInventory } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { neededCharsForLanguage } from "../lib/services.ts";

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
  /**
   * False while the CLDR/SLDR lookup is still in flight, true once it has
   * settled either way (including "no locale match", which also yields a null
   * `neededChars`). The gallery does not need this — it annotates with
   * whatever signal it has and re-renders when more arrives. A surface that
   * must show the author a STABLE list to act on does: rendering before the
   * exemplars land would show letters that silently vanish a moment later.
   */
  neededCharsResolved: boolean;
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
   * `recommendedRemovalChars`'s `blockCandidateChars` argument, which adds
   * these as ADDITIONAL removal-recommendation candidates without bypassing
   * any of that function's existing safety guards. Empty when the worklist is
   * absent/empty (S0-skip or pre-046 fallback) — a no-op union at the call
   * site, so behavior degrades to byte-identical pre-#526 output.
   */
  blockCandidateChars: Set<string>;
}

/**
 * Derive the carve needed-set from the current working-copy session.
 *
 * The CLDR/SLDR lookup is asynchronous (see `neededCharsForLanguage`), so the
 * returned `neededChars` starts `null` and fills in. It is reset to `null`
 * synchronously when the language changes, before the new fetch is kicked off
 * — otherwise an in-flight fetch would leave the previous language's set in
 * place and surplus would be computed against the wrong language until it
 * resolved. Degrading to inventory-only for that window is the safe fallback.
 */
export function useCarveNeededSet(): CarveNeededSetResult {
  const confirmedInventory = useWorkingCopyStore((s) => s.session.confirmedInventory);
  const alphabet = useWorkingCopyStore((s) => s.session.alphabet);
  const marksWorklist = useWorkingCopyStore((s) => s.session.marksWorklist);
  const marksOutputForm = useWorkingCopyStore((s) => s.session.marksOutputForm);
  const bcp47 = useWorkingCopyStore((s) => s.identity?.bcp47);

  // The chosen whole-keyboard output form drives which Unicode normalization
  // form the comparison (produced vs. needed) normalizes BOTH sides to, so
  // "base-plus-mark" (decomposed) vs. "ready-made" (precomposed) actually
  // changes what counts as a match. Undefined (marks series skipped) degrades
  // to NFC.
  const form = useMemo(
    () => normalizationFormForOutputForm(marksOutputForm),
    [marksOutputForm],
  );

  const carveNeeded = useMemo(
    () => deriveCarveNeededSet({
      alphabet,
      worklist: marksWorklist,
      ...(marksOutputForm !== undefined ? { outputForm: marksOutputForm } : {}),
    }),
    [alphabet, marksWorklist, marksOutputForm],
  );

  const nonAlphabetConfirmed = useMemo(
    () => nonAlphabetConfirmedInventory(confirmedInventory, alphabet),
    [confirmedInventory, alphabet],
  );

  // #526 AC #3: compose each blocked-combination pair into the same concrete
  // grapheme composeCombo produces everywhere else in this pipeline, then
  // normalize to `form` — the same normalization every other member of this
  // hook's sets receives, so a direct Set.has(ch) comparison against
  // recommendedRemovalChars' `produced` (already normalized to `form` there)
  // behaves consistently regardless of the chosen output form.
  const blockCandidateChars = useMemo(
    () => new Set(
      carveNeeded.blockCandidates.map((bc) => composeCombo(bc.base, [bc.mark], marksOutputForm).normalize(form)),
    ),
    [carveNeeded, marksOutputForm, form],
  );

  const tieredNeededSet = useMemo(
    () => new Set([
      ...carveNeeded.requiredPrimary,
      ...carveNeeded.optionalSecondary,
      ...nonAlphabetConfirmed,
    ]),
    [carveNeeded, nonAlphabetConfirmed],
  );

  const [neededChars, setNeededChars] = useState<Set<string> | null>(null);
  const [neededCharsResolved, setNeededCharsResolved] = useState(false);
  useEffect(() => {
    setNeededChars(null);
    // No language to look up is a SETTLED state, not a pending one — there is
    // nothing further to wait for, so consumers gated on `resolved` proceed
    // immediately on inventory-only signal rather than hanging forever.
    if (!bcp47) { setNeededCharsResolved(true); return; }
    setNeededCharsResolved(false);
    let cancelled = false;
    neededCharsForLanguage(bcp47)
      .then((result) => { if (!cancelled) { setNeededChars(result); setNeededCharsResolved(true); } })
      .catch(() => { if (!cancelled) { setNeededChars(null); setNeededCharsResolved(true); } });
    return () => { cancelled = true; };
  }, [bcp47]);

  // Members are normalized to `form` at construction: this set is the
  // `coveringSet`/`needed` argument to isCharCoveredForLocale-based passes,
  // whose contract requires the covering set to already be in that form.
  // Skipping this silently mismatches under NFD (base-plus-mark output).
  const neededSet = useMemo(
    () => new Set(
      [...(neededChars ? [...neededChars, ...tieredNeededSet] : tieredNeededSet)]
        .map((ch) => ch.normalize(form)),
    ),
    [neededChars, tieredNeededSet, form],
  );

  return {
    neededSet,
    tieredNeededSet,
    neededChars,
    neededCharsResolved,
    form,
    bcp47,
    hasSignal: tieredNeededSet.size > 0 || neededChars !== null,
    blockCandidateChars,
  };
}
