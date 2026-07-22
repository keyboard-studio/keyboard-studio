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
        What backspace does, one press at a time:
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
              {step === "" ? <span style={{ color: TEXT_DIM, fontSize: 12 }}>(empty)</span> : step}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

const FORM_LABEL: Record<OutputForm, string> = {
  "ready-made": "One ready-made character per accented letter",
  "base-plus-mark": "Letter plus mark, built as you type",
};

export function OutputFormStation({ posture, proposal, value, onChange }: OutputFormStationProps) {
  const pair = previewPair(posture);
  const other: OutputForm = value === "ready-made" ? "base-plus-mark" : "ready-made";

  return (
    <section data-testid="marks-output-form" aria-label="How accented letters are produced">
      <h3 style={sectionHeading}>How should your keyboard produce accented letters?</h3>

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
          {FORM_LABEL[value]}
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
          Use {FORM_LABEL[other].toLowerCase()} instead
        </button>
      </div>
    </section>
  );
}
