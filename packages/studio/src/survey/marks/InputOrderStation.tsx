// InputOrderStation — S3 of the marks series (spec 046, FR-012/FR-025).
//
// The content and prefill behavior of the retired standalone question
// `pb_mark_input_order` (survey/questions/reserve/pb_mark_input_order.ts,
// physically relocated there), relocated VERBATIM into the series: prompt, help text, and the
// two options are unchanged; the prefill comes from the base keyboard's own
// behavior (`detectMarkInputOrderFromImport` → session axes markInputOrder)
// when available. Rendered only when at least one mark-class was confirmed as
// letter-plus-mark — attach order is meaningless without a productive mark key.

import { Trans, useLingui } from "@lingui/react/macro";
import { definition as markInputOrderDefinition } from "../questions/reserve/pb_mark_input_order.ts";
import { BORDER, TEXT_MAIN, mutedParaFlush, sectionHeading } from "../surveyStyles.ts";

export type MarkInputOrder = "prefix" | "postfix";

export interface InputOrderStationProps {
  value: MarkInputOrder;
  onChange: (next: MarkInputOrder) => void;
  /** True when the current value came from the base keyboard's own behavior. */
  prefilledFromImport: boolean;
}

// Content read from the RELOCATED module itself (FR-025: relocated, not
// duplicated) — pb_mark_input_order stays on disk, unregistered from the
// Phase B flow; this station is its new home.
const PROMPT = markInputOrderDefinition.prompt;
const HELP_TEXT = markInputOrderDefinition.help_text;
const OPTIONS: { value: MarkInputOrder; label: string }[] = (
  markInputOrderDefinition.options ?? []
).map((o) => ({ value: o.value as MarkInputOrder, label: o.label }));

export function InputOrderStation({ value, onChange, prefilledFromImport }: InputOrderStationProps) {
  const { t } = useLingui();
  const sectionAriaLabel = t({
    id: "survey.marks.inputOrder.sectionAriaLabel",
    message: "Mark input order",
  });
  return (
    <section data-testid="marks-input-order" aria-label={sectionAriaLabel}>
      <h3 style={sectionHeading}>{PROMPT}</h3>
      <p style={mutedParaFlush}>{HELP_TEXT}</p>
      <div role="radiogroup" aria-label={sectionAriaLabel} style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
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
          <Trans id="survey.marks.inputOrder.prefilledFromImportNote">
            Pre-filled from how the keyboard you started from already behaves.
          </Trans>
        </p>
      )}
    </section>
  );
}
