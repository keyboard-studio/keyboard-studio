// useConsistencyOnApply: raises consistency suggestions after an applied change
// (spec 111 US5, research R10).
//
// An Apply, from any code view or gallery, replaces the working copy's IR or
// touch layout. This hook watches those two values in Open mode, measures the
// before and after states, and offers follow-ups for what the change added or
// removed. No timer: it is a synchronous effect over the store change, so it
// adds nothing to the single validation debounce cycle (D3), and it produces
// suggestions, not diagnostics.
//
// Limit: the layer list is read from the touch layout (plus "default"); the
// visual keyboard file is not in this snapshot, so a desktop-only layer change
// is not reported.

import { useEffect, useRef } from "react";
import { parseTouchLayoutString } from "@keyboard-studio/contracts";

import {
  computeConsistencyDelta,
  suggestionsFromDelta,
  type ConsistencyInput,
} from "../lib/consistencySuggestions.ts";
import { collectLayerIds } from "../lib/collectDocLintInput.ts";
import { isOpenMode } from "../lib/openMode.ts";
import { decidedSuggestions } from "../lib/suggestionDispositions.ts";
import { useDecisionLogStore } from "../decisions/decisionLogStore.ts";
import { useSuggestedFixesStore } from "../stores/suggestedFixesStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

interface Snapshot {
  input: ConsistencyInput;
  touchJson: string | null;
}

export function useConsistencyOnApply(): void {
  const mode = useWorkingCopyStore((s) => s.instantiationMode);
  const startId = useWorkingCopyStore((s) => s.startKeyboard?.id ?? null);
  const ir = useWorkingCopyStore((s) => s.ir);
  const touchJson = useWorkingCopyStore((s) => s.touchLayoutJson);
  const previous = useRef<{ startId: string | null; snap: Snapshot } | null>(null);

  useEffect(() => {
    if (!isOpenMode(mode) || ir === null) {
      previous.current = null;
      useSuggestedFixesStore.getState().clear();
      return;
    }
    let touchLayout: ConsistencyInput["touchLayout"] = null;
    if (touchJson !== null) {
      try {
        touchLayout = parseTouchLayoutString(touchJson);
      } catch {
        touchLayout = null; // an unreadable layout contributes nothing
      }
    }
    const input: ConsistencyInput = {
      ir,
      touchLayout,
      layerIds: collectLayerIds(null, touchJson),
    };
    const before = previous.current;
    previous.current = { startId, snap: { input, touchJson } };

    // The first state of a starting point is the baseline, not a change.
    if (before === null || before.startId !== startId) {
      useSuggestedFixesStore.getState().clear();
      return;
    }
    if (before.snap.input.ir === ir && before.snap.touchJson === touchJson) return;

    const { delta, after } = computeConsistencyDelta(before.snap.input, input);
    const decided = decidedSuggestions(useDecisionLogStore.getState().record);
    useSuggestedFixesStore
      .getState()
      .offer(suggestionsFromDelta(delta, after).filter((f) => !decided.has(f.id)));
  }, [mode, startId, ir, touchJson]);
}
