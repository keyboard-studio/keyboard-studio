// LanguageCard — the content of one row in the language chooser's list: name,
// autonym, alternate names, regions, code, and, when the query hit a dialect or
// variety name, a second line saying why the row matched (spec 115, FR-002).
// A port of EthnoLib's card design with no MUI (research R7).
//
// CONTENT REVIEW (Article VI): the match-line wording below is survey text owned
// by the content team. Source strings are proposals.

import type { ReactNode } from "react";
import { END_OF_MATCH_MARKER, START_OF_MATCH_MARKER, stripDemarcation, type ILanguage } from "@ethnolib/find-language";
import { useLingui } from "@lingui/react/macro";
import type { SearchMatch } from "@keyboard-studio/contracts";
import { TEXT_DIM } from "../surveyStyles.ts";
import type { ChooserLanguage } from "./dialectSearch.ts";

/** Plain text of a chooser string: match markers removed. */
export function plainText(s: string | undefined): string {
  return stripDemarcation(s) ?? "";
}

/** Render EthnoLib's match markers as emphasis. */
export function renderMarked(text: string | undefined): ReactNode {
  if (text === undefined || !text.includes(START_OF_MATCH_MARKER)) return text ?? "";
  const out: ReactNode[] = [];
  let rest = text;
  let key = 0;
  for (;;) {
    const open = rest.indexOf(START_OF_MATCH_MARKER);
    if (open < 0) break;
    const close = rest.indexOf(END_OF_MATCH_MARKER, open);
    if (close < 0) break;
    if (open > 0) out.push(rest.slice(0, open));
    out.push(<mark key={key++} style={{ background: "transparent", color: "inherit", fontWeight: 700 }}>{rest.slice(open + 1, close)}</mark>);
    rest = rest.slice(close + 1);
  }
  out.push(rest);
  return out;
}

/** The text the card and its accessible name share. */
export interface CardText {
  /** The "why it matched" line, or undefined for a direct hit. */
  matchLine: (language: ChooserLanguage) => string | undefined;
  /** Accessible name of the row: name, autonym, regions, code and the match line (spec 056). */
  accessibleName: (language: ChooserLanguage) => string;
}

export function useCardText(): CardText {
  const { t } = useLingui();
  const parentName = (l: ILanguage): string => plainText(l.exonym);
  const matchLine = (l: ChooserLanguage): string | undefined => {
    // A Glottolog language (or dialect of one) with no ISO 639-3 code (FR-043).
    if (l.uncoded !== undefined) {
      const countries = l.uncoded.countries.join(", ");
      const place = countries !== "" ? ` · ${countries}` : "";
      if (l.uncoded.kind === "uncoded-dialect") {
        const parent = l.uncoded.parentName ?? "";
        return `${t({ id: "survey.languageChooser.uncoded.dialect", message: `a dialect of ${parent}: known to Glottolog, no ISO 639-3 code` })}${place}`;
      }
      return `${t({ id: "survey.languageChooser.uncoded.language", message: "known to Glottolog, no ISO 639-3 code" })}${place}`;
    }
    const m: SearchMatch | undefined = l.match;
    if (m === undefined) return undefined;
    const language = parentName(l);
    const code = l.languageSubtag;
    if (m.relation === "alias") {
      const name = m.name;
      return t({ id: "survey.languageChooser.match.alias", message: `also called ${name}` });
    }
    const name = m.name;
    const base =
      m.relation === "variety"
        ? t({ id: "survey.languageChooser.match.variety", message: `${name}: a variety of ${language} (${code})` })
        : t({ id: "survey.languageChooser.match.dialect", message: `${name}: a dialect of ${language} (${code})` });
    return m.countries !== undefined && m.countries.length > 0 ? `${base} · ${m.countries.join(", ")}` : base;
  };
  const accessibleName = (l: ChooserLanguage): string => {
    const parts = [plainText(l.exonym)];
    const autonym = plainText(l.autonym);
    if (autonym !== "" && autonym !== plainText(l.exonym)) parts.push(autonym);
    const regions = plainText(l.regionNamesForDisplay);
    if (regions !== "") parts.push(regions);
    if (l.languageSubtag !== "") parts.push(l.languageSubtag);
    const line = matchLine(l);
    if (line !== undefined) parts.push(line);
    return parts.join(", ");
  };
  return { matchLine, accessibleName };
}

/** Alternate names to list: the language's own names without its primary name or autonym. */
function alternateNames(l: ILanguage): string[] {
  const skip = new Set([plainText(l.exonym), plainText(l.autonym)]);
  return l.names.filter((n) => !skip.has(plainText(n))).slice(0, 4);
}

export function LanguageCard({ language, text }: { language: ChooserLanguage; text: CardText }) {
  const autonym = plainText(language.autonym);
  const showAutonym = autonym !== "" && autonym !== plainText(language.exonym);
  const alternates = alternateNames(language);
  const regions = plainText(language.regionNamesForDisplay);
  const line = text.matchLine(language);
  return (
    <span style={{ display: "block" }}>
      <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span>
          <span>{renderMarked(language.exonym)}</span>
          {showAutonym && <span style={{ color: TEXT_DIM }}>{" / "}{renderMarked(language.autonym)}</span>}
        </span>
        <span style={{ color: TEXT_DIM }}>{language.languageSubtag}</span>
      </span>
      {line !== undefined && <span style={{ display: "block", color: TEXT_DIM, fontSize: 12 }}>{line}</span>}
      {alternates.length > 0 && (
        <span style={{ display: "block", color: TEXT_DIM, fontSize: 12 }}>
          {alternates.map((n, i) => (
            <span key={`${n}-${i}`}>
              {i > 0 && ", "}
              {renderMarked(n)}
            </span>
          ))}
        </span>
      )}
      {regions !== "" && <span style={{ display: "block", color: TEXT_DIM, fontSize: 12 }}>{regions}</span>}
    </span>
  );
}
