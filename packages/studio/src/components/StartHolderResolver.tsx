// spec 064 D5 escape hatch form: the author confirms who held the starting
// keyboard's copyright when its LICENSE could not be read.
//
// `candidates` are exact strings parsed from sources that still read (the
// starting keyboard's &COPYRIGHT header). Picking one records that string
// verbatim, so it cannot drift from the extracted name (D4 exact-match dedupe
// hazard: "SIL  International" vs "SIL International" emits two holder lines).
// A pick is not a confirmation: Confirm stays the explicit author action, and
// nothing is preselected. The free-text box remains the fallback.

import { useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { RadioGroup } from "../ui/RadioGroup.tsx";
import type { RadioOption } from "../ui/RadioGroup.tsx";

// Sentinel for the "someone else" radio; never emitted as a holder.
const SOMEONE_ELSE = "__someone_else__";

export interface StartHolderResolverProps {
  readonly candidates: readonly string[];
  readonly onResolve: (holder: string) => void;
}

export function StartHolderResolver({ candidates, onResolve }: StartHolderResolverProps) {
  const { t } = useLingui();
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const hasChoices = candidates.length > 0;
  const labelId = "start-holder-choices-label";

  const radioOptions: RadioOption[] = [
    ...candidates.map((c) => ({ value: c, label: c })),
    {
      value: SOMEONE_ELSE,
      label: t({
        id: "output.status.licenseUnreadable.someoneElse",
        message: "Someone else (type the name below)",
      }),
    },
  ];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onResolve(picked !== null ? picked : typed);
      }}
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      {hasChoices && (
        <div data-testid="start-holder-choices">
          <div id={labelId} style={{ marginBottom: 4 }}>
            {t({
              id: "output.status.licenseUnreadable.choicesLabel",
              message: "Choose the holder named in the starting keyboard's header:",
            })}
          </div>
          <RadioGroup
            mode="list"
            name="start-holder-choice"
            value={picked ?? SOMEONE_ELSE}
            options={radioOptions}
            onChange={(v) => setPicked(v === SOMEONE_ELSE ? null : v)}
            ariaLabelledby={labelId}
          />
        </div>
      )}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          name="startHolder"
          type="text"
          value={picked !== null ? "" : typed}
          onChange={(e) => {
            setPicked(null);
            setTyped(e.target.value);
          }}
          aria-label={t({
            id: "output.status.licenseUnreadable.holderLabel",
            message: "Original copyright holder",
          })}
          placeholder={t({
            id: "output.status.licenseUnreadable.holderPlaceholder",
            message: "Original copyright holder",
          })}
          style={{
            flex: 1,
            padding: "5px 8px",
            background: "var(--app-bg)",
            color: "var(--app-text)",
            border: "1px solid var(--app-border)",
            borderRadius: 4,
            fontSize: 12,
          }}
        />
        <button
          type="submit"
          data-testid="resolve-base-holder"
          style={{
            padding: "5px 12px",
            background: "var(--app-accent)",
            color: "var(--app-text-on-accent)",
            border: "1px solid var(--app-border)",
            borderRadius: 4,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {t({ id: "output.status.licenseUnreadable.confirm", message: "Confirm" })}
        </button>
      </div>
    </form>
  );
}
