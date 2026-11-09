// LanguageChooser — the language field of the identity step, driven by EthnoLib's
// search (spec 115 US1, US6; research R7, R12, R14, R15). It is the existing
// styled combobox, fed by the vendored `useLanguageChooser` hook: results stream
// in tier by tier, the dialect searcher is merged in (dialectSearch.ts), and each
// row renders as a `LanguageCard` with a "why it matched" line for dialect and
// variety hits.
//
// In front of the search it reads what was typed (US6):
//   - a code or tag (`bft`, `oc-gascon`) is proposed as its parts (resolveTypedTag);
//   - several words are read as a language plus a dialect, a place, or a remainder
//     the author classifies (readTypedText, RemainderChooser);
//   - when nothing is close, two fallback rows end the list: "<text> is a dialect:
//     find its language" and "My language isn't listed" (UnlistedLanguagePanel);
//     both are also reachable through "Can't find it?".
//
// The chooser is a RENDERER (Article IX): it reports the pick through
// `onEntryResolved` / `onChange` / `onSelectAdvance`, exactly as the old name
// picker did. What a pick carries beyond a langtags summary (a proposed script or
// region, a Glottolog code) rides on the summary as `extras`; the identity
// resolution records them as `default` proposals. The one decision the renderer
// writes itself is `language-search-match`, for the pending dialect name.
// The auto-resolve rule is the old one (`resolveTypedLanguage`), extended to a
// unique dialect name or a unique resolved reading (FR-042).
//
// Loaded as its own lazy chunk with the language step (FR-037); the Glottolog
// dialect rows are a further chunk, fetched on the first query of 3 or more
// characters.
//
// CONTENT REVIEW (Article VI): the placeholder, status, fallback-row and reading
// wording are survey text owned by the content team.

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { getAllRegions } from "@ethnolib/find-language";
import type { LanguageSummary, SearchMatch } from "@keyboard-studio/contracts";
import { devLog } from "@keyboard-studio/contracts/dev-log";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import type { ChosenExtras, ChosenSummary } from "../chosenLanguage.ts";
import { loadLangtags } from "../../lib/langtagsDefaults.ts";
import { normalizeForCompare } from "../../lib/normalizeForCompare.ts";
import { visuallyHidden } from "../surveyStyles.ts";
import { StyledCombobox, type ComboOption } from "../StyledCombobox.tsx";
import { resolveTypedLanguage } from "../resolveTypedLanguage.ts";
import {
  MAX_CHOOSER_ROWS,
  autoResolveBeyondName,
  chooserModifier,
  dialectsOfLanguage,
  maybeLoadGlottolog,
  onDialectRowsLoaded,
  readingSummary,
  readingsFor,
  resolveTypedEntry,
  summaryFor,
} from "./chooserSearch.ts";
import { fold, isClose, type ChooserLanguage } from "./dialectSearch.ts";
import { LanguageCard, plainText, useCardText } from "./LanguageCard.tsx";
import type { TypedReading } from "./readTypedText.ts";
import { RemainderChooser, type RemainderChoice } from "./RemainderChooser.tsx";
import { resolveTypedTag, type TypedTagProposal } from "./resolveTypedTag.ts";
import { UnlistedLanguagePanel, type UnlistedInit, type UnlistedResult } from "./UnlistedLanguagePanel.tsx";
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

const FALLBACK_DIALECT = "fallback:dialect";
const FALLBACK_UNLISTED = "fallback:unlisted";
const TAG_ROW = "typed-tag";

type Panel =
  | { kind: "unlisted"; init: UnlistedInit }
  | { kind: "remainder"; reading: TypedReading };

/** A summary for a language code the chooser did not list: langtags' entry when it has one, else the bare code. */
function summaryForCode(mod: LangtagsMod, code: string, name: string): ChosenSummary {
  const d = mod.getLanguageDefaults(code);
  if (d === null) return { code, englishName: name };
  return {
    code: d.code,
    englishName: name !== "" ? name : (d.englishName ?? code),
    ...(d.autonym !== undefined ? { autonym: d.autonym } : {}),
    ...(d.defaultScript !== undefined ? { defaultScript: d.defaultScript } : {}),
  };
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
  // "<text> is a dialect": the pending dialect name while the author looks for its language (FR-030).
  const [pendingDialect, setPendingDialect] = useState<string | null>(null);
  const pendingDialectRef = useRef<string | null>(null);
  pendingDialectRef.current = pendingDialect;
  const [panel, setPanel] = useState<Panel | null>(null);
  const [showFallbacks, setShowFallbacks] = useState(false);

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

  const settled = mod !== null && chooser.searchString === value && value.trim().length >= 2;
  // A code or tag typed in full (FR-028).
  const tagProposal: TypedTagProposal | null = useMemo(() => (settled ? resolveTypedTag(value) : null), [settled, value]);
  // Dialect-and-language or language-and-place text (FR-039). Skipped while the author
  // is already looking for the parent of a pending dialect name.
  const readings: TypedReading[] = useMemo(
    () =>
      settled && mod !== null && pendingDialect === null && /\S\s+\S|[-,()]/.test(value.trim())
        ? readingsFor(value, chooserModifier(mod), mod)
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settled, mod, value, pendingDialect, dialectVersion],
  );
  const hasResolvedReading = readings.some((r) => r.unresolved === undefined);
  // The fallback rows (FR-029): nothing close to what was typed, and no code or reading to offer.
  const noClose =
    settled && tagProposal === null && !hasResolvedReading && !merged.some((l) => isClose(l, fold(value)));
  const regions = useMemo(() => getAllRegions(), []);

  /** A pending dialect name rides on the language that is picked while it is set (FR-030). */
  function withPending<T extends LanguageSummary | null>(summary: T): T {
    const pending = pendingDialectRef.current;
    if (summary === null || pending === null || summary.match !== undefined) return summary;
    return { ...summary, match: { name: pending, relation: "dialect", source: "typed" } satisfies SearchMatch };
  }

  // Auto-resolve the typed name as results stream in. Only a change of the
  // resolved entry is reported, so streaming batches do not re-seed the survey.
  useEffect(() => {
    if (mod === null || onEntryResolvedRef.current === undefined) return;
    if (pickedRef.current !== null && pickedRef.current === normalizeForCompare(value)) return;
    if (chooser.searchString !== value) return; // results are for an earlier keystroke
    const byName = resolveTypedLanguage(value, merged);
    const found: LanguageSummary | null =
      byName !== null ? summaryFor(byName, mod) : autoResolveBeyondName(value, merged, readings, mod);
    const entry = withPending(found);
    const key =
      entry === null
        ? ""
        : `${entry.code}|${entry.match?.dialectTag ?? entry.match?.glottocode ?? entry.match?.name ?? ""}|${(entry as ChosenSummary).extras?.region?.code ?? ""}`;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;
    // While a dialect name is pending, a search that finds no language must not
    // forget the pending name.
    if (entry === null && pendingDialectRef.current !== null) return;
    onEntryResolvedRef.current(entry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merged, readings, value, mod, chooser.searchString]);

  function handleType(text: string): void {
    pickedRef.current = null;
    lastKeyRef.current = null;
    setPanel(null);
    onChange(text);
    maybeLoadGlottolog(text);
    chooser.onSearchStringChange(text);
    // Typing nothing resolves nothing; the effect only runs on streamed results.
    if (text.trim().length < 2 && pendingDialectRef.current === null) onEntryResolvedRef.current?.(null);
  }

  /** Report a pick to the survey: the name goes into the field, the summary through the resolution. */
  function commit(summary: ChosenSummary | null, name: string, advance: boolean): void {
    const finalSummary = withPending(summary);
    pickedRef.current = normalizeForCompare(name);
    lastKeyRef.current = null;
    onChange(name);
    onEntryResolved?.(finalSummary);
    setPendingDialect(null);
    pendingDialectRef.current = null;
    setPanel(null);
    setShowFallbacks(false);
    // Auto-advance runs last so the seeds set by onEntryResolved are in place
    // before the survey routes to (and seeds) the next question.
    if (advance) onSelectAdvance?.(name);
  }

  function pickLanguage(language: ChooserLanguage): void {
    if (mod === null) return;
    if (language.uncoded !== undefined) {
      openUncoded(language);
      return;
    }
    const summary = summaryFor(language, mod);
    chooser.selectLanguage(language);
    commit(summary, summary?.englishName ?? plainText(language.exonym), true);
  }

  function pickTag(p: TypedTagProposal): void {
    if (mod === null) return;
    const base = summaryForCode(mod, p.language, p.registeredName ?? "");
    const extras: ChosenExtras = {
      ...(p.script !== undefined && p.script !== base.defaultScript ? { script: { script: p.script, source: "the tag you typed" } } : {}),
      ...(p.region !== undefined ? { region: { code: p.region, source: "the tag you typed" } } : {}),
    };
    const isPrivate = p.dialectSubtag?.startsWith("x-") === true;
    const match: SearchMatch | undefined =
      p.dialectSubtag !== undefined
        ? {
            name: p.dialectSubtag.replace(/^x-/, ""),
            relation: isPrivate ? "dialect" : "variety",
            source: isPrivate ? "typed" : "iana",
            dialectTag: `${p.language}-${p.dialectSubtag}`,
          }
        : undefined;
    commit(
      {
        ...base,
        ...(match !== undefined ? { match } : {}),
        ...(Object.keys(extras).length > 0 ? { extras } : {}),
      },
      base.englishName,
      true,
    );
  }

  function pickReading(reading: TypedReading): void {
    if (mod === null) return;
    if (reading.unresolved !== undefined) {
      setPanel({ kind: "remainder", reading });
      return;
    }
    const summary = readingSummary(reading, mod);
    commit(summary, summary?.englishName ?? plainText(reading.language.exonym), true);
  }

  function chooseRemainder(reading: TypedReading, choice: RemainderChoice): void {
    if (mod === null) return;
    const base = summaryFor(reading.language, mod);
    const name = base?.englishName ?? plainText(reading.language.exonym);
    if (base === null || choice.kind === "leave-out") {
      commit(base, name, true);
      return;
    }
    if (choice.kind === "dialect-name") {
      commit({ ...base, match: { name: choice.name, relation: "dialect", source: "typed" } }, name, true);
    } else if (choice.kind === "listed-dialect") {
      commit({ ...base, match: choice.match }, name, true);
    } else {
      commit({ ...base, extras: { region: { code: choice.region.code, source: "what you typed" } } }, name, true);
    }
  }

  function openUncoded(language: ChooserLanguage): void {
    const info = language.uncoded;
    if (info === undefined) return;
    setPanel({
      kind: "unlisted",
      init:
        info.kind === "uncoded-dialect"
          ? {
              name: info.parentName ?? info.name,
              ...(info.parentGlottocode !== undefined ? { glottocode: info.parentGlottocode } : {}),
              countries: info.countries,
              dialectName: info.name,
              dialectGlottocode: info.glottocode,
            }
          : { name: info.name, glottocode: info.glottocode, countries: info.countries },
    });
  }

  function confirmUnlisted(r: UnlistedResult): void {
    if (mod === null) return;
    const base = summaryForCode(mod, r.code, r.name);
    const noCode = r.tag !== undefined;
    const extras: ChosenExtras = {
      ...(r.glottocode !== undefined ? { glottocode: r.glottocode } : {}),
      ...(r.region !== undefined ? { region: { code: r.region, source: "its country" } } : {}),
      ...(r.script !== undefined ? { script: { script: r.script.script, source: r.script.source } } : {}),
    };
    // A language with no code carries its proposed private-use tag in the match, where the dialect question reads it.
    const match: SearchMatch | undefined = noCode
      ? {
          name: r.dialectName ?? r.name,
          relation: "dialect",
          source: "typed",
          ...(r.tag !== undefined ? { dialectTag: r.tag } : {}),
          ...(r.dialectGlottocode !== undefined ? { glottocode: r.dialectGlottocode } : {}),
        }
      : undefined;
    commit(
      {
        ...base,
        englishName: r.name,
        ...(match !== undefined ? { match } : {}),
        extras,
      },
      r.name,
      true,
    );
  }

  function enterDialectMode(): void {
    const text = value.trim();
    if (text === "") return;
    const match: SearchMatch = { name: text, relation: "dialect", source: "typed" };
    useDecisionStore.getState().record({ id: "language-search-match", value: match, provenance: "derived", source: "il_language_english" });
    setPendingDialect(text);
    pendingDialectRef.current = text;
    setShowFallbacks(false);
    pickedRef.current = null;
    lastKeyRef.current = null;
    onChange("");
    chooser.onSearchStringChange("");
  }

  function cancelDialectMode(): void {
    setPendingDialect(null);
    pendingDialectRef.current = null;
    if (useDecisionStore.getState().decisions["language-search-match"] !== undefined) {
      useDecisionStore.getState().forget("language-search-match");
    }
  }

  function openUnlisted(): void {
    setPanel({ kind: "unlisted", init: { name: (pendingDialect !== null ? "" : value).trim() } });
    setShowFallbacks(false);
  }

  function handleSelect(opt: ComboOption<ChooserLanguage>): void {
    if (opt.value === TAG_ROW) {
      if (tagProposal !== null) pickTag(tagProposal);
    } else if (opt.value.startsWith("reading:")) {
      const reading = readings[Number(opt.value.slice("reading:".length))];
      if (reading !== undefined) pickReading(reading);
    } else if (opt.value === FALLBACK_DIALECT) {
      enterDialectMode();
    } else if (opt.value === FALLBACK_UNLISTED) {
      openUnlisted();
    } else if (opt.data !== undefined) {
      pickLanguage(opt.data);
    }
  }

  const typedText = value.trim();
  const rowName = (language: ChooserLanguage): string => plainText(language.exonym);
  const readingLabel = (r: TypedReading): string => {
    const language = rowName(r.language);
    if (r.dialect !== undefined) {
      const dialect = r.dialect.name;
      return t({ id: "survey.languageChooser.reading.dialect", message: `${language}, dialect: ${dialect}` });
    }
    if (r.region !== undefined) {
      const place = r.region.name;
      return t({ id: "survey.languageChooser.reading.region", message: `${language}, region: ${place}` });
    }
    const rest = r.unresolved ?? "";
    return t({ id: "survey.languageChooser.reading.unresolved", message: `${language}, plus “${rest}”: choose what it is` });
  };

  const options: ComboOption<ChooserLanguage>[] = [];
  if (tagProposal !== null) {
    const code = tagProposal.language;
    const name = tagProposal.registeredName ?? "";
    const label =
      tagProposal.privateUse === true
        ? t({ id: "survey.languageChooser.tag.privateUse", message: `Use the private-use code ${code}` })
        : name !== ""
          ? t({ id: "survey.languageChooser.tag.registered", message: `Use the code ${code}: ${name}` })
          : t({ id: "survey.languageChooser.tag.unregistered", message: `Use the code ${code} (not in the ISO 639-3 registry)` });
    options.push({ value: TAG_ROW, label, content: <span>{label}</span>, ariaLabel: label });
  }
  readings.forEach((r, i) => {
    const label = readingLabel(r);
    options.push({ value: `reading:${i}`, label, content: <span>{label}</span>, ariaLabel: label });
  });
  shown.forEach((language, i) => {
    options.push({
      value: `${language.iso639_3_code}-${i}`,
      label: plainText(language.exonym),
      data: language,
      content: <LanguageCard language={language} text={cardText} />,
      ariaLabel: cardText.accessibleName(language),
    });
  });

  const dialectLabel = t({ id: "survey.languageChooser.fallback.dialect", message: `"${typedText}" is a dialect: find its language` });
  const unlistedLabel = t({ id: "survey.languageChooser.fallback.unlisted", message: "My language isn't listed" });
  if (noClose) {
    if (pendingDialect === null) {
      options.push({ value: FALLBACK_DIALECT, label: dialectLabel, content: <em>{dialectLabel}</em>, ariaLabel: dialectLabel });
    }
    options.push({ value: FALLBACK_UNLISTED, label: unlistedLabel, content: <em>{unlistedLabel}</em>, ariaLabel: unlistedLabel });
  }
  const suggestionCount = options.length;

  const remainderReading = panel?.kind === "remainder" ? panel.reading : null;

  return (
    <div>
      {pendingDialect !== null && (
        <div style={{ marginBottom: 6 }}>
          <label htmlFor={id}>
            {t({ id: "survey.languageChooser.dialectOf.label", message: `Which language is "${pendingDialect}" a dialect of?` })}
          </label>{" "}
          <button type="button" className="ks-focus-ring" onClick={cancelDialectMode}>
            {t({ id: "survey.languageChooser.dialectOf.cancel", message: "Cancel" })}
          </button>
        </div>
      )}
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
      {mod !== null && panel === null && (
        <div style={{ marginTop: 6 }}>
          <button
            type="button"
            className="ks-focus-ring"
            aria-expanded={showFallbacks}
            onClick={() => setShowFallbacks((s) => !s)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, fontSize: 13, textDecoration: "underline" }}
          >
            {t({ id: "survey.languageChooser.cantFind", message: "Can't find it?" })}
          </button>
          {showFallbacks && (
            <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              {pendingDialect === null && typedText !== "" && (
                <button type="button" className="ks-focus-ring" onClick={enterDialectMode}>
                  {dialectLabel}
                </button>
              )}
              <button type="button" className="ks-focus-ring" onClick={openUnlisted}>
                {unlistedLabel}
              </button>
            </div>
          )}
        </div>
      )}
      {panel?.kind === "unlisted" && (
        <UnlistedLanguagePanel init={panel.init} onConfirm={confirmUnlisted} onCancel={() => setPanel(null)} />
      )}
      {remainderReading !== null && (
        <RemainderChooser
          languageName={rowName(remainderReading.language)}
          text={remainderReading.unresolved ?? ""}
          regions={regions}
          dialects={mod === null ? [] : dialectsOfLanguage(remainderReading.language, mod)}
          onChoose={(choice) => chooseRemainder(remainderReading, choice)}
          onCancel={() => setPanel(null)}
        />
      )}
    </div>
  );
}
