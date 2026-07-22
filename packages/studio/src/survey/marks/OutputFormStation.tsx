// OutputFormStation — S4 of the marks series (spec 046, FR-013..FR-017).
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
// SC-005: no designer-facing string here may contain the words "Unicode" or
// "normalization" — asserted mechanically in the station's tests.

import { Trans, useLingui } from "@lingui/react/macro";
import type { OutputForm, OutputFormProposal, PosturePair } from "@keyboard-studio/engine";
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
}

/**
 * Backspace peel sequence for a stack under a given form: each entry is what
 * remains after one more backspace. Ready-made removes the whole letter in
 * one step; base-plus-mark peels one mark at a time, closest-out first.
 */
export function backspaceSteps(pair: PosturePair, form: OutputForm): string[] {
  const { base, marks } = pair.stack;
  if (form === "ready-made") {
    return [(base + marks.join("")).normalize("NFC"), ""];
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

function useFormLabel(): Record<OutputForm, string> {
  const { t } = useLingui();
  return {
    "ready-made": t({
      id: "survey.marks.outputForm.formLabel.readyMade",
      message: "One ready-made character per accented letter",
    }),
    "base-plus-mark": t({
      id: "survey.marks.outputForm.formLabel.basePlusMark",
      message: "Letter plus mark, built as you type",
    }),
  };
}

/** Per-option consequence text for the FR-016 open choice (plain language). */
function useFormConsequence(): Record<OutputForm, string> {
  const { t } = useLingui();
  return {
    "base-plus-mark": t({
      id: "survey.marks.outputForm.formConsequence.basePlusMark",
      message:
        "Backspace peels one mark off at a time, and typing a mark key after any allowed letter adds the mark.",
    }),
    "ready-made": t({
      id: "survey.marks.outputForm.formConsequence.readyMade",
      message:
        "Each accented letter is a single unit — backspace removes the whole letter in one step.",
    }),
  };
}

export function OutputFormStation({ posture, proposal, value, onChange }: OutputFormStationProps) {
  const { t } = useLingui();
  const formLabel = useFormLabel();
  const formConsequence = useFormConsequence();
  const pair = previewPair(posture);
  const other: OutputForm = value === "ready-made" ? "base-plus-mark" : "ready-made";
  const sectionAriaLabel = t({
    id: "survey.marks.outputForm.sectionAriaLabel",
    message: "How accented letters are produced",
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
          <Trans id="survey.marks.outputForm.heading">How should your keyboard produce accented letters?</Trans>
        </h3>
        <p style={mutedParaFlush}>{proposal.explanation}</p>
        <div
          role="radiogroup"
          aria-label={t({ id: "survey.marks.outputForm.radiogroupAriaLabel", message: "Output form" })}
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

  return (
    <section data-testid="marks-output-form" aria-label={sectionAriaLabel}>
      <h3 style={sectionHeading}>
        <Trans id="survey.marks.outputForm.heading">How should your keyboard produce accented letters?</Trans>
      </h3>

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
        <p style={{ ...mutedParaFlush, margin: "6px 0 0 0" }}>{proposal.explanation}</p>
      </div>

      {pair !== undefined && <BackspacePreview pair={pair} form={value} />}

      <div style={{ marginTop: 10 }}>
        <button
          type="button"
          data-testid="output-form-change"
          onClick={() => onChange(other)}
          style={secondaryButton}
        >
          {t({
            id: "survey.marks.outputForm.useInsteadButton",
            message: `Use ${{ formLabel: formLabel[other].toLowerCase() }} instead`,
          })}
        </button>
      </div>
    </section>
  );
}
