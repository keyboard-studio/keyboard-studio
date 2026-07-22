// StackingStation — S5 of the marks series (spec 046, FR-018/FR-019).
//
// Rendered ONLY on stacking evidence: the confirmed alphabet contains an
// attested combination with two or more marks on one base, or two marks'
// plausible-base sets overlap; otherwise two-mark combinations stay blocked
// without asking. On an affirmative answer, the SPECIFIC attested multi-mark
// combinations are shown for explicit confirmation — the allowed stack list
// is never inferred from the individual marks' attachment rows.

import { Trans, useLingui } from "@lingui/react/macro";
import type { AttestedStack } from "@keyboard-studio/contracts";
import { toUPlusNotation } from "@keyboard-studio/contracts";
import { BORDER, TEXT_MAIN, mutedParaFlush, sectionHeading } from "../surveyStyles.ts";

export interface StackingStationProps {
  /** Attested multi-mark stacks (>= 2 marks on one base). */
  multiMarkStacks: AttestedStack[];
  allowed: boolean;
  onAllowedChange: (next: boolean) => void;
  /** Per-stack confirmation, keyed by the stack's ordered shape. */
  confirmed: Record<string, boolean>;
  onConfirmChange: (stackKey: string, next: boolean) => void;
}

export function stackKey(stack: AttestedStack): string {
  return `${stack.base} ${stack.marks.join(" ")}`;
}

function composed(stack: AttestedStack): string {
  return (stack.base + stack.marks.join("")).normalize("NFC");
}

export function StackingStation({
  multiMarkStacks,
  allowed,
  onAllowedChange,
  confirmed,
  onConfirmChange,
}: StackingStationProps) {
  const { t } = useLingui();
  const stackingOptions = [
    {
      v: true,
      label: t({
        id: "survey.marks.stacking.allowedOption.yes",
        message: "Yes — some letters carry two marks",
      }),
    },
    {
      v: false,
      label: t({
        id: "survey.marks.stacking.allowedOption.no",
        message: "No — one mark per letter",
      }),
    },
  ];
  return (
    <section
      data-testid="marks-stacking"
      aria-label={t({
        id: "survey.marks.stacking.sectionAriaLabel",
        message: "Two marks on one letter",
      })}
    >
      <h3 style={sectionHeading}>
        <Trans id="survey.marks.stacking.heading">Can one letter carry two marks at once?</Trans>
      </h3>
      <p style={mutedParaFlush}>
        <Trans id="survey.marks.stacking.intro">
          Your alphabet shows letters that may carry more than one mark. Confirm
          whether the keyboard should allow that, and exactly which combinations.
        </Trans>
      </p>
      <div
        role="radiogroup"
        aria-label={t({
          id: "survey.marks.stacking.radiogroupAriaLabel",
          message: "Allow two marks on one letter",
        })}
        style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}
      >
        {stackingOptions.map(({ v, label }) => (
          <label
            key={String(v)}
            style={{
              display: "flex",
              alignItems: "center",
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
              name="marks-stacking-allowed"
              checked={allowed === v}
              onChange={() => onAllowedChange(v)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>

      {allowed && multiMarkStacks.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <p style={{ ...mutedParaFlush, margin: "0 0 6px 0" }}>
            <Trans id="survey.marks.stacking.tickCombinationsIntro">
              Tick each combination your language actually uses (only ticked
              combinations will be typable):
            </Trans>
          </p>
          <div
            role="group"
            aria-label={t({
              id: "survey.marks.stacking.attestedGroupAriaLabel",
              message: "Attested two-mark combinations",
            })}
            style={{ display: "flex", flexWrap: "wrap", gap: 10 }}
          >
            {multiMarkStacks.map((stack) => {
              const key = stackKey(stack);
              return (
                <label
                  key={key}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 8px",
                    border: `1px solid ${BORDER}`,
                    borderRadius: 6,
                    fontSize: 14,
                    color: TEXT_MAIN,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={confirmed[key] === true}
                    onChange={(e) => onConfirmChange(key, e.target.checked)}
                    aria-label={t({
                      id: "survey.marks.stacking.checkboxAriaLabel",
                      message: `Allow ${{ composed: composed(stack) }} (${{ marks: stack.marks.map((m) => toUPlusNotation(m)).join(" + ") }})`,
                    })}
                  />
                  <span style={{ fontSize: 18 }}>{composed(stack)}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
