// MarksSeriesStep — the S0-S5 marks question series host (spec 046).
//
// One spine EditorStep between "carve" and "mechanisms". S0 is a COMPUTED gate
// that never renders (FR-005): when the confirmed alphabet's marks store is
// empty, the step completes immediately with an EMPTY placement worklist and
// the designer lands straight on the mechanism gallery — no marks screen is
// ever shown. When marks exist, stations S1-S5 are sequenced internally
// (skip logic stays local to this host, spec 046 R1); every station's content
// is derived from the alphabet already confirmed at this point (FR-024). Each
// station that has nothing to decide is skipped, so the simple fully-attested
// orthography confirms in at most two rendered screens (SC-002/SC-006).
//
// Editors are pure (Article IV / G2): this component reports completion via
// onComplete with a SurveyPhaseResult carrying `marksWorklist`; the manifest
// reducer path (StepHost.handleComplete → recordPhase) owns the session merge.

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import type { ConfirmedAlphabet, SurveyPhaseResult } from "@keyboard-studio/contracts";
import { makeConfirmedAlphabet, makeEmptyPlacementWorklist } from "@keyboard-studio/contracts";
import {
  groupMarkClasses,
  proposeAttachments,
  deriveCaseCounterparts,
  type AttachmentProposal,
  type MarkClass,
} from "@keyboard-studio/engine";
import type { EditorStepProps } from "../../steps/types.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { AttachmentStation } from "./AttachmentStation.tsx";
import {
  ACCENT,
  TEXT_MAIN,
  FONT,
  phaseHeadingFlush,
  mutedParaFlush,
  secondaryButton,
  primaryButton,
} from "../surveyStyles.ts";

// ---------------------------------------------------------------------------
// S0 — the computed gate (never rendered).
// ---------------------------------------------------------------------------

export interface MarksGateResult {
  /** True iff the marks store is empty — the whole series is skipped (FR-005). */
  skip: boolean;
  /** The alphabet the series runs against (empty stores when none confirmed). */
  alphabet: ConfirmedAlphabet;
}

/**
 * Compute the S0 gate from the session's merged alphabet. Recomputed whenever
 * the confirmed alphabet changes (US1 AC2: adding a marked character after a
 * skip makes the series reachable again on the next advance).
 */
export function computeMarksGate(alphabet: ConfirmedAlphabet | undefined): MarksGateResult {
  const resolved = alphabet ?? makeConfirmedAlphabet();
  return { skip: resolved.marks.length === 0, alphabet: resolved };
}

// ---------------------------------------------------------------------------
// Station sequencing — the pinned station ids, in series order. A station is
// rendered only when its render condition holds; conditions for stations not
// yet implemented resolve to false, keeping the walk completable throughout
// the build-out.
// ---------------------------------------------------------------------------

export type MarksStationId =
  | "marks_attachment"
  | "marks_mental_model"
  | "marks_input_order"
  | "marks_output_form"
  | "marks_stacking";

/** Attachment answers: per mark, per base — checked = reachable on the keyboard. */
export type AttachmentChecked = Record<string, Record<string, boolean>>;

/** Initial S1 state from the proposals: attested pre-checked, everything else unchecked. */
export function initialAttachmentChecked(proposals: AttachmentProposal[]): AttachmentChecked {
  const out: AttachmentChecked = {};
  for (const proposal of proposals) {
    const row: Record<string, boolean> = {};
    for (const [base, state] of Object.entries(proposal.states)) {
      row[base] = state === "attested";
    }
    out[proposal.mark] = row;
  }
  return out;
}

/** The series' phase result: reported on completion (or on the S0 skip). */
function seriesResult(worklist = makeEmptyPlacementWorklist()): SurveyPhaseResult {
  return { phase: "C", answers: [], marksWorklist: worklist };
}

const MarksSeriesStep: ComponentType<EditorStepProps> = ({ onComplete, onBack }: EditorStepProps) => {
  const session = useWorkingCopyStore((s) => s.session);
  const surveyContext = useSurveySessionStore((s) => s.surveyContext);
  const gate = useMemo(() => computeMarksGate(session.alphabet), [session.alphabet]);

  // Derived station inputs — all pure engine functions over the gate alphabet.
  const classes: MarkClass[] = useMemo(() => groupMarkClasses(gate.alphabet), [gate.alphabet]);
  const proposals = useMemo(
    () => proposeAttachments(gate.alphabet, classes),
    [gate.alphabet, classes],
  );
  const casePairs = useMemo(
    () => deriveCaseCounterparts(gate.alphabet, surveyContext.bcp47_tag),
    [gate.alphabet, surveyContext.bcp47_tag],
  );

  // S1 answers — re-seeded whenever the proposals change (alphabet edited).
  const [attachmentChecked, setAttachmentChecked] = useState<AttachmentChecked>(() =>
    initialAttachmentChecked(proposals),
  );
  useEffect(() => {
    setAttachmentChecked(initialAttachmentChecked(proposals));
  }, [proposals]);

  // Visible stations, in order. Stations not yet implemented contribute no
  // entry; S1 renders whenever the series runs (an all-auto-confirmed S1 is
  // still one screen — the confirm, not an interrogation).
  const visibleStations: MarksStationId[] = useMemo(() => {
    const stations: MarksStationId[] = [];
    if (proposals.length > 0) stations.push("marks_attachment");
    return stations;
  }, [proposals]);

  const [stationIndex, setStationIndex] = useState(0);
  const currentStation = visibleStations[Math.min(stationIndex, visibleStations.length - 1)];

  // S0 skip: never render — stay TRANSPARENT in the direction of travel. On a
  // forward entry, complete immediately (empty worklist → mechanism gallery).
  // On a back-pop entry (the designer pressed Back on the mechanism gallery),
  // keep popping backward to carve instead of bouncing them forward again.
  // The ref guards the onComplete → advance → unmount cycle against
  // double-fire under StrictMode re-invocation or a parent re-render racing
  // the advance.
  const completedRef = useRef(false);
  useEffect(() => {
    if (gate.skip && !completedRef.current) {
      completedRef.current = true;
      if (useSurveySessionStore.getState().lastNavigation === "pop" && onBack !== undefined) {
        onBack();
      } else {
        onComplete(seriesResult());
      }
    }
  }, [gate.skip, onComplete, onBack]);

  if (gate.skip) return null;

  function complete(): void {
    if (completedRef.current) return;
    completedRef.current = true;
    // Worklist assembly lands with the worklist builder (T023/T027); until
    // then the series exits with the empty worklist (gallery falls back to
    // the flat-inventory flow).
    onComplete(seriesResult());
  }

  function handleContinue(): void {
    if (stationIndex + 1 < visibleStations.length) {
      setStationIndex(stationIndex + 1);
    } else {
      complete();
    }
  }

  function handleStationBack(): void {
    if (stationIndex > 0) {
      setStationIndex(stationIndex - 1);
    } else {
      onBack?.();
    }
  }

  return (
    <div
      data-testid="marks-series"
      style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640, fontFamily: FONT, color: TEXT_MAIN, padding: 16, overflow: "auto" }}
    >
      <button type="button" onClick={handleStationBack} style={{ alignSelf: "flex-start", ...secondaryButton }}>
        Back
      </button>
      <h2 style={{ ...phaseHeadingFlush, color: ACCENT }}>Accents &amp; marks</h2>
      <p style={mutedParaFlush}>
        Your alphabet includes {gate.alphabet.marks.length} mark
        {gate.alphabet.marks.length === 1 ? "" : "s"}. Confirm how they attach to
        your letters before placing keys.
      </p>

      {currentStation === "marks_attachment" && (
        <AttachmentStation
          proposals={proposals}
          bases={gate.alphabet.bases}
          checked={attachmentChecked}
          onToggle={(mark, base, next) =>
            setAttachmentChecked((prev) => ({
              ...prev,
              [mark]: { ...prev[mark], [base]: next },
            }))
          }
          casePairCount={casePairs.size}
        />
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          data-testid="marks-continue"
          onClick={handleContinue}
          style={primaryButton(false)}
        >
          Continue
        </button>
      </div>
    </div>
  );
};

export { MarksSeriesStep };
