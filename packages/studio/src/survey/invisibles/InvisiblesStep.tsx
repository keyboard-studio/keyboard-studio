// InvisiblesStep — the "Invisible characters" page (spec 075 US3).
//
// One always-rendering spine EditorStep between "punctuation" and
// "convenience". Format characters (Unicode General Category Cf) — the
// zero-width joiner and non-joiner, the zero-width space, the soft hyphen,
// the word joiner and the bidi controls — have no glyph, so no character map
// can show them and no exemplar tier attests them; until this step existed
// the only way to reach one was a code-point entry that filed it into an
// unrendered `controls` bucket. Here each is offered BY NAME, with its
// `U+XXXX` notation and a one-line "you need this if…" statement, and the
// author's yes/no per character is a recorded decision (FR-013, FR-015,
// FR-018).
//
// Always renders (FR-020): there is no computed gate and no `null` return. A
// language with nothing to offer still sees the list with nothing selected
// and a note saying most keyboards need none. The bidi group is EXPANDED for
// a right-to-left author and COLLAPSED — never hidden — for everyone else, so
// an LTR author who genuinely needs a direction mark can still find it.
//
// Decisions live in the draft store's sticky `invisibleDecisions`
// (keyed `U+XXXX`), NOT in `chars`: an accepted character reaches the phase-C
// confirmed inventory through `phaseCConfirmedInventory()` and never lands in
// the `controls` bucket again (FR-014). On first render every `\p{Cf}`
// character an earlier code-point entry left in `controls` is carried over
// into an accepted decision and removed from `chars`, so it is offered once,
// pre-selected, and appears in one answer rather than two (FR-017).
//
// Result: `{ phase: "C", answers, confirmedInventory }` where `answers`
// carries one boolean per offered candidate (`questionId: "invisibles.u200c"`,
// …) so a declined offer is `false`, distinguishable from never asked, and
// `confirmedInventory` is the SAME phase-C union the punctuation step emits
// (see ../phaseCInventory.ts for why both emitters must agree — FR-024).
// The manifest entry declares `inputs: []`, `writes: []`: confirming an
// inventory is a survey result, not an IR write (spec 066 FR-006).
//
// Editors are pure (Article IV / G2): completion is reported via onComplete;
// the manifest reducer path (StepHost.handleComplete -> recordPhase) owns the
// session merge.

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { SurveyAnswer, SurveyPhaseResult } from "@keyboard-studio/contracts";
import { parseUPlusNotation } from "@keyboard-studio/contracts";
import type { EditorStepProps } from "../../steps/types.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { usePhaseBDraftStore } from "../../stores/phaseBDraftStore.ts";
import { phaseCConfirmedInventory } from "../phaseCInventory.ts";
import { isFormatChar } from "../charNormUtils.ts";
import type { SurveyContext } from "../types.ts";
import {
  invisibleCandidatesFor,
  invisibleIdSuffix,
  needStatementFor,
  type InvisibleCharacterCandidate,
} from "./invisibleCandidates.ts";
import {
  ACCENT,
  BORDER,
  BG_PAGE,
  TEXT_DIM,
  TEXT_MAIN,
  FONT,
  phaseHeadingFlush,
  mutedParaFlush,
  sectionHeading,
  secondaryButton,
  primaryButton,
} from "../surveyStyles.ts";

export type WritingDirection = "rtl" | "ltr" | "unknown";

/**
 * The author's writing direction, read from what they already told us — the
 * Phase A `writing_direction` answer, the Phase B right-to-left branch (its
 * `pb_rtl_direction_confirm` question is only ever asked on that branch, so
 * either answer to it means the script is right-to-left), the
 * `pb_non_roman_branch` pick, or the identity prefill's script family.
 * `"unknown"` when none of those has been answered.
 */
export function writingDirectionFrom(
  phaseResults: readonly SurveyPhaseResult[],
  surveyContext: SurveyContext,
): WritingDirection {
  let rtlBranch = false;
  for (const phase of phaseResults) {
    for (const a of phase.answers) {
      const v = typeof a.value === "string" ? a.value : String(a.value);
      if (a.questionId === "writing_direction") {
        if (v === "rtl") return "rtl";
        if (v === "ltr") return "ltr";
      }
      if (a.questionId === "pb_rtl_direction_confirm") rtlBranch = true;
      if (a.questionId === "pb_non_roman_branch" && v === "rtl") rtlBranch = true;
    }
  }
  if (rtlBranch) return "rtl";
  const family = surveyContext.script_family ?? surveyContext.routing_group;
  if (family === "rtl") return "rtl";
  if (family !== undefined && family !== "") return "ltr";
  return "unknown";
}

/** `"U+200C"` -> `"invisibles.u200c"` — the recorded answer's questionId. */
export function invisibleQuestionId(candidate: InvisibleCharacterCandidate): string {
  return "invisibles." + invisibleIdSuffix(candidate.codePoint);
}

// ---------------------------------------------------------------------------
// CandidateRow — one named invisible character with a yes/no toggle
// ---------------------------------------------------------------------------

interface CandidateRowProps {
  candidate: InvisibleCharacterCandidate;
  checked: boolean;
  onToggle: (candidate: InvisibleCharacterCandidate) => void;
}

function CandidateRow({ candidate, checked, onToggle }: CandidateRowProps) {
  const { i18n } = useLingui();
  const hex = candidate.codePoint.toString(16).toLowerCase().padStart(4, "0");
  const labelId = `invisible-label-${hex}`;
  const needId = `invisible-need-${hex}`;
  return (
    <li style={{ listStyle: "none", margin: 0 }}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={needId}
        data-testid={`invisible-candidate-${hex}`}
        onClick={() => onToggle(candidate)}
        className="ks-focus-ring"
        style={{
          display: "grid",
          gridTemplateColumns: "20px 1fr",
          gap: 12,
          width: "100%",
          textAlign: "left",
          padding: "10px 12px",
          background: BG_PAGE,
          border: `1px solid ${checked ? ACCENT : BORDER}`,
          borderRadius: 6,
          color: TEXT_MAIN,
          fontFamily: FONT,
          cursor: "pointer",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: 16,
            height: 16,
            marginTop: 2,
            border: `1px solid ${checked ? ACCENT : TEXT_DIM}`,
            borderRadius: 3,
            background: checked ? ACCENT : "transparent",
            color: BG_PAGE,
            fontSize: 12,
            lineHeight: "16px",
            textAlign: "center",
          }}
        >
          {checked ? "x" : ""}
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span id={labelId} style={{ fontSize: 14, fontWeight: 600 }}>
            {candidate.label}{" "}
            <span style={{ fontFamily: "monospace", fontWeight: 400, color: TEXT_DIM }}>
              {candidate.notation}
            </span>
          </span>
          <span id={needId} style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.5 }}>
            {i18n._(needStatementFor(candidate.codePoint))}
          </span>
        </span>
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// InvisiblesStep
// ---------------------------------------------------------------------------

const InvisiblesStep: ComponentType<EditorStepProps> = ({ onComplete, onBack }: EditorStepProps) => {
  const { t } = useLingui();
  const phaseResults = useWorkingCopyStore((s) => s.phaseResults);
  const surveyContext = useSurveySessionStore((s) => s.surveyContext);
  const direction = useMemo(
    () => writingDirectionFrom(phaseResults, surveyContext),
    [phaseResults, surveyContext],
  );

  const controls = usePhaseBDraftStore((s) => s.controls);
  const invisibleDecisions = usePhaseBDraftStore((s) => s.invisibleDecisions);
  const acceptInvisible = usePhaseBDraftStore((s) => s.acceptInvisible);
  const declineInvisible = usePhaseBDraftStore((s) => s.declineInvisible);
  const adoptControlsAsInvisibles = usePhaseBDraftStore((s) => s.adoptControlsAsInvisibles);

  // Carry-over (FR-017): capture what the code-point field left in `controls`
  // BEFORE adopting it, so the candidate list keeps offering those characters
  // after they have moved out of `chars`. Characters already decided about on
  // an earlier visit stay offered too — nothing an author entered is dropped.
  const carriedOver = useMemo(() => {
    const fromControls = controls.filter(isFormatChar);
    const fromDecisions = Object.keys(invisibleDecisions)
      .map(parseUPlusNotation)
      .filter((c): c is string => c !== null);
    return [...fromControls, ...fromDecisions];
  }, [controls, invisibleDecisions]);
  const carriedRef = useRef<readonly string[]>(carriedOver);
  useEffect(() => {
    adoptControlsAsInvisibles();
  }, [adoptControlsAsInvisibles]);

  const candidates = useMemo(
    () =>
      invisibleCandidatesFor({
        direction,
        carriedOver: [...carriedRef.current, ...carriedOver],
      }),
    [direction, carriedOver],
  );
  const alwaysCandidates = candidates.filter((c) => c.relevance !== "rtl");
  const bidiCandidates = candidates.filter((c) => c.relevance === "rtl");

  const [bidiExpanded, setBidiExpanded] = useState(direction === "rtl");
  useEffect(() => {
    if (direction === "rtl") setBidiExpanded(true);
  }, [direction]);

  const isAccepted = (c: InvisibleCharacterCandidate): boolean =>
    invisibleDecisions[c.notation] === "accepted";
  const acceptedCount = candidates.filter(isAccepted).length;

  // Double-complete guard (mirrors the punctuation step).
  const completedRef = useRef(false);

  function toggle(c: InvisibleCharacterCandidate): void {
    if (isAccepted(c)) declineInvisible(c.notation);
    else acceptInvisible(c.notation);
  }

  function complete(): void {
    if (completedRef.current) return;
    completedRef.current = true;
    // One boolean per OFFERED candidate: a declined or untouched offer records
    // `false`, which the decision record can tell apart from "never asked".
    const answers: SurveyAnswer[] = candidates.map((c) => ({
      questionId: invisibleQuestionId(c),
      answerType: "boolean",
      value: isAccepted(c),
    }));
    onComplete({ phase: "C", answers, confirmedInventory: phaseCConfirmedInventory() });
  }

  return (
    <div
      data-testid="invisibles-step"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        maxWidth: 640,
        fontFamily: FONT,
        color: TEXT_MAIN,
      }}
    >
      {onBack !== undefined && (
        <button
          type="button"
          data-testid="invisibles-back"
          onClick={onBack}
          style={{ alignSelf: "flex-start", ...secondaryButton }}
        >
          <Trans id="survey.invisibles.backButton">Back</Trans>
        </button>
      )}

      <h2 style={phaseHeadingFlush} data-testid="invisibles-heading">
        <Trans id="survey.invisibles.heading">Invisible characters</Trans>
      </h2>

      <div
        style={{
          padding: "12px 16px",
          border: `1px solid ${BORDER}`,
          borderLeft: `3px solid ${ACCENT}`,
          borderRadius: 6,
          fontSize: 14,
          lineHeight: 1.6,
        }}
      >
        <p style={{ margin: 0 }}>
          <Trans id="survey.invisibles.intro">
            Some keyboards need characters that print nothing but change how the
            text around them joins, breaks or reads. Each one below is named,
            with when you would need it. Select the ones your keyboard should be
            able to type; leave the rest.
          </Trans>
        </p>
      </div>

      {acceptedCount === 0 && (
        <p style={mutedParaFlush} data-testid="invisibles-none-needed">
          <Trans id="survey.invisibles.noneNeeded">
            Most keyboards need none of these. If that is yours, just continue.
          </Trans>
        </p>
      )}

      <section
        aria-labelledby="invisibles-common-heading"
      >
        <h3 id="invisibles-common-heading" style={sectionHeading}>
          <Trans id="survey.invisibles.commonHeading">Joiners, breaks and hyphenation</Trans>
        </h3>
        <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {alwaysCandidates.map((c) => (
            <CandidateRow key={c.notation} candidate={c} checked={isAccepted(c)} onToggle={toggle} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="invisibles-bidi-heading" data-testid="invisibles-bidi-group">
        <h3 id="invisibles-bidi-heading" style={sectionHeading}>
          <Trans id="survey.invisibles.bidiGroup.heading">Direction controls</Trans>
        </h3>
        {direction !== "rtl" && (
          <p style={{ ...mutedParaFlush, margin: "0 0 8px 0" }}>
            <Trans id="survey.invisibles.bidiGroup.collapsedNote">
              Usually only needed for right-to-left scripts such as Arabic, Hebrew,
              Syriac or Thaana, so they are folded away here — open the list if
              your keyboard mixes text directions.
            </Trans>
          </p>
        )}
        {!bidiExpanded ? (
          <button
            type="button"
            data-testid="invisibles-bidi-expand"
            aria-expanded={false}
            aria-controls="invisibles-bidi-list"
            onClick={() => setBidiExpanded(true)}
            style={secondaryButton}
          >
            {t({
              id: "survey.invisibles.bidiGroup.expandButton",
              message: plural(bidiCandidates.length, {
                one: "Show # direction control",
                other: "Show # direction controls",
              }),
            })}
          </button>
        ) : (
          <ul
            id="invisibles-bidi-list"
            style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}
          >
            {bidiCandidates.map((c) => (
              <CandidateRow key={c.notation} candidate={c} checked={isAccepted(c)} onToggle={toggle} />
            ))}
          </ul>
        )}
      </section>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          data-testid="invisibles-continue"
          onClick={complete}
          className="ks-focus-ring ks-hit-target"
          style={primaryButton(false)}
        >
          {acceptedCount === 0
            ? t({
                id: "survey.invisibles.continueButtonNone",
                message: "Continue without invisible characters",
              })
            : t({
                id: "survey.invisibles.continueButton",
                message: plural(acceptedCount, {
                  one: "Continue (# invisible character)",
                  other: "Continue (# invisible characters)",
                }),
              })}
        </button>
      </div>
    </div>
  );
};

export { InvisiblesStep };
