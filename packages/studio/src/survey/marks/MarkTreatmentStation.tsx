// MarkTreatmentStation — S2 of the marks series (spec 052, replacing
// MentalModelStation).
//
// Three independently-settable decisions on one screen (FR-003):
//
//   1. TREATMENT — does this mark get a key of its own? Asked once per
//      mark-class, overridable per mark. Radios, recommendation pre-selected
//      and tagged "(suggested)" — never an unanswered open choice (FR-009).
//   2. PROMOTION — which specific marked characters get keys of their own?
//      CHECKBOXES, not radios: promotion is a set, and it is independent of
//      treatment. A mark may earn its own key AND have promoted characters.
//      The group is ABSENT from the DOM when there is nothing to promote, and
//      PRESENT-BUT-DISABLED with a plain-language reason when the base
//      keyboard has no room for the extra keys (FR-015) — two distinct states.
//   3. INPUT ORDER — folded in from the retired S3 station (FR-004), which is
//      what takes the series from five rendered stations to four (FR-018).
//      Its content is READ from the relocated question module, never
//      duplicated.
//
// Designer-facing language (FR-007/FR-008): nothing here may assert or deny
// that a marked form is a letter of an alphabet, nor presuppose alphabetic
// writing — Devanagari dependent vowel signs, Arabic harakat, and Hebrew
// niqqud all reach this station. Nothing here may use production jargon
// either: no term for a mark key that waits for a character, no encoding, no
// normalisation. Both are asserted mechanically over a five-script fixture
// matrix in MarksSeriesStep.test.tsx, not left to review (SC-004).

import { Trans, useLingui } from "@lingui/react/macro";
import type {
  MarkClass,
  MarkTreatment,
  MarkTreatmentAnswer,
  MarkTreatmentPrefill,
  PromotedComposedCharacter,
} from "@keyboard-studio/engine";
import { treatmentFor } from "@keyboard-studio/engine";
import { toUPlusNotation, type MarkInputOrder } from "@keyboard-studio/contracts";
import { prefixCombiningMark } from "../../lib/irToCarveNodes.ts";
import { definition as markInputOrderDefinition } from "../questions/reserve/pb_mark_input_order.ts";
import { MarkDemoWidget } from "./MarkDemoWidget.tsx";
import {
  BORDER,
  TEXT_DIM,
  TEXT_MAIN,
  mutedParaFlush,
  sectionHeading,
} from "../surveyStyles.ts";

export interface MarkTreatmentStationProps {
  classes: MarkClass[];
  prefills: MarkTreatmentPrefill[];
  /** The recorded answer — treatment, promotion set, and input order. */
  answer: MarkTreatmentAnswer;
  /** Per class id: the characters this class could promote (empty = absent). */
  promotable: Record<string, PromotedComposedCharacter[]>;
  /**
   * Base letters from the author's own confirmed alphabet, in display order —
   * what the option demonstrations are built from (FR-010). The first entry is
   * used; an empty list means no demonstration can be built from the author's
   * own material, and none is shown rather than one invented from ours.
   */
  demoLetters: string[];
  onClassTreatmentChange: (classId: string, next: MarkTreatment) => void;
  onMarkTreatmentChange: (mark: string, next: MarkTreatment) => void;
  onPromotionToggle: (character: PromotedComposedCharacter, next: boolean) => void;
  onInputOrderChange: (next: MarkInputOrder) => void;
  /** True when the order value came from the base keyboard's own behaviour. */
  orderPrefilledFromImport: boolean;
}

// Content read from the RELOCATED question module (spec 071 FR-025: relocated,
// not duplicated). pb_mark_input_order stays on disk as the content source; this
// station is its new home now that the standalone S3 screen is retired.
const ORDER_PROMPT = markInputOrderDefinition.prompt;
const ORDER_HELP_TEXT = markInputOrderDefinition.help_text;
const ORDER_OPTIONS: { value: MarkInputOrder; label: string }[] = (
  markInputOrderDefinition.options ?? []
).map((o) => ({ value: o.value as MarkInputOrder, label: o.label }));

const TREATMENT_VALUES: MarkTreatment[] = ["own-key", "composed"];

function classMarksLabel(markClass: MarkClass): string {
  return markClass.marks
    .map((m) => `${prefixCombiningMark(m, true)} (${toUPlusNotation(m)})`)
    .join(", ");
}

/** A stable, attribute-safe handle for one mark (combining chars are not). */
function markHandle(mark: string): string {
  return toUPlusNotation(mark);
}

const optionRow = (disabled: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  padding: "6px 10px",
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  fontSize: 13,
  color: disabled ? TEXT_DIM : TEXT_MAIN,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.7 : 1,
});

export function MarkTreatmentStation({
  classes,
  prefills,
  answer,
  promotable,
  demoLetters,
  onClassTreatmentChange,
  onMarkTreatmentChange,
  onPromotionToggle,
  onInputOrderChange,
  orderPrefilledFromImport,
}: MarkTreatmentStationProps) {
  const { t } = useLingui();
  const prefillByClass = new Map(prefills.map((p) => [p.classId, p]));
  const promotedSet = new Set(answer.promoted.map((c) => c.normalize("NFC")));

  const treatmentLabel: Record<MarkTreatment, string> = {
    "own-key": t({
      id: "survey.marks.treatment.option.ownKey",
      message: "The mark gets a key of its own, and works with every character it attaches to",
    }),
    composed: t({
      id: "survey.marks.treatment.option.composed",
      message: "Each marked character gets a key of its own, and the mark has no key",
    }),
  };

  return (
    <section
      data-testid="marks-treatment"
      aria-label={t({
        id: "survey.marks.treatment.sectionAriaLabel",
        message: "How your marks are typed",
      })}
    >
      <h3 style={sectionHeading}>
        <Trans id="survey.marks.treatment.heading">How should your marks be typed?</Trans>
      </h3>
      <p style={mutedParaFlush}>
        <Trans id="survey.marks.treatment.intro">
          We have suggested an answer for each group. Change any of them if it does not
          match how your community writes.
        </Trans>
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 12 }}>
        {classes.map((markClass) => {
          const prefill = prefillByClass.get(markClass.id);
          const current =
            answer.classTreatment[markClass.id] ?? prefill?.recommended ?? "composed";
          const offered = promotable[markClass.id] ?? [];
          const affordable = prefill?.signals.promotionAffordable !== false;
          const reason = prefill?.signals.unaffordableReason;
          // The demonstration is built from the author's own material: the first
          // confirmed letter and this class's first mark (FR-010).
          const demoLetter = demoLetters[0];
          const demoMark = markClass.marks[0];

          return (
            <div key={markClass.id} data-testid={`treatment-${markClass.id}`}>
              <p style={{ margin: "0 0 2px 0", fontSize: 14, fontWeight: 600, color: TEXT_MAIN }}>
                {markClass.label}
              </p>
              <p style={{ ...mutedParaFlush, margin: "0 0 6px 0", fontSize: 12 }}>
                {classMarksLabel(markClass)}
              </p>

              {/* 1 — treatment. */}
              <div
                role="radiogroup"
                aria-label={t({
                  id: "survey.marks.treatment.radiogroupAriaLabel",
                  message: `${{ classLabel: markClass.label }} — how these marks are typed`,
                })}
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
              >
                {TREATMENT_VALUES.map((value) => (
                  // Selection and demonstration are separate controls, side by
                  // side (US2 AC6): operating the demo never selects the option
                  // (FR-012), so the demo lives OUTSIDE the option's <label>.
                  <div key={value}>
                    <label
                      data-testid={`treatment-option-${markClass.id}-${value}`}
                      style={optionRow(false)}
                    >
                      <input
                        type="radio"
                        name={`treatment-${markClass.id}`}
                        checked={current === value}
                        onChange={() => onClassTreatmentChange(markClass.id, value)}
                      />
                      <span>
                        {treatmentLabel[value]}
                        {value === prefill?.recommended && (
                          <span style={{ color: TEXT_DIM, fontSize: 11 }}>
                            {" "}
                            <Trans id="survey.marks.treatment.suggestedTag">(suggested)</Trans>
                          </span>
                        )}
                      </span>
                    </label>
                    {demoLetter !== undefined && demoMark !== undefined && (
                      <MarkDemoWidget
                        testId={`demo-${markClass.id}-${value}`}
                        option={value}
                        inputOrder={answer.inputOrder}
                        letter={demoLetter}
                        mark={demoMark}
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* 1b — per-mark override, only worth offering when the group has
                  more than one member (FR-001). A class may end up internally
                  mixed; that is legal. */}
              {markClass.marks.length > 1 && (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ fontSize: 12, color: TEXT_DIM, cursor: "pointer" }}>
                    <Trans id="survey.marks.treatment.overrideSummary">
                      One of these marks is different
                    </Trans>
                  </summary>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                    {markClass.marks.map((mark) => {
                      const resolved = treatmentFor(mark, answer, classes, prefills);
                      return (
                        <div
                          key={mark}
                          data-testid={`treatment-mark-${markHandle(mark)}`}
                          style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}
                        >
                          <span style={{ minWidth: 90 }}>
                            {prefixCombiningMark(mark, true)} ({markHandle(mark)})
                          </span>
                          {TREATMENT_VALUES.map((value) => (
                            <label
                              key={value}
                              style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}
                            >
                              <input
                                type="radio"
                                name={`treatment-mark-${markHandle(mark)}`}
                                checked={resolved === value}
                                onChange={() => onMarkTreatmentChange(mark, value)}
                              />
                              <span>{treatmentLabel[value]}</span>
                            </label>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}

              {/* 2 — promotion. ABSENT when there is nothing to decide;
                  PRESENT-BUT-DISABLED with a reason when the budget cannot seat
                  it (FR-015). These are deliberately different DOM states. */}
              {offered.length > 0 && (
                <fieldset
                  data-testid={`promotion-${markClass.id}`}
                  disabled={!affordable}
                  style={{
                    marginTop: 10,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 6,
                    padding: "8px 10px",
                    opacity: affordable ? 1 : 0.7,
                  }}
                >
                  <legend style={{ fontSize: 12, color: TEXT_MAIN, padding: "0 4px" }}>
                    <Trans id="survey.marks.treatment.promotionLegend">
                      Any of these that your community uses very often can also get a key
                      of its own
                    </Trans>
                  </legend>
                  {!affordable && reason !== undefined && (
                    <p
                      data-testid={`promotion-unavailable-reason-${markClass.id}`}
                      style={{ ...mutedParaFlush, margin: "0 0 6px 0", fontSize: 12 }}
                    >
                      {reason}
                    </p>
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {offered.map((character) => (
                      <label
                        key={character}
                        data-testid={`promotion-${markClass.id}-${character}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "4px 8px",
                          border: `1px solid ${BORDER}`,
                          borderRadius: 6,
                          fontSize: 14,
                          color: affordable ? TEXT_MAIN : TEXT_DIM,
                          cursor: affordable ? "pointer" : "not-allowed",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={promotedSet.has(character.normalize("NFC"))}
                          disabled={!affordable}
                          onChange={(e) => onPromotionToggle(character, e.target.checked)}
                        />
                        <span>{character}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </div>
          );
        })}
      </div>

      {/* 3 — input order, folded in from the retired S3 station (FR-004). */}
      <div data-testid="input-order" style={{ marginTop: 24 }}>
        <p style={{ margin: "0 0 2px 0", fontSize: 14, fontWeight: 600, color: TEXT_MAIN }}>
          {ORDER_PROMPT}
        </p>
        <p style={{ ...mutedParaFlush, margin: "0 0 8px 0", fontSize: 12 }}>{ORDER_HELP_TEXT}</p>
        <div
          role="radiogroup"
          aria-label={t({
            id: "survey.marks.treatment.orderRadiogroupAriaLabel",
            message: "Mark input order",
          })}
          style={{ display: "flex", flexDirection: "column", gap: 6 }}
        >
          {ORDER_OPTIONS.map((option) => (
            <label
              key={option.value}
              data-testid={`input-order-option-${option.value}`}
              style={optionRow(false)}
            >
              <input
                type="radio"
                name="marks-input-order"
                checked={answer.inputOrder === option.value}
                onChange={() => onInputOrderChange(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        {orderPrefilledFromImport && (
          <p style={{ ...mutedParaFlush, marginTop: 8, fontSize: 12 }}>
            <Trans id="survey.marks.treatment.orderPrefilledFromImportNote">
              Pre-filled from how the keyboard you started from already behaves.
            </Trans>
          </p>
        )}
      </div>
    </section>
  );
}
