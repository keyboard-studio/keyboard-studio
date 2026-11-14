// UnlistedLanguagePanel — "My language isn't listed" (spec 115 R12, R15, FR-031,
// FR-032, FR-043 to FR-046). A name, an optional language code, and what the
// studio will propose from them. Mirrors EthnoLib's unlisted and manual-tag paths,
// but the code is checked with `parseBcp47` and the IANA registry, never with
// EthnoLib's looser syntax check.
//
//   - a registered code is accepted with its name; a private-use code (`qaa`-`qtz`)
//     is accepted; a well-formed unregistered code is accepted with a warning; an
//     ill-formed code blocks Confirm with its reason (FR-031);
//   - no code proposes `qaa[-REGION]-x-<name>` (FR-032, FR-044), explains why, and
//     points to the ISO 639-3 request process;
//   - the proposed script and where it came from are shown (FR-046).
//
// Opened from a typed name (pre-filled) or from a Glottolog row with no ISO code
// (pre-filled with its name, Glottolog code and countries, FR-043).
//
// CONTENT REVIEW (Article VI): every label, explanation and the request link text
// here is survey text owned by the content team.

import { useId, useMemo, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { registeredLanguage } from "@keyboard-studio/engine/langtags";
import { TEXT_DIM } from "../surveyStyles.ts";
import { checkLanguageCode } from "../languageCodeCheck.ts";
import { getLoadedLangtags } from "../../lib/langtagsDefaults.ts";
import { proposeScriptForUncoded, proposeUncodedTag, type UncodedScriptProposal } from "./uncodedLanguage.ts";

/** Where an author asks for an ISO 639-3 code. */
export const ISO_639_3_REQUEST_URL = "https://iso639-3.sil.org/code_changes/submitting_change_requests";

export interface UnlistedInit {
  name: string;
  /** A Glottolog row with no ISO code: its code, countries and (for a dialect) its own name. */
  glottocode?: string;
  countries?: string[];
  dialectName?: string;
  dialectGlottocode?: string;
}

export interface UnlistedResult {
  name: string;
  /** The language code the survey proposes: the author's code, else `qaa`. */
  code: string;
  /** The full tag the studio proposes for the language with no code (`qaa-ID-x-mansim`), when there is no code. */
  tag?: string;
  /** A script to propose, with its source; absent when the code's own langtags entry gives one. */
  script?: UncodedScriptProposal;
  glottocode?: string;
  dialectName?: string;
  dialectGlottocode?: string;
  countries: string[];
  /** A single country, proposed as the region. */
  region?: string;
}

export interface UnlistedLanguagePanelProps {
  init: UnlistedInit;
  onConfirm: (result: UnlistedResult) => void;
  onCancel: () => void;
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

export function UnlistedLanguagePanel({ init, onConfirm, onCancel }: UnlistedLanguagePanelProps) {
  const { t } = useLingui();
  const uid = useId();
  const [name, setName] = useState(init.name);
  const [code, setCode] = useState("");
  const countries = init.countries ?? [];
  const trimmedName = name.trim();
  const trimmedCode = code.trim();

  const check = useMemo(() => (trimmedCode === "" ? null : checkLanguageCode(trimmedCode, registeredLanguage)), [trimmedCode]);
  const tag = useMemo(
    () => proposeUncodedTag({ languageName: trimmedName === "" ? init.name : trimmedName, ...(init.dialectName !== undefined ? { dialectName: init.dialectName } : {}), countries }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trimmedName, init.name, init.dialectName, countries.join(",")],
  );
  const script = useMemo<UncodedScriptProposal | null>(() => {
    // A code langtags knows brings its own script; everything else is proposed.
    if (check !== null && check.ok && getLoadedLangtags()?.getLanguageDefaults(check.code) != null) return null;
    return proposeScriptForUncoded({ ...(init.glottocode !== undefined ? { glottocode: init.glottocode } : {}), countries });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [check, init.glottocode, countries.join(",")]);

  const codeBlocked = check !== null && !check.ok;
  const canConfirm = trimmedName !== "" && !codeBlocked;

  function reasonText(reason: string): string {
    return t({ id: "survey.languageChooser.unlisted.code.invalid", message: `This is not a valid language code (${reason}).` });
  }

  function confirm(): void {
    if (!canConfirm) return;
    const hasCode = check !== null && check.ok;
    onConfirm({
      name: trimmedName,
      code: hasCode ? check.code : "qaa",
      ...(hasCode ? {} : { tag }),
      ...(script !== null ? { script } : {}),
      ...(init.glottocode !== undefined ? { glottocode: init.glottocode } : {}),
      ...(init.dialectName !== undefined ? { dialectName: init.dialectName } : {}),
      ...(init.dialectGlottocode !== undefined ? { dialectGlottocode: init.dialectGlottocode } : {}),
      countries,
      ...(countries.length === 1 ? { region: countries[0]! } : {}),
    });
  }

  const dim = { fontSize: 13, color: TEXT_DIM, margin: "4px 0 0" } as const;
  return (
    <div role="group" aria-labelledby={`${uid}-h`} style={{ display: "grid", gap: 10, marginTop: 8 }}>
      <strong id={`${uid}-h`}>{t({ id: "survey.languageChooser.unlisted.heading", message: "My language isn't listed" })}</strong>
      {init.glottocode !== undefined && (
        <p style={dim}>
          {t({
            id: "survey.languageChooser.unlisted.glottolog",
            message: `Known to Glottolog (${init.glottocode}), which has no ISO 639-3 code for it.`,
          })}
          {countries.length > 0 ? ` ${countries.join(", ")}` : ""}
        </p>
      )}
      <label htmlFor={`${uid}-name`} style={{ fontSize: 13, color: TEXT_DIM }}>
        {t({ id: "survey.languageChooser.unlisted.name.label", message: "Language name" })}
      </label>
      <input
        id={`${uid}-name`}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-required="true"
        className="ks-control ks-focus-ring"
        style={INPUT_STYLE}
      />
      <label htmlFor={`${uid}-code`} style={{ fontSize: 13, color: TEXT_DIM }}>
        {t({ id: "survey.languageChooser.unlisted.code.label", message: "I know its code (optional)" })}
      </label>
      <input
        id={`${uid}-code`}
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        aria-invalid={codeBlocked}
        aria-describedby={`${uid}-status`}
        autoComplete="off"
        className="ks-control ks-focus-ring"
        style={INPUT_STYLE}
      />
      <div id={`${uid}-status`} role="status" aria-live="polite" style={dim}>
        {check !== null && !check.ok && reasonText(check.reason)}
        {check !== null && check.ok && check.privateUse &&
          t({ id: "survey.languageChooser.unlisted.code.privateUse", message: "A private-use code (qaa to qtz): accepted." })}
        {check !== null && check.ok && check.registeredName !== undefined &&
          t({ id: "survey.languageChooser.unlisted.code.registered", message: `Registered as ${check.registeredName}.` })}
        {check !== null && check.ok && check.warning === "unregistered" &&
          t({
            id: "survey.languageChooser.unlisted.code.unregistered",
            message: "This code is well formed but is not in the ISO 639-3 registry. You can keep it.",
          })}
      </div>
      {check === null && (
        <div>
          <p style={dim}>
            {t({
              id: "survey.languageChooser.unlisted.nocode.explain",
              message: `Without an ISO 639-3 code, the keyboard's language tag will be ${tag}. The part after x- is private use, made from the name, so the keyboard still works and can be changed once a code exists.`,
            })}
          </p>
          <p style={dim}>
            <a href={ISO_639_3_REQUEST_URL} target="_blank" rel="noreferrer">
              {t({ id: "survey.languageChooser.unlisted.nocode.request", message: "How to request an ISO 639-3 code" })}
            </a>
          </p>
        </div>
      )}
      {script !== null && (
        <p style={dim} data-testid="unlisted-script">
          {script.source === "relatives"
            ? t({
                id: "survey.languageChooser.unlisted.script.relatives",
                message: `Proposed script: ${script.script}, the most common among its closest relatives (${script.basis.join(", ")}).`,
              })
            : script.source === "country"
              ? t({
                  id: "survey.languageChooser.unlisted.script.country",
                  message: `Proposed script: ${script.script}, the most common among languages of ${script.basis.join(", ")}.`,
                })
              : t({ id: "survey.languageChooser.unlisted.script.fallback", message: `Proposed script: ${script.script}, the usual default when nothing else is known.` })}
        </p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={confirm} disabled={!canConfirm} className="ks-focus-ring">
          {t({ id: "survey.languageChooser.unlisted.confirm", message: "Use this language" })}
        </button>
        <button type="button" onClick={onCancel} className="ks-focus-ring">
          {t({ id: "survey.languageChooser.unlisted.cancel", message: "Cancel" })}
        </button>
      </div>
    </div>
  );
}
