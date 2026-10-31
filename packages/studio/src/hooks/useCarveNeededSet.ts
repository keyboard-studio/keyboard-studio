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
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { neededCharsForLanguage } from "../lib/services.ts";
import { composeCarveNeededSet, type CarveNeededSetResult as ComposedCarveNeededSet } from "../lib/carveNeededSet.ts";

export interface CarveNeededSetResult extends ComposedCarveNeededSet {
  /**
   * False while the CLDR/SLDR lookup is still in flight, true once it has
   * settled either way (including "no locale match", which also yields a null
   * `neededChars`). The gallery does not need this — it annotates with
   * whatever signal it has and re-renders when more arrives. A surface that
   * must show the author a STABLE list to act on does: rendering before the
   * exemplars land would show letters that silently vanish a moment later.
   */
  neededCharsResolved: boolean;
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

  // The derivation itself is lib/carveNeededSet.ts's composeCarveNeededSet,
  // shared with the headless author (spec 107).
  const composed = useMemo(
    () => composeCarveNeededSet(
      { confirmedInventory, alphabet, marksWorklist, marksOutputForm, bcp47 },
      neededChars,
    ),
    [confirmedInventory, alphabet, marksWorklist, marksOutputForm, bcp47, neededChars],
  );

  return { ...composed, neededCharsResolved };
}
