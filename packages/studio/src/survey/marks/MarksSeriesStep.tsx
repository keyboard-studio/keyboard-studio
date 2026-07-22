// MarksSeriesStep — the S0-S5 marks question series host (spec 046).
//
// One spine EditorStep between "characters" and "carve" — the series runs
// immediately after alphabet confirmation so how the author thinks of the
// combined letters is known before any key work (carve, mechanisms) begins.
// S0 is a COMPUTED gate that never renders (FR-005): when the confirmed
// alphabet's marks store is empty, the step completes immediately with an
// EMPTY placement worklist and the designer proceeds with no marks screen
// ever shown. When marks exist, stations S1-S5 are sequenced internally
// (skip logic stays local to this host, spec 046 R1); every station's content
// is derived from the alphabet already confirmed at this point (FR-024). Each
// station that has nothing to decide is skipped, so the simple fully-attested
// orthography confirms in at most two rendered screens (SC-002/SC-006).
//
// FR-023 (staleness): every derived input is keyed on the alphabet's CONTENT
// (not object identity). An alphabet edit that changes the evidence re-seeds
// the affected answers from fresh proposals and returns the designer to the
// first station — the affected decisions must be reconfirmed before the
// series can complete again.
//
// Editors are pure (Article IV / G2): this component reports completion via
// onComplete with a SurveyPhaseResult carrying `marksWorklist`; the manifest
// reducer path (StepHost.handleComplete → recordPhase) owns the session merge.

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import type {
  AttestedStack,
  ConfirmedAlphabet,
  SurveyPhaseResult,
} from "@keyboard-studio/contracts";
import {
  confirmedAlphabetKey,
  makeConfirmedAlphabet,
  makeEmptyPlacementWorklist,
} from "@keyboard-studio/contracts";
import {
  groupMarkClasses,
  proposeAttachments,
  deriveCaseCounterparts,
  nfcPostureOfInventory,
  resolveOutputFormProposal,
  hasDecidablePairs,
  computeMentalModelPrefills,
  buildPlacementWorklist,
  type AttachmentProposal,
  type MarkClass,
  type MentalModelAnswer,
  type OutputForm,
} from "@keyboard-studio/engine";
import type { EditorStepProps } from "../../steps/types.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { AttachmentStation } from "./AttachmentStation.tsx";
import { MentalModelStation } from "./MentalModelStation.tsx";
import { InputOrderStation, type MarkInputOrder } from "./InputOrderStation.tsx";
import { OutputFormStation } from "./OutputFormStation.tsx";
import { StackingStation, stackKey } from "./StackingStation.tsx";
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
// Station sequencing — the pinned station ids, in series order.
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

/**
 * A class needs an on-screen S2 confirmation only when there is a genuine
 * decision: more than one mark in the class, or any of its marks reaching
 * more than one base (attested or plausible). A trivially single-pair class
 * takes its recorded answer from the prefill without a screen (SC-002: the
 * simple orthography stays at two screens).
 */
export function classNeedsMentalModelScreen(
  markClass: MarkClass,
  proposals: AttachmentProposal[],
): boolean {
  if (markClass.marks.length > 1) return true;
  return markClass.marks.some((mark) => {
    const proposal = proposals.find((p) => p.mark === mark);
    if (proposal === undefined) return false;
    return Object.values(proposal.states).filter((s) => s !== "blocked").length > 1;
  });
}

/**
 * The series' phase result: reported on completion (or on the S0 skip). The
 * chosen output form rides along as a studio-local payload extension (see
 * steps/reducer.ts MarksCompleteResult) — the reducer needs it to decide
 * whether to generate stepwise backspace-unwrap stores.
 */
function seriesResult(
  worklist = makeEmptyPlacementWorklist(),
  outputForm?: OutputForm,
): SurveyPhaseResult {
  return {
    phase: "C",
    answers: [],
    marksWorklist: worklist,
    ...(outputForm !== undefined ? { marksOutputForm: outputForm } : {}),
  } as SurveyPhaseResult;
}

const MarksSeriesStep: ComponentType<EditorStepProps> = ({ onComplete, onBack }: EditorStepProps) => {
  const alphabet = useWorkingCopyStore((s) => s.session.alphabet);
  const importedOrder = useWorkingCopyStore((s) => s.session.axes.markInputOrder);
  const baseIr = useWorkingCopyStore((s) => s.baseIr);
  const surveyContext = useSurveySessionStore((s) => s.surveyContext);

  // Content key: derived inputs re-compute only when the alphabet's CONTENT
  // changes, not when the session object is recreated by an unrelated merge.
  const alphabetKey = useMemo(() => confirmedAlphabetKey(alphabet), [alphabet]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const gate = useMemo(() => computeMarksGate(alphabet), [alphabetKey]);

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
  const posture = useMemo(() => nfcPostureOfInventory(gate.alphabet), [gate.alphabet]);
  const mentalModelPrefills = useMemo(
    () => computeMentalModelPrefills(gate.alphabet, classes, proposals, { baseIr }),
    [gate.alphabet, classes, proposals, baseIr],
  );

  // --- answers (each re-seeded when its evidence changes — FR-023) ---

  const [attachmentChecked, setAttachmentChecked] = useState<AttachmentChecked>(() =>
    initialAttachmentChecked(proposals),
  );
  useEffect(() => {
    setAttachmentChecked(initialAttachmentChecked(proposals));
  }, [proposals]);

  const [mentalModel, setMentalModel] = useState<Record<string, MentalModelAnswer>>({});
  useEffect(() => {
    const seeded: Record<string, MentalModelAnswer> = {};
    for (const prefill of mentalModelPrefills) seeded[prefill.classId] = prefill.recommended;
    setMentalModel(seeded);
  }, [mentalModelPrefills]);

  const hasLetterPlusMarkClass = Object.values(mentalModel).includes("letter-plus-mark");

  // S3 — prefilled from the base keyboard's own behavior when available
  // (detectMarkInputOrderFromImport seeds session.axes.markInputOrder).
  const prefilledFromImport = importedOrder === "prefix" || importedOrder === "postfix";
  const [inputOrder, setInputOrder] = useState<MarkInputOrder>(
    prefilledFromImport ? (importedOrder as MarkInputOrder) : "postfix",
  );

  const outputFormProposal = useMemo(
    () => resolveOutputFormProposal(posture, hasLetterPlusMarkClass),
    [posture, hasLetterPlusMarkClass],
  );
  const [outputForm, setOutputForm] = useState<OutputForm>(outputFormProposal.form);
  useEffect(() => {
    setOutputForm(outputFormProposal.form);
  }, [outputFormProposal.form]);

  // S5 — evidence: an attested >=2-mark stack, or two marks' reachable base
  // sets overlapping (FR-018). Confirmed list defaults to the attested stacks
  // (propose-then-confirm), never inferred from attachment rows (FR-019).
  const multiMarkStacks = useMemo<AttestedStack[]>(
    () => gate.alphabet.attestedStacks.filter((s) => s.marks.length >= 2),
    [gate.alphabet],
  );
  const marksOverlap = useMemo(() => {
    const reachable = proposals.map((p) =>
      new Set(Object.entries(p.states).filter(([, s]) => s !== "blocked").map(([b]) => b)),
    );
    for (let i = 0; i < reachable.length; i++) {
      for (let j = i + 1; j < reachable.length; j++) {
        const a = reachable[i];
        const b = reachable[j];
        if (a !== undefined && b !== undefined && [...a].some((x) => b.has(x))) return true;
      }
    }
    return false;
  }, [proposals]);
  const stackingEvidence = multiMarkStacks.length > 0 || marksOverlap;
  const [stackingAllowed, setStackingAllowed] = useState<boolean>(multiMarkStacks.length > 0);
  const [stacksConfirmed, setStacksConfirmed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setStackingAllowed(multiMarkStacks.length > 0);
    const seeded: Record<string, boolean> = {};
    for (const stack of multiMarkStacks) seeded[stackKey(stack)] = true;
    setStacksConfirmed(seeded);
  }, [multiMarkStacks]);

  // --- visible stations, in series order ---
  const needsMentalModelScreen = classes.some((c) => classNeedsMentalModelScreen(c, proposals));
  const visibleStations: MarksStationId[] = useMemo(() => {
    const stations: MarksStationId[] = [];
    if (proposals.length > 0) stations.push("marks_attachment");
    if (needsMentalModelScreen) stations.push("marks_mental_model");
    if (hasLetterPlusMarkClass) stations.push("marks_input_order");
    if (hasDecidablePairs(posture)) stations.push("marks_output_form");
    if (stackingEvidence) stations.push("marks_stacking");
    return stations;
  }, [proposals, needsMentalModelScreen, hasLetterPlusMarkClass, posture, stackingEvidence]);

  const [stationIndex, setStationIndex] = useState(0);
  // FR-023: evidence changed → back to the first station; the affected
  // (re-seeded) decisions must be walked again before completing.
  useEffect(() => {
    setStationIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alphabetKey]);
  const currentStation = visibleStations[Math.min(stationIndex, visibleStations.length - 1)];

  // S0 skip: never render — stay TRANSPARENT in the direction of travel. On a
  // forward entry, complete immediately (empty worklist → mechanism gallery).
  // On a back-pop entry (the designer pressed Back on the mechanism gallery),
  // keep popping backward to carve instead of bouncing them forward again.
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
    // Assemble the FR-020 handoff. The stacking answer constrains the stack
    // list downstream; the worklist's three groups cover every base and mark
    // (SC-007, verified in engine tests).
    const worklist = buildPlacementWorklist({
      alphabet: gate.alphabet,
      classes,
      attachments: attachmentChecked,
      mentalModel,
      inputOrder,
    });
    onComplete(seriesResult(worklist, outputForm));
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

      {currentStation === "marks_mental_model" && (
        <MentalModelStation
          classes={classes}
          prefills={mentalModelPrefills}
          answers={mentalModel}
          onChange={(classId, answer) =>
            setMentalModel((prev) => ({ ...prev, [classId]: answer }))
          }
        />
      )}

      {currentStation === "marks_input_order" && (
        <InputOrderStation
          value={inputOrder}
          onChange={setInputOrder}
          prefilledFromImport={prefilledFromImport}
        />
      )}

      {currentStation === "marks_output_form" && (
        <OutputFormStation
          posture={posture}
          proposal={outputFormProposal}
          value={outputForm}
          onChange={setOutputForm}
        />
      )}

      {currentStation === "marks_stacking" && (
        <StackingStation
          multiMarkStacks={multiMarkStacks}
          allowed={stackingAllowed}
          onAllowedChange={setStackingAllowed}
          confirmed={stacksConfirmed}
          onConfirmChange={(key, next) =>
            setStacksConfirmed((prev) => ({ ...prev, [key]: next }))
          }
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
