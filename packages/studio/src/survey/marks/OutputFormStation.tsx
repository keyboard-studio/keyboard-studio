// OutputFormStation — S4 of the marks series (issue #2297, superseding the
// spec 071 FR-013..FR-017 framing).
//
// ONE whole-keyboard decision, asked in its OWN terms: when a marked
// character is written — however the author called it up — what does the
// keyboard send? A single ready-made character (e.g. à as one character,
// U+00E0), or the letter and its mark(s) as separate characters (a + ◌̀,
// U+0061 + U+0300)? Each option shows the actual characters and code points
// for one of the author's own combinations, so the author answers about
// OUTPUT, not about typing.
//
// Independence (#2297, Matthew's boundary): this question is separate from
// the input-order question (#2293 — in what order keys are pressed) and
// from placement treatment (which marks get keys of their own). The
// suggestion is derived from the input order alone (letter-then-mark →
// letter plus mark; mark-then-letter → ready-made) and is presented as a
// suggestion to confirm or overturn (Art. X) — never silently carried by
// the order answer, and the non-suggested pairing is always choosable:
// Keyman can rewrite the letter when a mark follows it, and can send letter
// plus mark for a combination completed by a mark pressed first.
//
// Scope ruling (Matthew, 2026-10-19, #2297 comment 6277630830): composition
// is NFC or NFD only — one keyboard-wide policy, no per-mark/per-class/
// per-combination exceptions and no "mixed" option. Under the ready-made
// policy, a combination with no single ready-made character is sent as
// letter plus mark automatically — the only way it can be written — and
// the station states that as a note, never as a per-item question.
//
// The step-by-step backspace preview stays (the FR-017 consequence demo):
// it shows what backspace DOES to written text under the recorded
// backspace answer — it is not a typing demo and does not stand in for
// either choice.
//
// The backspace question (#2302, restoring the #1791 framing #2297
// retired): backspace behaviour is a SECOND whole-keyboard answer asked
// at this same station, in its own terms — "What should backspace do to
// an accented letter?" Matthew's model (2026-10-19): input order, output
// composition and backspace are all interrelated, yet independent. The
// consistent pairings (letter+mark sent separately ↔ peel one mark at a
// time; single ready-made character ↔ clear the whole letter at once)
// are the proposal — the backspace suggestion FOLLOWS the composition
// answer above — and the author may override to the other behaviour
// under either form: Keyman can mix and match with extra code, and the
// engine generates the rules for the off-pairings (stepwise unwrap under
// ready-made; whole-stack deletion under base-plus-mark). The preview
// therefore keys off the BACKSPACE answer applied to the chosen form's
// text — before #2302 it was derived from the form alone, which stated
// the ready-made behaviour as whole-letter clear while generated
// keyboards in fact peeled.
//
// SC-005: no designer-facing string here may contain the words "Unicode" or
// "normalization" — asserted mechanically in the station's tests.

import { Trans, useLingui } from "@lingui/react/macro";
import {
  composeStack,
  toUPlusNotation,
  type BackspaceBehaviour,
  type MarkInputOrder,
} from "@keyboard-studio/contracts";
import type {
  BackspaceProposal,
  OutputForm,
  OutputFormProposal,
  PosturePair,
} from "@keyboard-studio/engine";
import {
  ACCENT,
  BORDER,
  TEXT_DIM,
  TEXT_MAIN,
  mutedParaFlush,
  sectionHeading,
} from "../surveyStyles.ts";

export interface OutputFormStationProps {
  posture: PosturePair[];
  proposal: OutputFormProposal;
  /** The current answer (defaults to the proposal's form). */
  value: OutputForm;
  onChange: (next: OutputForm) => void;
  /**
   * The author's input-order answer — the suggestion's ONLY source. The
   * station states it back as the premise so the suggestion is visibly a
   * suggestion ABOUT composition, derived from the order they chose.
   */
  inputOrder: MarkInputOrder;
  /** The backspace proposal — derived from the composition answer alone. */
  backspaceProposal: BackspaceProposal;
  /** The current backspace answer (defaults to the proposal's behaviour). */
  backspace: BackspaceBehaviour;
  onBackspaceChange: (next: BackspaceBehaviour) => void;
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

/**
 * The step-by-step effect of backspace under a recorded BACKSPACE ANSWER
 * (#2302), applied to the text the chosen form emits:
 *
 * - `peel` — one mark at a time off the stack, however the form emits it
 *   (under ready-made the generated unwrap rules step the single character
 *   down through the same sequence).
 * - `whole-stack` — the emitted letter, then nothing: one press clears
 *   the letter and all its marks (native under ready-made; generated
 *   deletion rules under base-plus-mark).
 */
export function backspaceStepsForBehaviour(
  pair: PosturePair,
  form: OutputForm,
  behaviour: BackspaceBehaviour,
): string[] {
  if (behaviour === "whole-stack") {
    return [backspaceSteps(pair, form)[0] ?? "", ""];
  }
  const { base, marks } = pair.stack;
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

/** Prefer a pair WITH a ready-made form for the code-point examples. */
function examplePair(posture: PosturePair[]): PosturePair | undefined {
  return posture.find((p) => p.hasReadyMadeForm) ?? posture[0];
}

function BackspacePreview({
  pair,
  form,
  behaviour,
}: {
  pair: PosturePair;
  form: OutputForm;
  behaviour: BackspaceBehaviour;
}) {
  const { t } = useLingui();
  const steps = backspaceStepsForBehaviour(pair, form, behaviour);
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

/** Per-form option labels — what the keyboard SENDS, in composition terms. */
function useFormLabel(): Record<OutputForm, string> {
  const { t } = useLingui();
  return {
    "ready-made": t({
      id: "survey.marks.outputForm.optionLabel.readyMade",
      message: "Send each accented letter as one single ready-made character",
    }),
    "base-plus-mark": t({
      id: "survey.marks.outputForm.optionLabel.basePlusMark",
      message: "Send the letter and its mark as separate characters",
    }),
  };
}

/**
 * Per-option consequence text: what backspace does, and how the sent text
 * behaves when it is searched or compared — the two observable consequences
 * of the composition policy. (Ids retained from the backspace framing: the
 * consequence sentences themselves are unchanged. Their backspace clause
 * states the form's NATIVE behaviour — the pairing the backspace question
 * below proposes; the recorded backspace answer governs what the produced
 * keyboard actually does.)
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
 * Per-option labels for the backspace question — the as-was #1791 strings,
 * restored with their original ids (the ids were keyed by the form whose
 * native behaviour the label describes; the label texts are behaviour
 * descriptions, and each now labels the behaviour itself):
 * `peel` carries the base-plus-mark label, `whole-stack` the ready-made one.
 */
function useBackspaceLabel(): Record<BackspaceBehaviour, string> {
  const { t } = useLingui();
  return {
    peel: t({
      id: "survey.marks.outputForm.backspaceLabel.basePlusMark",
      message: "Backspace removes one mark at a time (letter and mark kept separate)",
    }),
    "whole-stack": t({
      id: "survey.marks.outputForm.backspaceLabel.readyMade",
      message: "Backspace removes the whole letter at once (one ready-made unit)",
    }),
  };
}

/**
 * The code points each option sends for one of the author's own
 * combinations — the question answered about output, concretely. For the
 * ready-made option on a combination with no single ready-made character,
 * the line shows the automatic fallback instead (letter plus mark — the
 * only way that letter can be sent).
 */
function CodePointLine({ pair, form }: { pair: PosturePair; form: OutputForm }) {
  const { t } = useLingui();
  const { base, marks } = pair.stack;
  const literal = base + marks.join("");
  const parts = [base, ...marks].map((c) => toUPlusNotation(c)).join(" + ");
  let text: string;
  if (form === "ready-made" && pair.hasReadyMadeForm && pair.readyMadeForm !== undefined) {
    text =
      `${pair.readyMadeForm} — ${toUPlusNotation(pair.readyMadeForm)} ` +
      t({ id: "survey.marks.outputForm.codePoints.oneCharacter", message: "(one character)" });
  } else if (form === "ready-made") {
    text =
      `${literal} — ${parts} ` +
      t({
        id: "survey.marks.outputForm.codePoints.noSingleForm",
        message: "(no single character exists for this letter, so it is sent as letter plus mark)",
      });
  } else {
    text =
      `${literal} — ${parts} ` +
      t({ id: "survey.marks.outputForm.codePoints.separateCharacters", message: "(separate characters)" });
  }
  return (
    <span data-testid={`output-form-codepoints-${form}`} style={{ fontSize: 12, color: TEXT_DIM }}>
      {text}
    </span>
  );
}

/**
 * The input-order answer, stated back as the premise: it is where the
 * suggestion comes from, and saying so keeps the suggestion recognisably a
 * suggestion about composition — not an answer smuggled in by the order
 * question.
 */
function OrderPremise({ inputOrder }: { inputOrder: MarkInputOrder }) {
  const { t } = useLingui();
  const text =
    inputOrder === "postfix"
      ? t({
          id: "survey.marks.outputForm.premise.postfix",
          message: "From the previous question — you type the letter first, then its mark.",
        })
      : t({
          id: "survey.marks.outputForm.premise.prefix",
          message: "From the previous question — you press the mark first, then the letter.",
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
  inputOrder,
  backspaceProposal,
  backspace,
  onBackspaceChange,
}: OutputFormStationProps) {
  const { t } = useLingui();
  const formLabel = useFormLabel();
  const formConsequence = useFormConsequence();
  const backspaceLabel = useBackspaceLabel();
  const pair = previewPair(posture);
  const example = examplePair(posture);
  const sectionAriaLabel = t({
    id: "survey.marks.outputForm.compositionSectionAriaLabel",
    message: "How accented letters are sent",
  });
  // An open choice, suggested option first (Art. X propose-then-confirm) —
  // both policies are always choosable, including ready-made when some
  // combination has no single ready-made character (the fallback is
  // automatic; see the note rendered under a ready-made answer).
  const suggestedFirst: OutputForm[] =
    proposal.form === "ready-made"
      ? ["ready-made", "base-plus-mark"]
      : ["base-plus-mark", "ready-made"];
  // Same propose-then-confirm shape for the backspace question: the
  // suggested behaviour (the one that follows the composition answer)
  // is listed first and tagged; the other stays choosable.
  const backspaceSuggestedFirst: BackspaceBehaviour[] =
    backspaceProposal.behaviour === "peel" ? ["peel", "whole-stack"] : ["whole-stack", "peel"];

  return (
    <section data-testid="marks-output-form" aria-label={sectionAriaLabel}>
      <h3 style={sectionHeading}>
        {/* New id: the question changed from the backspace framing (#1791)
            to the composition question itself (#2297; spec 046: rename the
            id when the meaning changes). */}
        <Trans id="survey.marks.outputForm.compositionHeading">
          When a letter with a mark is written, what should your keyboard send?
        </Trans>
      </h3>
      <OrderPremise inputOrder={inputOrder} />
      <p style={mutedParaFlush}>{proposal.explanation}</p>
      <div
        role="radiogroup"
        aria-label={t({
          id: "survey.marks.outputForm.compositionRadiogroupAriaLabel",
          message: "What your keyboard sends for a letter with a mark",
        })}
        style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}
      >
        {suggestedFirst.map((form) => (
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
                  <Trans id="survey.marks.outputForm.suggestedTag">(suggested)</Trans>
                </span>
              )}
            </span>
            {example !== undefined && <CodePointLine pair={example} form={form} />}
            <span style={{ ...mutedParaFlush, fontSize: 12 }}>{formConsequence[form]}</span>
          </label>
        ))}
      </div>

      {/* The automatic fallback, stated as a fact — never a question, and
          never a reason to hide the ready-made answer: some combinations
          have no single ready-made character, and those are sent as letter
          plus mark under EITHER policy's ready-made choice because there is
          no single character to send. */}
      {proposal.anyPairLacksReadyMade && value === "ready-made" && (
        <p data-testid="output-form-fallback-note" style={{ ...mutedParaFlush, margin: "10px 0 0 0", fontSize: 12 }}>
          <Trans id="survey.marks.outputForm.fallbackNote">
            Some of your accented letters have no single ready-made character. Those letters
            are always sent as the letter plus its mark — there is no single character to send.
          </Trans>
        </p>
      )}

      {/* The backspace question (#2302): its own headed question at this
          station, restored as it was (#1791 wording) and integrated with
          the composition question above — neither stands in for the other.
          The suggestion follows the composition answer (the consistent
          pairing); either behaviour stays choosable under either form.
          The preview keys off THIS answer applied to the chosen form's
          text, so what it demonstrates is what the produced keyboard's
          backspace actually does. */}
      <div
        data-testid="marks-backspace"
        aria-label={t({
          id: "survey.marks.outputForm.backspaceSectionAriaLabel",
          message: "What backspace does to an accented letter",
        })}
        style={{ marginTop: 22 }}
      >
        <h3 style={sectionHeading}>
          <Trans id="survey.marks.outputForm.backspaceHeading">
            What should backspace do to an accented letter?
          </Trans>
        </h3>
        <p style={mutedParaFlush}>{backspaceProposal.explanation}</p>
        <div
          role="radiogroup"
          aria-label={t({
            id: "survey.marks.outputForm.backspaceRadiogroupAriaLabel",
            message: "What backspace does",
          })}
          style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}
        >
          {backspaceSuggestedFirst.map((behaviour) => (
            <label
              key={behaviour}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: "10px 12px",
                border: `1px solid ${behaviour === backspace ? ACCENT : BORDER}`,
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: TEXT_MAIN }}>
                <input
                  type="radio"
                  name="marks-backspace"
                  checked={backspace === behaviour}
                  onChange={() => onBackspaceChange(behaviour)}
                />
                <strong>{backspaceLabel[behaviour]}</strong>
                {behaviour === backspaceProposal.behaviour && (
                  <span style={{ fontSize: 11, color: ACCENT }}>
                    <Trans id="survey.marks.outputForm.recommendedTag">recommended</Trans>
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
        {pair !== undefined && (
          <div style={{ marginTop: 10 }}>
            <BackspacePreview pair={pair} form={value} behaviour={backspace} />
          </div>
        )}
      </div>
    </section>
  );
}
