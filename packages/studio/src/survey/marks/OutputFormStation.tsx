// OutputFormStation — S4 of the marks series (spec 071, FR-013..FR-017).
//
// ONE whole-keyboard decision: ready-made single characters vs base-plus-mark
// sequences, computed by the engine's ordered decision table
// (output-form-policy.ts). The unambiguous branches (FR-014/FR-015) render as
// a pre-explained NOTICE with a way to change the answer, never an open
// multi-option question; the genuinely ambiguous FR-016 branch renders as an
// open choice (recommended option first — see the open-choice build-out).
// The step-by-step backspace preview is mandatory (FR-017): the designer sees
// the consequence rather than taking it on faith.
//
// Copy framing (issue #1791): every designer-facing string here asks the
// BACKSPACE question directly ("What should backspace do to an accented
// letter?") — never how letters are "produced" or "typed", which would
// re-ask S2's entry question ("How should your marks be typed?").
//
// SC-005: no designer-facing string here may contain the words "Unicode" or
// "normalization" — asserted mechanically in the station's tests.

import { Trans, useLingui } from "@lingui/react/macro";
import { composeStack } from "@keyboard-studio/contracts";
import type { OutputForm, OutputFormProposal, PosturePair } from "@keyboard-studio/engine";
import { prefixCombiningMark } from "../../lib/irToCarveNodes.ts";
import {
  ACCENT,
  BORDER,
  TEXT_DIM,
  TEXT_MAIN,
  mutedParaFlush,
  sectionHeading,
  secondaryButton,
} from "../surveyStyles.ts";

export interface OutputFormStationProps {
  posture: PosturePair[];
  proposal: OutputFormProposal;
  /** The current answer (defaults to the proposal's form). */
  value: OutputForm;
  onChange: (next: OutputForm) => void;
  /**
   * The marks S2 resolved to `own-key`, in alphabet order. The proposal already
   * reads this as `hasOwnKeyMark`; the station states it back to the author as
   * a premise instead of asking them to remember the previous screen.
   */
  ownKeyMarks: string[];
}

/**
 * Backspace peel sequence for a stack under a given form: each entry is what
 * remains after one more backspace. Ready-made removes the whole letter in
 * one step; base-plus-mark peels one mark at a time, closest-out first.
 */
export function backspaceSteps(pair: PosturePair, form: OutputForm): string[] {
  const { base, marks } = pair.stack;
  if (form === "ready-made") {
    return [composeStack({ base, marks }), ""];
  }
  const steps: string[] = [];
  for (let k = marks.length; k >= 0; k--) {
    steps.push((base + marks.slice(0, k).join("")).normalize("NFC"));
  }
  steps.push("");
  return steps;
}

/** Prefer a multi-mark stack for the preview — it shows the peeling clearly. */
export function previewPair(posture: PosturePair[]): PosturePair | undefined {
  return posture.find((p) => p.stack.marks.length > 1) ?? posture[0];
}

function BackspacePreview({ pair, form }: { pair: PosturePair; form: OutputForm }) {
  const { t } = useLingui();
  const steps = backspaceSteps(pair, form);
  return (
    <div
      data-testid="backspace-preview"
      style={{
        border: `1px solid ${BORDER}`,
        borderRadius: 6,
        padding: "10px 14px",
        fontSize: 13,
        color: TEXT_MAIN,
      }}
    >
      <p style={{ margin: "0 0 6px 0", color: TEXT_DIM, fontSize: 12 }}>
        <Trans id="survey.marks.outputForm.backspacePreviewIntro">
          What backspace does, one press at a time:
        </Trans>
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 20 }}>
        {steps.map((step, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            {i > 0 && <span style={{ color: TEXT_DIM, fontSize: 13 }}>⌫</span>}
            <span
              style={{
                minWidth: 28,
                textAlign: "center",
                border: `1px solid ${BORDER}`,
                borderRadius: 4,
                padding: "2px 8px",
              }}
            >
              {step === "" ? (
                <span style={{ color: TEXT_DIM, fontSize: 12 }}>
                  {t({ id: "survey.marks.outputForm.emptyStep", message: "(empty)" })}
                </span>
              ) : (
                step
              )}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Per-form option labels. They LEAD with what backspace does — the observable
 * behaviour this decision controls (issue #1791) — and carry the ready-made
 * vs letter-plus-mark distinction as supporting detail. New ids
 * (backspaceLabel.*): the meaning changed from "how letters are produced" to
 * "what backspace does" (spec 046: rename the id when the meaning changes).
 */
function useFormLabel(): Record<OutputForm, string> {
  const { t } = useLingui();
  return {
    "ready-made": t({
      id: "survey.marks.outputForm.backspaceLabel.readyMade",
      message: "Backspace removes the whole letter at once (one ready-made unit)",
    }),
    "base-plus-mark": t({
      id: "survey.marks.outputForm.backspaceLabel.basePlusMark",
      message: "Backspace removes one mark at a time (letter and mark kept separate)",
    }),
  };
}

/**
 * The notice branch's override button, per target form. The option labels are
 * full sentences now, so they can no longer be embedded in "Use … instead" —
 * each target gets its own backspace-led sentence instead. New ids: the old
 * single derived id's meaning is retired with it.
 */
function useInsteadLabel(): Record<OutputForm, string> {
  const { t } = useLingui();
  return {
    "ready-made": t({
      id: "survey.marks.outputForm.useInsteadButton.readyMade",
      message: "Backspace should remove the whole letter at once instead",
    }),
    "base-plus-mark": t({
      id: "survey.marks.outputForm.useInsteadButton.basePlusMark",
      message: "Backspace should remove one mark at a time instead",
    }),
  };
}

/**
 * Per-option consequence text, in terms of the two behaviours this decision
 * actually controls: what backspace does, and how the text behaves when it is
 * searched or compared. Used by the FR-016 open choice for both options, and
 * by the notice branch whenever the author has overridden the proposal.
 */
function useFormConsequence(): Record<OutputForm, string> {
  const { t } = useLingui();
  return {
    "base-plus-mark": t({
      id: "survey.marks.outputForm.formConsequence.basePlusMark",
      message:
        "Backspace clears the mark first and the plain letter next, and searching or comparing text matches the letter as a letter followed by its mark.",
    }),
    "ready-made": t({
      id: "survey.marks.outputForm.formConsequence.readyMade",
      message:
        "Backspace clears the whole accented letter in one press, and searching or comparing text matches the letter as a single unit.",
    }),
  };
}

/**
 * The S2 outcome, stated back as a premise (not re-derived): whether any mark
 * got a key of its own, and — when the list is short enough to be useful —
 * which ones. One line, deliberately not a recap panel.
 */
function S2Premise({ ownKeyMarks }: { ownKeyMarks: string[] }) {
  const { t } = useLingui();
  const NAMEABLE = 3;
  const text =
    ownKeyMarks.length === 0
      ? t({
          id: "survey.marks.outputForm.premise.none",
          message: "From the previous question — no mark has a key of its own.",
        })
      : ownKeyMarks.length <= NAMEABLE
        ? t({
            id: "survey.marks.outputForm.premise.named",
            message: `From the previous question — marks with a key of their own: ${{ marks: ownKeyMarks.map((m) => prefixCombiningMark(m, true)).join(" ") }}.`,
          })
        : t({
            id: "survey.marks.outputForm.premise.counted",
            message: `From the previous question — ${{ count: ownKeyMarks.length }} of your marks have a key of their own.`,
          });
  return (
    <p data-testid="output-form-premise" style={{ ...mutedParaFlush, margin: "0 0 10px 0", fontSize: 12 }}>
      {text}
    </p>
  );
}

export function OutputFormStation({
  posture,
  proposal,
  value,
  onChange,
  ownKeyMarks,
}: OutputFormStationProps) {
  const { t } = useLingui();
  const formLabel = useFormLabel();
  const insteadLabel = useInsteadLabel();
  const formConsequence = useFormConsequence();
  const pair = previewPair(posture);
  const other: OutputForm = value === "ready-made" ? "base-plus-mark" : "ready-made";
  // New id: the meaning changed from "how accented letters are produced" to
  // the backspace question (issue #1791; spec 046).
  const sectionAriaLabel = t({
    id: "survey.marks.outputForm.backspaceSectionAriaLabel",
    message: "What backspace does to an accented letter",
  });

  if (proposal.presentedAs === "open-choice") {
    // FR-016: both forms are viable — an OPEN choice, recommended option
    // listed first, each option's consequence in plain language, and the
    // backspace preview shown for BOTH options (US4 AC2).
    const recommendedFirst: OutputForm[] =
      proposal.form === "ready-made"
        ? ["ready-made", "base-plus-mark"]
        : ["base-plus-mark", "ready-made"];
    return (
      <section data-testid="marks-output-form" aria-label={sectionAriaLabel}>
        <h3 style={sectionHeading}>
          {/* New id: asks the backspace question directly (issue #1791). */}
          <Trans id="survey.marks.outputForm.backspaceHeading">
            What should backspace do to an accented letter?
          </Trans>
        </h3>
        <S2Premise ownKeyMarks={ownKeyMarks} />
        <p style={mutedParaFlush}>{proposal.explanation}</p>
        <div
          role="radiogroup"
          aria-label={t({ id: "survey.marks.outputForm.backspaceRadiogroupAriaLabel", message: "What backspace does" })}
          style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}
        >
          {recommendedFirst.map((form) => (
            <label
              key={form}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: "10px 12px",
                border: `1px solid ${form === value ? ACCENT : BORDER}`,
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: TEXT_MAIN }}>
                <input
                  type="radio"
                  name="marks-output-form"
                  checked={value === form}
                  onChange={() => onChange(form)}
                />
                <strong>{formLabel[form]}</strong>
                {form === proposal.form && (
                  <span style={{ fontSize: 11, color: ACCENT }}>
                    <Trans id="survey.marks.outputForm.recommendedTag">recommended</Trans>
                  </span>
                )}
              </span>
              <span style={{ ...mutedParaFlush, fontSize: 12 }}>{formConsequence[form]}</span>
              {pair !== undefined && <BackspacePreview pair={pair} form={form} />}
            </label>
          ))}
        </div>
      </section>
    );
  }

  // Notice branch. The heading line and the paragraph under it are both keyed
  // off `value`, never off `proposal` alone: once the author overrides, the
  // policy's explanation describes the form they just left, so the per-form
  // consequence takes over. The two can therefore never disagree.
  const noticeExplanation =
    value === proposal.form ? proposal.explanation : formConsequence[value];

  return (
    <section data-testid="marks-output-form" aria-label={sectionAriaLabel}>
      <h3 style={sectionHeading}>
        <Trans id="survey.marks.outputForm.backspaceHeading">
          What should backspace do to an accented letter?
        </Trans>
      </h3>

      <S2Premise ownKeyMarks={ownKeyMarks} />

      <div
        style={{
          border: `1px solid ${BORDER}`,
          borderLeft: `3px solid ${ACCENT}`,
          borderRadius: 6,
          padding: "10px 14px",
          marginBottom: 12,
        }}
      >
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: TEXT_MAIN }}>
          {formLabel[value]}
        </p>
        <p style={{ ...mutedParaFlush, margin: "6px 0 0 0" }}>{noticeExplanation}</p>
      </div>

      {pair !== undefined && <BackspacePreview pair={pair} form={value} />}

      {/* Row 1 of the policy fires precisely because some pair has no
          single-character form, so the whole-letter-backspace answer is not
          available — say why instead of offering a button that would select
          an unrealisable form. */}
      <div style={{ marginTop: 10 }}>
        {proposal.readyMadeUnavailable ? (
          <p data-testid="output-form-change-unavailable" style={{ ...mutedParaFlush, margin: 0, fontSize: 12 }}>
            <Trans id="survey.marks.outputForm.changeUnavailable">
              Some of your accented letters have no single-character form, so there is no
              other way for your keyboard to behave here.
            </Trans>
          </p>
        ) : (
          <button
            type="button"
            data-testid="output-form-change"
            onClick={() => onChange(other)}
            style={secondaryButton}
          >
            {insteadLabel[other]}
          </button>
        )}
      </div>
    </section>
  );
}
