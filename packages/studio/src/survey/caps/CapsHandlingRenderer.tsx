// CapsHandlingRenderer — the `caps-handling` module's renderer (spec 112).
//
// A radio group on the layout screen: cased keys / explicit rules / none. The
// derived key set is shown, never stored: "also covers" lists the keys beyond
// the layout family's floor that the store will declare, and conflicts name
// keys left out because a plane types a different, non-case pair (research
// R1). A caseless alphabet is not asked: nothing renders and the step is
// recorded as not asked.
//
// CapsHandlingView is the pure presentation (props in, onChange out);
// CapsHandlingRenderer binds it to the stores the way the other hosted
// renderers do.

import { useEffect, useMemo, type ComponentType } from "react";
import { useLingui } from "@lingui/react/macro";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import type { CapsHandlingValue, DecisionRendererProps } from "../../decisions/decisionTypes.ts";
import { RadioGroup, type RadioOption } from "../../ui/RadioGroup.tsx";
import { TEXT_DIM, TEXT_MAIN, FONT } from "../surveyStyles.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { useSurveyAnswerStore } from "../../stores/surveyAnswerStore.ts";
import { deriveSurveyContext } from "../../decisions/identitySelectors.ts";
import { deriveCasedKeys, capsFloorFor } from "../../lib/casedKeysDerivation.ts";
import { alphabetOf, capsModesOffered, isCasedAlphabet } from "./capsLogic.ts";

/** The status slot the caseless pass is recorded under (the step is a section of the layout screen). */
export const CAPS_STATUS_STEP_ID = "caps";
export const CAPS_REASON_CASELESS = { code: "caps-caseless" } as const;

export interface CapsHandlingViewProps {
  value: CapsHandlingValue | undefined;
  onChange: (value: CapsHandlingValue) => void;
  /** The working copy; null before instantiation. */
  ir: KeyboardIR | null;
  /** The confirmed alphabet's characters. */
  alphabet: readonly string[];
  bcp47?: string;
  /** The layout family's floor for the derived set. */
  floor: readonly string[];
  /** True while the shown value is the studio's default, not an author answer. */
  isDefault?: boolean;
}

const KEYS_STYLE = { fontFamily: "monospace", color: TEXT_MAIN } as const;
const NOTE_STYLE = { fontSize: 12, color: TEXT_DIM, margin: "4px 0 0 24px", fontFamily: FONT } as const;

export function CapsHandlingView({
  value,
  onChange,
  ir,
  alphabet,
  bcp47,
  floor,
  isDefault = false,
}: CapsHandlingViewProps) {
  const { t } = useLingui();
  const set = useMemo(
    () => (ir === null ? null : deriveCasedKeys(ir, { ...(bcp47 !== undefined ? { bcp47 } : {}), floor })),
    [ir, bcp47, floor],
  );
  if (!isCasedAlphabet(alphabet, bcp47)) return null;

  const modes = capsModesOffered(ir);
  const labels: Record<CapsHandlingValue["mode"], { label: string; note: string }> = {
    "cased-keys": {
      label:
        isDefault
          ? t({ id: "survey.caps.mode.casedKeys.default", message: "Cased keys (default)" })
          : t({ id: "survey.caps.mode.casedKeys", message: "Cased keys" }),
      note: t({
        id: "survey.caps.mode.casedKeys.note",
        message: "Caps Lock upper-cases every key that has a lowercase and uppercase pair. Recommended.",
      }),
    },
    "explicit-rules": {
      label: t({ id: "survey.caps.mode.explicit", message: "Explicit rules" }),
      note: t({
        id: "survey.caps.mode.explicit.note",
        message: "Keep the Caps Lock rules the copied keyboard already has. New keys follow Shift only.",
      }),
    },
    none: {
      label: t({ id: "survey.caps.mode.none", message: "No Caps Lock handling" }),
      note: t({
        id: "survey.caps.mode.none.note",
        message: "Caps Lock does nothing on this keyboard.",
      }),
    },
  };
  const options: RadioOption[] = modes.map((m) => ({ value: m, ...labels[m] }));
  const extra = set?.extra ?? [];
  const conflicts = set?.conflicts ?? [];

  return (
    <section aria-labelledby="caps-handling-heading" data-testid="caps-handling">
      <h3 id="caps-handling-heading" style={{ fontSize: 15, color: TEXT_MAIN, fontFamily: FONT }}>
        {t({ id: "survey.caps.heading", message: "Caps Lock" })}
      </h3>
      <RadioGroup
        name="caps-handling"
        value={value?.mode ?? null}
        options={options}
        ariaLabelledby="caps-handling-heading"
        onChange={(m) => onChange({ mode: m as CapsHandlingValue["mode"] })}
      />
      {(value === undefined || value.mode === "cased-keys") && extra.length > 0 && (
        <p data-testid="caps-also-covers" style={NOTE_STYLE}>
          {t({ id: "survey.caps.alsoCovers", message: "Also covers these keys:" })}{" "}
          <span style={KEYS_STYLE}>{extra.join(", ")}</span>
        </p>
      )}
      {(value === undefined || value.mode === "cased-keys") && conflicts.length > 0 && (
        <p data-testid="caps-conflicts" style={NOTE_STYLE}>
          {t({
            id: "survey.caps.conflicts",
            message: "Left out, because another layer types a different character there:",
          })}{" "}
          <span style={KEYS_STYLE}>{conflicts.map((c) => c.vkey).join(", ")}</span>
        </p>
      )}
    </section>
  );
}

export const CapsHandlingRenderer: ComponentType<DecisionRendererProps<CapsHandlingValue>> = ({
  value,
  onChange,
  provenance,
}: DecisionRendererProps<CapsHandlingValue>) => {
  const ir = useWorkingCopyStore((s) => s.ir);
  const inventory = useDecisionStore((s) => s.decisions["character-inventory"]?.value);
  const bcp47 = useDecisionStore((s) => deriveSurveyContext(s.decisions).bcp47_tag);
  const alphabet = useMemo(() => alphabetOf(inventory), [inventory]);
  const floor = useMemo(() => (ir === null ? [] : capsFloorFor(ir)), [ir]);
  const cased = isCasedAlphabet(alphabet, bcp47);

  // A caseless alphabet is not asked (FR-004): the pass is recorded once, so
  // a later alphabet that gains case reads as a shape change, not silence.
  useEffect(() => {
    if (cased || inventory === undefined) return;
    useSurveyAnswerStore.getState().setStatus(CAPS_STATUS_STEP_ID, {
      kind: "not-asked",
      reason: CAPS_REASON_CASELESS,
      evidenceKey: `caseless|${alphabet.join("")}`,
    });
  }, [cased, inventory, alphabet]);

  return (
    <CapsHandlingView
      value={value}
      onChange={onChange}
      ir={ir}
      alphabet={alphabet}
      {...(bcp47 !== undefined ? { bcp47 } : {})}
      floor={floor}
      isDefault={provenance === "default"}
    />
  );
};
