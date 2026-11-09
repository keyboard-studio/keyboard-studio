// RemainderChooser — what to do with the words typed beside a language that match
// neither one of its dialects nor a country (spec 115 R14, FR-040 step 3). Nothing
// is guessed: the author says whether the words are a dialect name, a place, one
// of the language's listed dialects, or should be left out. Nothing is written
// until one of those is chosen.
//
// CONTENT REVIEW (Article VI): every label here is survey text owned by the
// content team.

import { useId, useMemo, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import type { IRegion } from "@ethnolib/find-language";
import type { SearchMatch } from "@keyboard-studio/contracts";
import { TEXT_DIM } from "../surveyStyles.ts";
import { rankPlacesFor, type DialectOf } from "./readTypedText.ts";

export type RemainderChoice =
  | { kind: "dialect-name"; name: string }
  | { kind: "place"; region: { code: string; name: string } }
  | { kind: "listed-dialect"; match: SearchMatch }
  | { kind: "leave-out" };

export interface RemainderChooserProps {
  /** The language the words were typed beside, by display name. */
  languageName: string;
  /** The words, as typed. */
  text: string;
  regions: readonly IRegion[];
  dialects: readonly DialectOf[];
  onChoose: (choice: RemainderChoice) => void;
  onCancel: () => void;
}

const SELECT_STYLE = {
  width: "100%",
  height: 36,
  background: "var(--app-surface)",
  border: "1px solid var(--app-border-strong)",
  borderRadius: "var(--app-radius-sm)",
  color: "var(--app-text)",
  fontFamily: "inherit",
} as const;

export function RemainderChooser({ languageName, text, regions, dialects, onChoose, onCancel }: RemainderChooserProps) {
  const { t } = useLingui();
  const uid = useId();
  const ranked = useMemo(() => rankPlacesFor(text, regions), [text, regions]);
  const ordered = useMemo(() => [...ranked, ...regions.filter((r) => !ranked.includes(r))], [ranked, regions]);
  const [placeCode, setPlaceCode] = useState(ordered[0]?.code ?? "");
  const [dialectIndex, setDialectIndex] = useState(0);
  const button = "ks-focus-ring";

  return (
    <div role="group" aria-labelledby={`${uid}-h`} style={{ display: "grid", gap: 10, marginTop: 8 }}>
      <strong id={`${uid}-h`}>
        {t({ id: "survey.languageChooser.remainder.heading", message: `${languageName}, plus "${text}": what is "${text}"?` })}
      </strong>

      <div>
        <button type="button" className={button} onClick={() => onChoose({ kind: "dialect-name", name: text })}>
          {t({ id: "survey.languageChooser.remainder.dialectName", message: "It's a dialect name" })}
        </button>
      </div>

      <div style={{ display: "grid", gap: 4 }}>
        <label htmlFor={`${uid}-place`} style={{ fontSize: 13, color: TEXT_DIM }}>
          {t({ id: "survey.languageChooser.remainder.place.label", message: "It's a place" })}
        </label>
        <select id={`${uid}-place`} value={placeCode} onChange={(e) => setPlaceCode(e.target.value)} style={SELECT_STYLE} className="ks-control ks-focus-ring">
          {ordered.map((r) => (
            <option key={r.code} value={r.code}>
              {r.name}
            </option>
          ))}
        </select>
        <div>
          <button
            type="button"
            className={button}
            onClick={() => {
              const region = ordered.find((r) => r.code === placeCode);
              if (region !== undefined) onChoose({ kind: "place", region: { code: region.code, name: region.name } });
            }}
          >
            {t({ id: "survey.languageChooser.remainder.place.use", message: "Use this place" })}
          </button>
        </div>
      </div>

      {dialects.length > 0 && (
        <div style={{ display: "grid", gap: 4 }}>
          <label htmlFor={`${uid}-dialect`} style={{ fontSize: 13, color: TEXT_DIM }}>
            {t({ id: "survey.languageChooser.remainder.listed.label", message: "It's one of these dialects" })}
          </label>
          <select id={`${uid}-dialect`} value={dialectIndex} onChange={(e) => setDialectIndex(Number(e.target.value))} style={SELECT_STYLE} className="ks-control ks-focus-ring">
            {dialects.map((d, i) => (
              <option key={`${d.name}-${i}`} value={i}>
                {d.name}
              </option>
            ))}
          </select>
          <div>
            <button
              type="button"
              className={button}
              onClick={() => {
                const d = dialects[dialectIndex];
                if (d !== undefined) onChoose({ kind: "listed-dialect", match: d.match });
              }}
            >
              {t({ id: "survey.languageChooser.remainder.listed.use", message: "Use this dialect" })}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className={button} onClick={() => onChoose({ kind: "leave-out" })}>
          {t({ id: "survey.languageChooser.remainder.leaveOut", message: "Leave it out" })}
        </button>
        <button type="button" className={button} onClick={onCancel}>
          {t({ id: "survey.languageChooser.remainder.cancel", message: "Cancel" })}
        </button>
      </div>
    </div>
  );
}
