// useContextToleranceApply — the separate effect that applies a recorded
// context-tolerance decision (spec 078 FR-005a second half, FR-008, FR-009).
//
// Keyed off the decision the marks step recorded (spec 090 T023: the
// `marks-treatment` decision value's `contextTolerance` — before T023 this
// read the phase-result derivation `session.marksContextTolerance`) and
// the latest analysis:
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
import { devLog } from "@keyboard-studio/contracts/dev-log";

import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { isLiveOpen } from "../lib/openMode.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import type { MarksTreatmentValue } from "../survey/marks/marksValue.ts";
import { applyToleranceDecision, commitOverlay } from "../lib/contextToleranceCommit.ts";
import type { ContextToleranceApplyNotes } from "../lint/ContextToleranceNotice.tsx";

const decisionKey = (d: { fingerprint: string; acceptedSiteIds: readonly string[] }): string =>
  `${d.fingerprint}|${d.acceptedSiteIds.join(",")}`;

export function useContextToleranceApply(): ContextToleranceApplyNotes | null {
  const decision = useDecisionStore((s) => {
    const value = s.decisions["marks-treatment"]?.value as MarksTreatmentValue | undefined;
    return value?.contextTolerance ?? undefined;
  });
  const analysis = useWorkingCopyStore((s) => s.contextTolerance);
  const applied = useWorkingCopyStore((s) => s.contextToleranceOverlay);
  const [notes, setNotes] = useState<ContextToleranceApplyNotes | null>(null);
  const openLive = useWorkingCopyStore((s) => isLiveOpen(s));
  const inFlight = useRef<string | null>(null);
  // Open: nothing is held to tell "already applied", so the decision stamped
  // applied (`appliedFingerprint`) says so, and a try that did not land (refused,
  // or waiting for the author's agreement) is not repeated for the same decision.
  const triedOnOpen = useRef<string | null>(null);

  useEffect(() => {
    if (openLive) {
      // Spec 111 FR-042: an earlier answer changing leaves the files alone, so a
      // decline or a stale fix removes nothing; the undo log takes a fix back.
      if (decision === undefined || decision.decision === "decline") {
        setNotes(null);
        return;
      }
      const want = decisionKey(decision);
      if (decision.appliedFingerprint === decision.fingerprint) return;
      if (analysis.status !== "ready" || inFlight.current === want || triedOnOpen.current === want) return;
      triedOnOpen.current = want;
      inFlight.current = want;
      let liveRun = true;
      void (async () => {
        try {
          const notes = await applyToleranceDecision(decision, analysis, () => liveRun);
          if (liveRun) setNotes(notes);
        } catch (err: unknown) {
          devLog.warn("[useContextToleranceApply] apply failed:", err);
          if (liveRun) setNotes({ staleRuleIds: [], refusal: err instanceof Error ? err.message : String(err) });
        } finally {
          if (inFlight.current === want) inFlight.current = null;
        }
      })();
      return () => {
        liveRun = false;
      };
    }
    if (decision === undefined || decision.decision === "decline") {
      // FR-009: a decline leaves the keyboard as it is — including undoing a
      // fix an earlier accept applied.
      if (applied !== null) commitOverlay(null);
      setNotes(null);
      return;
    }

    // The applied overlay was built for the rules the analysis then saw. Once the
    // analysis of the keyboard as it now stands disagrees (key edits changed the
    // fingerprint, or the step's cache key), the baked rules are stale: drop
    // them instead of replaying them into the preview and the download.
    if (applied !== null && analysis.status === "ready" && analysis.fingerprint !== applied.fingerprint) {
      commitOverlay(null);
      setNotes({ staleRuleIds: [...applied.acceptedSiteIds] });
      return;
    }

    const want = decisionKey(decision);
    if (applied !== null && decisionKey(applied) === want) return; // already applied (FR-008)
    if (analysis.status !== "ready" || inFlight.current === want) return;

    inFlight.current = want;
    let live = true;
    void (async () => {
      try {
        const notes = await applyToleranceDecision(decision, analysis, () => live);
        if (live) setNotes(notes);
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
  }, [decision, analysis, applied, openLive]);

  return notes;
}
