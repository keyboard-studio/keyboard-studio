// InputOrderStation — S3 of the marks series (spec 046, FR-012/FR-025).
//
// The content and prefill behavior of the retired standalone question
// `pb_mark_input_order` (survey/questions/b/pb_mark_input_order.ts at
// retirement), relocated VERBATIM into the series: prompt, help text, and the
// two options are unchanged; the prefill comes from the base keyboard's own
// behavior (`detectMarkInputOrderFromImport` → session axes markInputOrder)
// when available. Rendered only when at least one mark-class was confirmed as
// letter-plus-mark — attach order is meaningless without a productive mark key.

import { BORDER, TEXT_MAIN, mutedParaFlush, sectionHeading } from "../surveyStyles.ts";

export type MarkInputOrder = "prefix" | "postfix";

export interface InputOrderStationProps {
  value: MarkInputOrder;
  onChange: (next: MarkInputOrder) => void;
  /** True when the current value came from the base keyboard's own behavior. */
  prefilledFromImport: boolean;
}

// Wording preserved from pb_mark_input_order (FR-025 preserve-and-relocate).
const PROMPT =
  "When typing a letter with a diacritic, does the typist expect to press the " +
  "diacritic key before the letter, or type the letter first and then the diacritic?";

const HELP_TEXT =
  "For example: pressing the diacritic key first and then the letter (like " +
  "pressing a key for an acute accent and then a to get a-with-acute, or " +
  "pressing an underdot key before s to get s-with-underdot), or typing " +
  "the letter first and then a suffix key (like typing a and then a special " +
  "key to add the diacritic after). There is no wrong answer -- this depends " +
  "on what feels natural to your community and what existing keyboards " +
  "already do.";

const OPTIONS: { value: MarkInputOrder; label: string }[] = [
  {
    value: "prefix",
    label:
      "Diacritic key first, then the letter (the diacritic key is pressed before the base letter)",
  },
  {
    value: "postfix",
    label:
      "Letter first, then the diacritic key (type the base letter, then press a key to add the diacritic)",
  },
];

export function InputOrderStation({ value, onChange, prefilledFromImport }: InputOrderStationProps) {
  return (
    <section data-testid="marks-input-order" aria-label="Mark input order">
      <h3 style={sectionHeading}>{PROMPT}</h3>
      <p style={mutedParaFlush}>{HELP_TEXT}</p>
      <div role="radiogroup" aria-label="Mark input order" style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              padding: "6px 10px",
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              fontSize: 13,
              color: TEXT_MAIN,
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name="marks-input-order"
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {prefilledFromImport && (
        <p style={{ ...mutedParaFlush, marginTop: 8, fontSize: 12 }}>
          Pre-filled from how the keyboard you started from already behaves.
        </p>
      )}
    </section>
  );
}
