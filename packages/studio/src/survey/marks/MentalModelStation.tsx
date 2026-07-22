// MentalModelStation — S2 of the marks series (spec 046, FR-010/FR-011).
//
// One confirmation per MARK-CLASS (not per mark): does the community treat a
// marked letter as its own letter of the alphabet, or as a base letter with
// an added mark? Prefilled from the FR-011 signals (productivity spread, the
// base keyboard's own mechanism, spare-key affordability); when own-letter is
// unaffordable it renders disabled with the reason stated. A designer can
// split an individual mark out of its class's answer (the "mixed" path —
// recorded as per-mark overrides downstream).

import type { MarkClass, MentalModelAnswer, MentalModelPrefill } from "@keyboard-studio/engine";
import { toUPlusNotation } from "@keyboard-studio/contracts";
import { prefixCombiningMark } from "../../lib/irToCarveNodes.ts";
import {
  BORDER,
  ERROR_RED,
  TEXT_DIM,
  TEXT_MAIN,
  mutedParaFlush,
  sectionHeading,
} from "../surveyStyles.ts";

export interface MentalModelStationProps {
  classes: MarkClass[];
  prefills: MentalModelPrefill[];
  /** Current answers, keyed by class id (seeded from the prefills). */
  answers: Record<string, MentalModelAnswer>;
  onChange: (classId: string, answer: MentalModelAnswer) => void;
}

function classMarksLabel(markClass: MarkClass): string {
  return markClass.marks
    .map((m) => `${prefixCombiningMark(m, true)} (${toUPlusNotation(m)})`)
    .join(", ");
}

const ANSWER_LABEL: Record<MentalModelAnswer, string> = {
  "own-letter": "Each marked letter is its own letter of the alphabet",
  "letter-plus-mark": "The mark is added to a letter as you type",
};

export function MentalModelStation({
  classes,
  prefills,
  answers,
  onChange,
}: MentalModelStationProps) {
  const prefillByClass = new Map(prefills.map((p) => [p.classId, p]));

  return (
    <section data-testid="marks-mental-model" aria-label="How your community thinks of marked letters">
      <h3 style={sectionHeading}>How does your community think of marked letters?</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {classes.map((markClass) => {
          const prefill = prefillByClass.get(markClass.id);
          const unaffordable = prefill?.signals.ownLetterAffordable === false;
          const current = answers[markClass.id] ?? prefill?.recommended ?? "own-letter";
          return (
            <div key={markClass.id} data-testid={`mental-model-${markClass.id}`}>
              <p style={{ margin: "0 0 2px 0", fontSize: 14, fontWeight: 600, color: TEXT_MAIN }}>
                {markClass.label}
              </p>
              <p style={{ ...mutedParaFlush, margin: "0 0 6px 0", fontSize: 12 }}>
                {classMarksLabel(markClass)}
              </p>
              <div role="radiogroup" aria-label={`${markClass.label} — own letter or letter plus mark`} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(Object.keys(ANSWER_LABEL) as MentalModelAnswer[]).map((answer) => {
                  const disabled = answer === "own-letter" && unaffordable;
                  return (
                    <label
                      key={answer}
                      style={{
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
                      }}
                    >
                      <input
                        type="radio"
                        name={`mental-model-${markClass.id}`}
                        checked={current === answer}
                        disabled={disabled}
                        onChange={() => onChange(markClass.id, answer)}
                      />
                      <span>
                        {ANSWER_LABEL[answer]}
                        {answer === prefill?.recommended && (
                          <span style={{ color: TEXT_DIM, fontSize: 11 }}> (suggested)</span>
                        )}
                        {disabled && prefill?.signals.unaffordableReason !== undefined && (
                          <span style={{ display: "block", color: ERROR_RED, fontSize: 11 }}>
                            {prefill.signals.unaffordableReason}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
