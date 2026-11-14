// ScriptCard — the script choice for a picked language that lists more than one
// (spec 115; a port of EthnoLib's script card with no MUI). The chooser's script
// reaches the survey only as a `default`-provenance proposal; the author confirms
// it at the script question.
//
// CONTENT REVIEW (Article VI): the legend is survey text owned by the content team.

import { useId } from "react";
import { useLingui } from "@lingui/react/macro";
import type { IScript } from "@ethnolib/find-language";
import { TEXT_DIM } from "../surveyStyles.ts";

export interface ScriptCardProps {
  scripts: readonly IScript[];
  selected: IScript | undefined;
  onSelect: (script: IScript) => void;
}

export function ScriptCard({ scripts, selected, onSelect }: ScriptCardProps) {
  const { t } = useLingui();
  const name = useId();
  if (scripts.length < 2) return null;
  return (
    <fieldset style={{ border: "none", margin: "8px 0 0", padding: 0 }}>
      <legend style={{ fontSize: 13, color: TEXT_DIM }}>
        {t({ id: "survey.languageChooser.script.legend", message: "Script" })}
      </legend>
      {scripts.map((s) => (
        <label key={s.code} style={{ display: "block", padding: "4px 0", fontSize: 14 }}>
          <input
            type="radio"
            name={name}
            value={s.code}
            checked={selected?.code === s.code}
            onChange={() => onSelect(s)}
          />{" "}
          {s.name}
          {s.languageNameInScript !== undefined ? ` (${s.languageNameInScript})` : ""}
        </label>
      ))}
    </fieldset>
  );
}
