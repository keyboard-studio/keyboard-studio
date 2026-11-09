// LanguageChooser — the language field of the identity step, driven by EthnoLib's
// search (spec 115 US1; research R7). It is the existing styled combobox, fed by
// the vendored `useLanguageChooser` hook: results stream in tier by tier, the
// dialect searcher is merged in (dialectSearch.ts), and each row renders as a
// `LanguageCard` with a "why it matched" line for dialect and variety hits.
//
// The chooser is a RENDERER (Article IX): it reports the pick through
// `onEntryResolved` / `onChange` / `onSelectAdvance`, exactly as the old name
// picker did, and writes nothing to the IR or to other questions' decisions.
// The auto-resolve rule is unchanged (`resolveTypedLanguage`): typing a name
// that uniquely identifies one entry resolves it without a click.
//
// Loaded as its own lazy chunk with the language step (FR-037); the Glottolog
// dialect rows are a further chunk, fetched on the first query of 3 or more
// characters.
//
// CONTENT REVIEW (Article VI): the placeholder and status wording are survey text
// owned by the content team.

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { LanguageSummary } from "@keyboard-studio/contracts";
import { devLog } from "@keyboard-studio/contracts/dev-log";
import { loadLangtags } from "../../lib/langtagsDefaults.ts";
import { normalizeForCompare } from "../../lib/normalizeForCompare.ts";
import { visuallyHidden } from "../surveyStyles.ts";
import { StyledCombobox, type ComboOption } from "../StyledCombobox.tsx";
import { resolveTypedLanguage } from "../resolveTypedLanguage.ts";
import { MAX_CHOOSER_ROWS, chooserModifier, maybeLoadGlottolog, onDialectRowsLoaded, resolveTypedEntry, summaryFor } from "./chooserSearch.ts";
import type { ChooserLanguage } from "./dialectSearch.ts";
import { LanguageCard, plainText, useCardText } from "./LanguageCard.tsx";
import { useLanguageChooser } from "./vendor/useLanguageChooser.ts";


type LangtagsMod = Awaited<ReturnType<typeof loadLangtags>>;

export interface LanguageChooserProps {
  id: string;
  /** The typed / committed language name. */
  value: string;
  required?: boolean;
  onChange: (text: string) => void;
  /** The author picked (a summary) or cleared / free-texted (null) a language. */
  onEntryResolved?: (entry: LanguageSummary | null) => void;
  /** A concrete row was picked: the survey may advance. */
  onSelectAdvance?: (value: string) => void;
}

export default function LanguageChooser({
  id,
  value,
  required,
  onChange,
  onEntryResolved,
  onSelectAdvance,
}: LanguageChooserProps) {
  const { t } = useLingui();
  const cardText = useCardText();
  const chooser = useLanguageChooser();
  const [mod, setMod] = useState<LangtagsMod | null>(null);
  // Bumped when the Glottolog rows land, so results are merged again with them.
  const [dialectVersion, bumpDialects] = useReducer((n: number) => n + 1, 0);

  const isMountedRef = useRef(true);
  const onEntryResolvedRef = useRef(onEntryResolved);
  onEntryResolvedRef.current = onEntryResolved;
  // The row the author picked, by normalised name: while the field still shows
  // it, typed-name resolution must not override the explicit pick (homonyms).
  const pickedRef = useRef<string | null>(null);
  const lastKeyRef = useRef<string | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    isMountedRef.current = true;
    const stop = onDialectRowsLoaded(() => {
      if (isMountedRef.current) bumpDialects();
    });
    loadLangtags()
      .then((m) => {
        if (!isMountedRef.current) return;
        setMod(m);
        // A value typed (or restored) before the chooser loaded never went
        // through handleType: search it now, so it resolves like typed text.
        const current = valueRef.current;
        if (current.trim().length >= 2) {
          maybeLoadGlottolog(current);
          chooser.onSearchStringChange(current);
          // Resolve it now by the same rule, rather than waiting for the streamed
          // tiers: the survey seeds the next questions from this. Deferred one
          // tick so the first paint is not held up by the synchronous search.
          setTimeout(() => {
            if (!isMountedRef.current || valueRef.current !== current || pickedRef.current !== null) return;
            void resolveTypedEntry(current)
              .then((entry) => {
                if (isMountedRef.current && valueRef.current === current && pickedRef.current === null) {
                  onEntryResolvedRef.current?.(entry);
                }
              })
              .catch(() => {});
          }, 0);
        }
      })
      .catch((err: unknown) => {
        // Degrade to a plain free-text field when langtags cannot load (FR-009).
        devLog.warn("[LanguageChooser] langtags load failed; degrading to free-text input", err);
      });
    return () => {
      isMountedRef.current = false;
      stop();
    };
    // Mount-only: the hook's setters are stable enough for the one-time kick-off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const merged: ChooserLanguage[] = useMemo(
    () => (mod === null ? [] : chooserModifier(mod)(chooser.languageResults, chooser.searchString)),
    // dialectVersion: the modifier is rebuilt when the Glottolog rows land.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mod, chooser.languageResults, chooser.searchString, dialectVersion],
  );
  const shown = merged.slice(0, MAX_CHOOSER_ROWS);
  const suggestionCount = shown.length;

  // Auto-resolve the typed name as results stream in. Only a change of the
  // resolved entry is reported, so streaming batches do not re-seed the survey.
  useEffect(() => {
    if (mod === null || onEntryResolvedRef.current === undefined) return;
    if (pickedRef.current !== null && pickedRef.current === normalizeForCompare(value)) return;
    if (chooser.searchString !== value) return; // results are for an earlier keystroke
    const hit = resolveTypedLanguage(value, merged);
    const key = hit === null ? "" : `${hit.languageSubtag}|${hit.match?.dialectTag ?? hit.match?.glottocode ?? ""}`;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;
    onEntryResolvedRef.current(hit === null ? null : summaryFor(hit, mod));
  }, [merged, value, mod, chooser.searchString]);

  function handleType(text: string): void {
    pickedRef.current = null;
    lastKeyRef.current = null;
    onChange(text);
    maybeLoadGlottolog(text);
    chooser.onSearchStringChange(text);
    // Typing nothing resolves nothing; the effect only runs on streamed results.
    if (text.trim().length < 2) onEntryResolvedRef.current?.(null);
  }

  function handleSelect(opt: ComboOption<ChooserLanguage>): void {
    const language = opt.data;
    if (language === undefined || mod === null) return;
    const summary = summaryFor(language, mod);
    const committed = summary?.englishName ?? plainText(language.exonym);
    pickedRef.current = normalizeForCompare(committed);
    lastKeyRef.current = null;
    chooser.selectLanguage(language);
    onChange(committed);
    onEntryResolved?.(summary);
    // Auto-advance runs last so the seeds set by onEntryResolved are in place
    // before the survey routes to (and seeds) the next question.
    onSelectAdvance?.(committed);
  }

  const options: ComboOption<ChooserLanguage>[] = shown.map((language, i) => ({
    value: `${language.iso639_3_code}-${i}`,
    label: plainText(language.exonym),
    data: language,
    content: <LanguageCard language={language} text={cardText} />,
    ariaLabel: cardText.accessibleName(language),
  }));

  return (
    <div>
      <StyledCombobox<ChooserLanguage>
        id={id}
        value={value}
        options={options}
        placeholder={
          mod !== null
            ? t({ id: "survey.languageChooser.placeholder", message: "Search by name, code, or country" })
            : t({ id: "survey.questionField.langtagsCombobox.loading", message: "Loading languages…" })
        }
        required={required === true}
        onType={handleType}
        onSelect={handleSelect}
      />
      <div aria-live="polite" style={visuallyHidden}>
        {chooser.searchString.trim().length >= 2 &&
          t({
            id: "survey.languageChooser.status.count",
            message: plural(suggestionCount, { one: "# suggestion", other: "# suggestions" }),
          })}
      </div>
    </div>
  );
}
