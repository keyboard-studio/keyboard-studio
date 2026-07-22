// MarksSeriesStep — the S0-S5 marks question series host (spec 046).
//
// One spine EditorStep between "carve" and "mechanisms". S0 is a COMPUTED gate
// that never renders (FR-005): when the confirmed alphabet's marks store is
// empty, the step completes immediately with an EMPTY placement worklist and
// the designer lands straight on the mechanism gallery — no marks screen is
// ever shown. When marks exist, stations S1-S5 are sequenced internally
// (skip logic stays local to this host, spec 046 R1); every station's content
// is derived from the alphabet already confirmed at this point (FR-024).
//
// Editors are pure (Article IV / G2): this component reports completion via
// onComplete with a SurveyPhaseResult carrying `marksWorklist`; the manifest
// reducer path (StepHost.handleComplete → recordPhase) owns the session merge.

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import type { ConfirmedAlphabet, SurveyPhaseResult } from "@keyboard-studio/contracts";
import { makeConfirmedAlphabet, makeEmptyPlacementWorklist } from "@keyboard-studio/contracts";
import type { EditorStepProps } from "../../steps/types.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import {
  ACCENT,
  TEXT_DIM,
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
// Station sequencing scaffold — the ordered station ids (contract: station ids
// are pinned). Render conditions land with their stations (T016+); until a
// station is implemented it is skipped, so the series completes via the
// continue control alone.
// ---------------------------------------------------------------------------

export type MarksStationId =
  | "marks_attachment"
  | "marks_mental_model"
  | "marks_input_order"
  | "marks_output_form"
  | "marks_stacking";

/** The series' phase result: reported on completion (or on the S0 skip). */
function seriesResult(worklist = makeEmptyPlacementWorklist()): SurveyPhaseResult {
  return { phase: "C", answers: [], marksWorklist: worklist };
}

const MarksSeriesStep: ComponentType<EditorStepProps> = ({ onComplete, onBack }: EditorStepProps) => {
  const session = useWorkingCopyStore((s) => s.session);
  const gate = useMemo(() => computeMarksGate(session.alphabet), [session.alphabet]);

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

  const [stationIndex] = useState(0);

  if (gate.skip) return null;

  // Stations are stubbed at this stage (T016+ fill them in): render the series
  // shell with the continue control so the walk stays completable.
  void stationIndex;
  return (
    <div
      data-testid="marks-series"
      style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640, fontFamily: FONT, color: TEXT_MAIN }}
    >
      {onBack !== undefined && (
        <button type="button" onClick={onBack} style={{ alignSelf: "flex-start", ...secondaryButton }}>
          Back
        </button>
      )}
      <h2 style={{ ...phaseHeadingFlush, color: ACCENT }}>Accents &amp; marks</h2>
      <p style={mutedParaFlush}>
        Your alphabet includes {gate.alphabet.marks.length} mark
        {gate.alphabet.marks.length === 1 ? "" : "s"}. Confirm how they attach to
        your letters before placing keys.
      </p>
      <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM }}>
        (Stations under construction.)
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          data-testid="marks-continue"
          onClick={() => {
            if (!completedRef.current) {
              completedRef.current = true;
              onComplete(seriesResult());
            }
          }}
          style={primaryButton(false)}
        >
          Continue
        </button>
      </div>
    </div>
  );
};

export { MarksSeriesStep };
