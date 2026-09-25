// useContextToleranceApply — the separate effect that applies a recorded
// context-tolerance decision (spec 078 FR-005a second half, FR-008, FR-009).
//
// Keyed off the decision the marks step recorded
// (`session.marksContextTolerance`) and the latest analysis:
//   - accept / partial, not yet applied for this decision: verify the fix
//     (lib/contextToleranceApply.ts), then commit it in two places at once —
//     the working IR, through `applyMutatePatch` against the manifest-declared
//     CONTEXT_TOLERANCE_WRITES (the seam's containment check rejects anything
//     else), and the persisted overlay the VFS projection replays into the
//     preview and the download. Then mark the decision applied.
//   - decline, or no decision: remove any applied fix the same way.
// Applying the same decision twice is a no-op: the applied overlay records the
// decision it was built for. No timer (D3): it runs when its inputs change.

import { useEffect, useRef, useState } from "react";
import {
  applyContextToleranceOverlay,
  applyFacetTransform,
  removeContextToleranceOverlay,
  type ContextToleranceOverlay,
} from "@keyboard-studio/engine";
import { devLog } from "@keyboard-studio/contracts/dev-log";

import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { applyMutatePatch } from "../steps/mutateApply.ts";
import { CONTEXT_TOLERANCE_WRITES } from "../steps/contextToleranceWrites.ts";
import { applyContextToleranceDecision, contextTolerancePatch } from "../lib/contextToleranceApply.ts";
import { loadContextToleranceEngine } from "../lib/contextToleranceEngine.ts";
import type { ContextToleranceApplyNotes } from "../lint/ContextToleranceNotice.tsx";

const OVERLAY_OPS = { applyContextToleranceOverlay, removeContextToleranceOverlay };

/** Commit `next` (or its removal, with `null`) to the working IR and the overlay slice. */
function commitOverlay(
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

/** Record `appliedFingerprint` on the phase result that carries the decision. */
function markApplied(fingerprint: string): void {
  const store = useWorkingCopyStore.getState();
  const entry = [...store.phaseResults].reverse().find((p) => p.marksContextTolerance !== undefined);
  if (entry?.marksContextTolerance === undefined) return;
  if (entry.marksContextTolerance.appliedFingerprint === fingerprint) return;
  store.recordPhase({ ...entry, marksContextTolerance: { ...entry.marksContextTolerance, appliedFingerprint: fingerprint } });
}

const decisionKey = (d: { fingerprint: string; acceptedSiteIds: readonly string[] }): string =>
  `${d.fingerprint}|${d.acceptedSiteIds.join(",")}`;

export function useContextToleranceApply(enabled: boolean): ContextToleranceApplyNotes | null {
  const decision = useWorkingCopyStore((s) => s.session.marksContextTolerance);
  const analysis = useWorkingCopyStore((s) => s.contextTolerance);
  const applied = useWorkingCopyStore((s) => s.contextToleranceOverlay);
  const [notes, setNotes] = useState<ContextToleranceApplyNotes | null>(null);
  const inFlight = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    if (decision === undefined || decision.decision === "decline") {
      // FR-009: a decline leaves the keyboard as it is — including undoing a
      // fix an earlier accept applied.
      if (applied !== null) commitOverlay(null);
      setNotes(null);
      return;
    }

    const want = decisionKey(decision);
    if (applied !== null && decisionKey(applied) === want) return; // already applied (FR-008)
    if (analysis.status !== "ready" || inFlight.current === want) return;

    inFlight.current = want;
    let live = true;
    void (async () => {
      try {
        const engine = await loadContextToleranceEngine();
        const outcome = await applyContextToleranceDecision(decision, analysis, { engine, applyFacetTransform });
        if (!live) return;
        if (outcome.kind === "applied") {
          commitOverlay({
            fingerprint: decision.fingerprint,
            acceptedSiteIds: [...decision.acceptedSiteIds],
            overlay: outcome.overlay,
          });
          markApplied(decision.fingerprint);
          setNotes(outcome.staleSiteIds.length > 0 ? { staleRuleIds: outcome.staleSiteIds } : null);
        } else if (outcome.kind === "stale") {
          setNotes({ staleRuleIds: outcome.staleSiteIds });
        } else {
          setNotes({ staleRuleIds: [], refusal: outcome.reason });
        }
      } catch (err: unknown) {
        devLog.warn("[useContextToleranceApply] apply failed:", err);
        if (live) setNotes({ staleRuleIds: [], refusal: err instanceof Error ? err.message : String(err) });
      } finally {
        if (inFlight.current === want) inFlight.current = null;
      }
    })();
    return () => {
      live = false;
    };
  }, [enabled, decision, analysis, applied]);

  return enabled ? notes : null;
}
