// Marks series (spec 090 T023 host, spec 107 driver): the engine's marks
// proposals, taken the way the series' Continue chain takes them, through
// survey/marks/marksSeriesValue.ts.
//
// What the UI does, in order, and what this does with it:
//   gate     a series with no marks never shows: it records the empty value
//            when none exists and completes with the empty result.
//   stations marksStationDefaults resolves every station's answer in the
//            series' own order; the case's inputOrder / outputForm / backspace
//            are overrides (outputForm.ts). The context-tolerance station
//            joins the list when its analysis offers a proposal (tolerance.ts).
//            The start-of-line box's default is the step's own
//            (startOfLineSeed / startOfLineImportSeeded): a migrated legacy
//            guard record or a Track 2 import pre-ticks it.
//   commit   assembleMarksSeries -> the value the step records as the
//            marks-treatment decision, and the result it passes to onComplete.
//            The host's session mirrors and the tolerance apply effect follow.
//
// `backspaceOnDiagonal` is a case field with no question in the marks series
// (no answer in the committed records either): nothing is applied for it.

import { useWorkingCopyStore } from "../../../stores/workingCopyStore.ts";
import { getDecisionSnapshot } from "../../../stores/decisionStore.ts";
import { deriveSurveyContext } from "../../../decisions/identitySelectors.ts";
import {
  assembleMarksSeries,
  computeMarksGate,
  marksStationDefaults,
  resolveToleranceDecision,
  seriesResult,
  startOfLineImportSeeded,
  startOfLineSeed,
} from "../../../survey/marks/marksSeriesValue.ts";
import {
  EMPTY_MARKS_VALUE,
  getMarksTreatmentValue,
  recordMarksTreatmentValue,
} from "../../../survey/marks/marksValue.ts";
import { mirrorMarksCompletionToSession } from "../../../survey/marks/marksSessionMirror.ts";
import { chooseMarksAnswers } from "./outputForm.ts";
import { applyToleranceStation, takeToleranceStation } from "./tolerance.ts";
import type { StepDrivers } from "./types.ts";

const STEP_ID = "marks";

export const marksDrivers: StepDrivers = {
  [STEP_ID]: async (ctx) => {
    const wc = useWorkingCopyStore.getState();
    const prior = getMarksTreatmentValue();
    const decisions = getDecisionSnapshot();
    const gate = computeMarksGate(wc.session.alphabet);
    const priorMarks = prior ?? EMPTY_MARKS_VALUE;
    const startOfLine = startOfLineSeed(
      priorMarks,
      startOfLineImportSeeded(decisions["authoring-track"]?.value, wc.startIr),
    );
    const base = {
      alphabet: gate.alphabet,
      startIr: wc.startIr,
      bcp47: deriveSurveyContext(decisions).bcp47_tag,
      importedOrder: wc.session.axes.markInputOrder,
      startOfLineDefault: startOfLine.defaultTicked,
    };

    // The gate first: the series never shows without marks, so nothing below runs.
    if (gate.skip) {
      ctx.report.addSkippedStep({ step: STEP_ID, reason: "no-marks" });
      if (prior === undefined) recordMarksTreatmentValue(EMPTY_MARKS_VALUE);
      return seriesResult();
    }

    const tolerance = await takeToleranceStation(ctx);
    const show = { showToleranceStation: tolerance.shown };
    const overrides = chooseMarksAnswers(ctx, base, show);
    const d = marksStationDefaults({ ...base, ...show, overrides });
    if (d.visibleStations.length === 0) throw new Error("the marks series has no station to complete at");

    const priorTolerance = priorMarks.contextTolerance ?? undefined;
    const analysis = tolerance.analysis;
    const reportedTolerance = resolveToleranceDecision({
      taken: tolerance.decision,
      priorTolerance,
      toleranceFingerprint: analysis.status === "ready" ? analysis.fingerprint : undefined,
    });

    const assembled = assembleMarksSeries({
      alphabet: d.gate.alphabet,
      classes: d.classes,
      isCasedBase: d.isCasedBase,
      bcp47: base.bcp47,
      expandedAttachments: d.expandedAttachments,
      treatment: d.treatment,
      state: d.state,
      visibleStations: d.visibleStations,
      workingIr: useWorkingCopyStore.getState().ir,
      reportedTolerance,
      effectiveTolerance: reportedTolerance ?? priorTolerance ?? null,
    });

    // The step's commit: the value is recorded (the module's apply writes
    // nothing), the host mirrors the completion into the session, and the
    // apply effect commits an accepted tolerance fix; then the step completes.
    recordMarksTreatmentValue(assembled.value);
    mirrorMarksCompletionToSession(assembled.completion);
    await applyToleranceStation(tolerance);
    return assembled.result;
  },
};
