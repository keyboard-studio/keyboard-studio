// CustomizePanel — "Customize": the optional region and dialect name of the
// picked language (spec 115; a port of EthnoLib's customize dialog as an inline
// disclosure, no MUI). The region field is "Specify a region…"; the dialect field
// takes a dialect name. Both reach the survey only as proposals the author
// confirms at their own question.
//
// CONTENT REVIEW (Article VI): every label here is survey text owned by the
// content team.

import { useId, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { getAllRegions, type IRegion } from "@ethnolib/find-language";
import { TEXT_DIM } from "../surveyStyles.ts";

export interface CustomizeDetails {
  region?: IRegion;
  dialect?: string;
}

export interface CustomizePanelProps {
  details: CustomizeDetails;
  onChange: (details: CustomizeDetails) => void;
}

const INPUT_STYLE = {
  width: "100%",
  height: 36,
  padding: "0 10px",
  boxSizing: "border-box",
  background: "var(--app-surface)",
  border: "1px solid var(--app-border-strong)",
  borderRadius: "var(--app-radius-sm)",
  color: "var(--app-text)",
  fontFamily: "inherit",
} as const;

export function CustomizePanel({ details, onChange }: CustomizePanelProps) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const uid = useId();
  const regionListId = `${uid}-regions`;
  const regions = open ? getAllRegions() : [];
  const regionText = details.region?.name ?? "";

  function setRegionText(text: string): void {
    const found = getAllRegions().find((r) => r.name.toLowerCase() === text.trim().toLowerCase());
    const { region: _drop, ...rest } = details;
    onChange(found !== undefined ? { ...rest, region: found } : rest);
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${uid}-panel`}
        onClick={() => setOpen((o) => !o)}
        className="ks-focus-ring"
        style={{ background: "none", border: "none", color: TEXT_DIM, cursor: "pointer", padding: 0, fontSize: 13 }}
      >
        {t({ id: "survey.languageChooser.customize.toggle", message: "Customize" })}
      </button>
      {open && (
        <div id={`${uid}-panel`} style={{ display: "grid", gap: 8, marginTop: 6 }}>
          <label style={{ fontSize: 13, color: TEXT_DIM }}>
            {t({ id: "survey.languageChooser.customize.region.label", message: "Specify a region…" })}
            <input
              type="text"
              list={regionListId}
              defaultValue={regionText}
              onChange={(e) => setRegionText(e.target.value)}
              className="ks-control ks-focus-ring"
              style={INPUT_STYLE}
            />
          </label>
          <datalist id={regionListId}>
            {regions.map((r) => (
              <option key={r.code} value={r.name} />
            ))}
          </datalist>
          <label style={{ fontSize: 13, color: TEXT_DIM }}>
            {t({ id: "survey.languageChooser.customize.dialect.label", message: "Dialect name" })}
            <input
              type="text"
              defaultValue={details.dialect ?? ""}
              onChange={(e) => {
                const { dialect: _drop, ...rest } = details;
                const text = e.target.value;
                onChange(text.trim() === "" ? rest : { ...rest, dialect: text });
              }}
              className="ks-control ks-focus-ring"
              style={INPUT_STYLE}
            />
          </label>
        </div>
      )}
    </div>
  );
}
