// useRemovalWarning — exposes the FR-006 "a listed language needs this letter"
// warning to the removal paths, on Copy and Open alike.
//
// Given the characters an author has just removed, it resolves the listed
// languages' main exemplar sets (through the engine's single sourcing path) and
// returns the warnings still on screen. Dismissing one keeps the removal and
// hides the notice for the rest of the session (component lifetime). It adds
// no timer: the lookup is a one-shot async resolve per language list, and it
// emits no diagnostics (decision D3 governs the validation cycle only).
//
// Languages: the author's target tag, plus the starting keyboard's own listed
// languages on Open (an opened keyboard's languages are its targets).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { isOpenMode } from "../lib/openMode.ts";
import {
  distinctLanguageTags,
  loadExemplarUnion,
  neededLettersByLanguage,
} from "../lib/openExpectedInventory.ts";
import {
  activeRemovalWarnings,
  dismissRemovalWarning,
  warningsForRemoval,
  type RemovalWarning,
} from "../lib/removalWarning.ts";

export interface UseRemovalWarningResult {
  /** Needed characters among `removed` the author has not dismissed. */
  warnings: readonly RemovalWarning[];
  /** Hide the warning for `char`; the removal itself stands. */
  dismiss: (char: string) => void;
}

export function useRemovalWarning(removed: readonly string[]): UseRemovalWarningResult {
  const bcp47 = useWorkingCopyStore((s) => s.identity?.bcp47);
  const instantiationMode = useWorkingCopyStore((s) => s.instantiationMode);
  const startLanguages = useWorkingCopyStore((s) => s.startKeyboard?.languages);

  const tagKey = useMemo(() => {
    const tags = [bcp47 ?? ""];
    if (isOpenMode(instantiationMode)) tags.push(...(startLanguages ?? []));
    return distinctLanguageTags(tags).join("\u0000");
  }, [bcp47, instantiationMode, startLanguages]);

  const [needed, setNeeded] = useState<ReadonlyMap<string, readonly string[]>>(() => new Map());
  useEffect(() => {
    const tags = tagKey === "" ? [] : tagKey.split("\u0000");
    if (tags.length === 0) {
      setNeeded(new Map());
      return;
    }
    let cancelled = false;
    loadExemplarUnion(tags)
      .then(({ sourcedByTag }) => {
        if (!cancelled) setNeeded(neededLettersByLanguage(tags, sourcedByTag));
      })
      .catch(() => {
        if (!cancelled) setNeeded(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [tagKey]);

  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const dismiss = useCallback((char: string) => {
    setDismissed((prev) => dismissRemovalWarning(prev, char));
  }, []);

  const warnings = useMemo(
    () => activeRemovalWarnings(warningsForRemoval(removed, needed), dismissed),
    [removed, needed, dismissed],
  );
  return { warnings, dismiss };
}
