// contextToleranceCommit — committing a context-tolerance decision to the
// working copy (spec 078 FR-005a second half, FR-008). hooks/useContextToleranceApply.ts
// runs it when its inputs change; the headless scripted author (spec 107) calls
// the same functions. The working IR is written through `applyMutatePatch`
// against the manifest-declared CONTEXT_TOLERANCE_WRITES (the seam's
// containment check rejects anything else), and the persisted overlay the VFS
// projection replays into the preview and the download is written beside it.

import {
  applyContextToleranceOverlay,
  applyFacetTransform,
  removeContextToleranceOverlay,
  type ContextToleranceOverlay,
} from "@keyboard-studio/engine";

import { useWorkingCopyStore, type ContextToleranceState } from "../stores/workingCopyStore.ts";
import {
  getMarksTreatmentValue,
  recordMarksTreatmentValue,
  type MarksTreatmentValue,
} from "../survey/marks/marksValue.ts";
import { applyMutatePatch } from "../steps/mutateApply.ts";
import { CONTEXT_TOLERANCE_WRITES } from "../steps/contextToleranceWrites.ts";
import { applyContextToleranceDecision, contextTolerancePatch } from "./contextToleranceApply.ts";
import { loadContextToleranceEngine } from "./contextToleranceEngine.ts";
import type { ContextToleranceApplyNotes } from "../lint/ContextToleranceNotice.tsx";

const OVERLAY_OPS = { applyContextToleranceOverlay, removeContextToleranceOverlay };

/** Commit `next` (or its removal, with `null`) to the working IR and the overlay slice. */
export function commitOverlay(
  next: { fingerprint: string; acceptedSiteIds: string[]; overlay: ContextToleranceOverlay } | null,
): void {
  const store = useWorkingCopyStore.getState();
  const previous = store.contextToleranceOverlay?.overlay ?? null;
  if (store.ir !== null) {
    const patch = contextTolerancePatch(store.ir, previous, next?.overlay ?? null, OVERLAY_OPS);
    store.setWorkingIR(applyMutatePatch(store.ir, patch, CONTEXT_TOLERANCE_WRITES));
  }
  store.setContextToleranceOverlay(next);
}

/**
 * Record `appliedFingerprint` on the decision that carries it (spec 090
 * T023: the marks-treatment decision value — before T023 this mutated the
 * phase result). The re-record goes through the decide core with the
 * marks stub, whose apply is a no-op: stamping the fingerprint must not
 * re-run the mark guards.
 */
function markApplied(fingerprint: string): void {
  const value = getMarksTreatmentValue();
  if (value?.contextTolerance == null) return;
  if (value.contextTolerance.appliedFingerprint === fingerprint) return;
  recordMarksTreatmentValue({
    ...value,
    contextTolerance: { ...value.contextTolerance, appliedFingerprint: fingerprint },
  });
}

/**
 * Apply a recorded accept/partial decision against a ready analysis: verify the
 * fix, commit it to the working IR and the overlay slice, and stamp the
 * decision applied. Resolves the notes the author is shown (null when there is
 * nothing to say). The effect below runs it when its inputs change; the
 * headless scripted author (spec 107) calls it directly. Throws on an engine
 * error.
 */
export async function applyToleranceDecision(
  decision: NonNullable<MarksTreatmentValue["contextTolerance"]>,
  analysis: Extract<ContextToleranceState, { status: "ready" }>,
  isLive: () => boolean = () => true,
): Promise<ContextToleranceApplyNotes | null> {
  const engine = await loadContextToleranceEngine();
  const outcome = await applyContextToleranceDecision(decision, analysis, { engine, applyFacetTransform });
  // The effect that started this was cleaned up while it ran: its inputs moved on.
  if (!isLive()) return null;
  if (outcome.kind === "applied") {
    commitOverlay({
      fingerprint: decision.fingerprint,
      acceptedSiteIds: [...decision.acceptedSiteIds],
      overlay: outcome.overlay,
    });
    markApplied(decision.fingerprint);
    return outcome.staleSiteIds.length > 0 ? { staleRuleIds: outcome.staleSiteIds } : null;
  }
  if (outcome.kind === "stale") return { staleRuleIds: outcome.staleSiteIds };
  return { staleRuleIds: [], refusal: outcome.reason };
}
