// LanguageListPanel - the editable language list for an opened keyboard (spec 111).
//
// Add, remove and reorder the languages the package descriptor lists. The list
// seeds from the keyboard's own `.kps` on Open (workingCopyStore identity) and
// the author's edits are recorded as the `language-list` decision and mirrored
// into the identity patch, which is what the `.kps` patch writes.
//
// Spec 115 US4 (T059): each row and the add form show the per-tag findings
// (`languageTagFindings`); a non-minimal hint offers a "Use `<replacement>`"
// fix through the same commit path; the add form also offers the language
// chooser (US1) and the typed-tag check (US6).

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import type { Decision, DecisionRendererProps } from "../../decisions/decisionTypes.ts";
import { loadLangtagsLookup } from "../../criteria/langtagsLookup.ts";
import {
  languageTagFindings,
  type LanguageTagFinding,
  type LangtagsTagLookup,
} from "../../criteria/languageTags.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import type { ChosenSummary } from "../chosenLanguage.ts";
import { extrasOf } from "../chosenLanguage.ts";
import type {
  TypedTagProposal,
  TypedTagResult,
} from "../languageChooser/resolveTypedTag.ts";
import { useGalleryStepContext } from "../../steps/galleryHost.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { Button } from "../../ui/Button.tsx";
import { TextField } from "../../ui/TextField.tsx";
import { CSS_WARNING_TEXT, ERROR_TEXT, TEXT_DIM } from "../../ui/theme.ts";
import {
  phaseHeading,
  surveyCard,
  surveyPageColumn,
} from "../surveyStyles.ts";
import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";

// The language chooser (EthnoLib's search and its data) is its own lazy chunk:
// it loads when the author browses, never on first paint (spec 115 FR-037).
const LazyLanguageChooser = lazy(() => import("../languageChooser/LanguageChooser.tsx"));

export type LanguageEntry = { tag: string; name?: string };
export type LanguageListValue = readonly LanguageEntry[];

/** Pure list operations, exported for tests. */
export function addLanguage(list: LanguageListValue, tag: string, name?: string): LanguageListValue {
  const trimmed = tag.trim();
  if (trimmed === "" || list.some((l) => l.tag.toLowerCase() === trimmed.toLowerCase())) return list;
  const trimmedName = name?.trim() ?? "";
  return [...list, trimmedName === "" ? { tag: trimmed } : { tag: trimmed, name: trimmedName }];
}

export function removeLanguage(list: LanguageListValue, index: number): LanguageListValue {
  return list.filter((_, i) => i !== index);
}

export function moveLanguage(list: LanguageListValue, index: number, delta: -1 | 1): LanguageListValue {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(index, 1);
  if (moved === undefined) return list;
  next.splice(target, 0, moved);
  return next;
}

/** The parts of a typed-tag proposal, for the add form to compose into a translated line. */
export interface TypedTagSummary {
  /** The registry's name for the language, or the language code. */
  name: string;
  dialectSubtag?: string;
  script?: string;
  region?: string;
  /** Well-formed but not registered (FR-031). */
  unregistered: boolean;
  /** In the private-use range `qaa`-`qtz`. */
  privateUse: boolean;
  /** The tag carried an extension, which the proposal does not carry. */
  extensionNotCarried: boolean;
}

export function typedTagSummary(p: TypedTagProposal): TypedTagSummary {
  return {
    name: p.registeredName ?? p.language,
    ...(p.dialectSubtag !== undefined ? { dialectSubtag: p.dialectSubtag } : {}),
    ...(p.script !== undefined ? { script: p.script } : {}),
    ...(p.region !== undefined ? { region: p.region } : {}),
    unregistered: p.warning === "unregistered",
    privateUse: p.privateUse === true,
    extensionNotCarried: p.note === "extension-not-carried",
  };
}

/**
 * Replace one row's tag, refusing when the replacement is already listed
 * elsewhere (the add form forbids duplicates the same way, so a fix must
 * never create one).
 */
export function replaceLanguageTag(
  list: LanguageListValue,
  index: number,
  replacement: string,
): LanguageListValue {
  const trimmed = replacement.trim();
  if (
    trimmed === "" ||
    list.some((l, i) => i !== index && l.tag.toLowerCase() === trimmed.toLowerCase())
  ) {
    return list;
  }
  return list.map((l, i) => (i === index ? { ...l, tag: trimmed } : l));
}

/**
 * The tag a chooser pick stands for. A pick carrying a dialect tag (a
 * registered variant or a private-use dialect) contributes its dialect
 * part; a script or region the author picked rides between the language
 * and the dialect, in BCP 47 order. A pick whose dialect came from the
 * Customize field carries no dialect tag, so only the language (and any
 * script/region) is returned and the author types the dialect.
 */
export function tagFromChooserSummary(summary: ChosenSummary): string {
  const extras = extrasOf(summary);
  const script = extras?.script?.script;
  const region = extras?.region?.code;
  const dialectTag = summary.match?.dialectTag;
  if (dialectTag !== undefined) {
    const dialect = dialectTag.slice(summary.code.length + 1);
    return [
      summary.code,
      ...(script !== undefined ? [script] : []),
      ...(region !== undefined ? [region] : []),
      dialect,
    ].join("-");
  }
  return [
    summary.code,
    ...(script !== undefined ? [script] : []),
    ...(region !== undefined ? [region] : []),
  ].join("-");
}

export function LanguageListRenderer({ value, onChange }: DecisionRendererProps<LanguageListValue>) {
  const { t } = useLingui();
  const { onComplete, onBack } = useGalleryStepContext();
  const identity = useWorkingCopyStore((s) => s.identity);
  const setIdentity = useWorkingCopyStore((s) => s.setIdentity);
  const identityLanguages = identity?.languages;
  const list: LanguageListValue = useMemo(
    () => value ?? identityLanguages ?? [],
    [value, identityLanguages],
  );
  const [tag, setTag] = useState("");
  const [name, setName] = useState("");
  const [lookup, setLookup] = useState<LangtagsTagLookup | undefined>(undefined);
  const [checkTypedTag, setCheckTypedTag] = useState<
    ((text: string) => TypedTagResult) | undefined
  >(undefined);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [chooserText, setChooserText] = useState("");
  const latestSummaryRef = useRef<ChosenSummary | null>(null);
  // The chooser is an identity-flow component: its dialect fallback records
  // `language-search-match`, which would reseed this opened keyboard's
  // identity. Snapshot the record on open and restore it on close, so
  // browsing never writes an identity decision into the Open draft.
  const searchMatchBeforeRef = useRef<Decision | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void loadLangtagsLookup().then((loaded) => {
      if (live && loaded !== undefined) setLookup(loaded.tags);
    });
    // Dynamic import: the typed-tag check reads the engine langtags data,
    // which stays out of the entry chunk (spec 115 FR-037).
    void import("../languageChooser/resolveTypedTag.ts").then((mod) => {
      if (live) setCheckTypedTag(() => mod.checkTypedTag);
    });
    return () => {
      live = false;
    };
  }, []);

  const findingsByTag = useMemo(() => {
    const map = new Map<string, LanguageTagFinding[]>();
    if (lookup === undefined) return map;
    for (const f of languageTagFindings(
      list.map((l) => l.tag),
      lookup,
    )) {
      const arr = map.get(f.tag) ?? [];
      arr.push(f);
      map.set(f.tag, arr);
    }
    return map;
  }, [list, lookup]);

  const pendingTag = tag.trim();
  const pendingFindings = useMemo(
    () =>
      lookup !== undefined && pendingTag !== ""
        ? languageTagFindings([pendingTag], lookup)
        : [],
    [lookup, pendingTag],
  );
  const typedResult = useMemo(
    () => (checkTypedTag !== undefined && pendingTag !== "" ? checkTypedTag(pendingTag) : null),
    [checkTypedTag, pendingTag],
  );

  const typedSummary = typedResult !== null && typedResult.ok ? typedTagSummary(typedResult.proposal) : null;
  const typedHeadline =
    typedSummary === null
      ? null
      : [
          typedSummary.name,
          ...(typedSummary.dialectSubtag !== undefined
            ? [
                t({
                  id: "open.languages.typedTagDialect",
                  message: `Dialect ${{ subtag: typedSummary.dialectSubtag }}`,
                }),
              ]
            : []),
          ...(typedSummary.script !== undefined ? [typedSummary.script] : []),
          ...(typedSummary.region !== undefined ? [typedSummary.region] : []),
        ].join(" · ");
  const typedSuffixes =
    typedSummary === null
      ? []
      : [
          ...(typedSummary.unregistered
            ? [
                t({
                  id: "open.languages.typedTagUnregistered",
                  message: "not a registered language code",
                }),
              ]
            : []),
          ...(typedSummary.privateUse
            ? [
                t({
                  id: "open.languages.typedTagPrivateUse",
                  message: "private-use code",
                }),
              ]
            : []),
          ...(typedSummary.extensionNotCarried
            ? [
                t({
                  id: "open.languages.typedTagExtension",
                  message: "extension not carried",
                }),
              ]
            : []),
        ];
  const typedLine =
    typedHeadline === null
      ? null
      : typedSuffixes.length > 0
        ? `${typedHeadline} (${typedSuffixes.join("; ")})`
        : typedHeadline;

  const commit = (next: LanguageListValue): void => {
    onChange(next);
    setIdentity({ ...identity, languages: next });
  };

  function openBrowse(): void {
    searchMatchBeforeRef.current =
      useDecisionStore.getState().decisions["language-search-match"];
    latestSummaryRef.current = null;
    setChooserText("");
    setBrowseOpen(true);
  }

  function closeBrowse(): void {
    setBrowseOpen(false);
    const before = searchMatchBeforeRef.current;
    const now = useDecisionStore.getState().decisions["language-search-match"];
    if (now !== before) {
      if (before === undefined) {
        useDecisionStore.getState().forget("language-search-match");
      } else {
        useDecisionStore.getState().record(before);
      }
    }
  }

  /** A chooser pick fills the add form; the author still confirms with Add. */
  function handleChooserPick(): void {
    const summary = latestSummaryRef.current;
    if (summary === null) return;
    setTag(tagFromChooserSummary(summary));
    if (name.trim() === "" && summary.englishName !== undefined) {
      setName(summary.englishName);
    }
    closeBrowse();
  }

  const navSpec = useMemo(
    () => ({
      ...(onBack !== undefined
        ? {
            back: {
              label: t({ id: "open.languages.back", message: "Back" }),
              onClick: onBack,
              testId: "open-languages-back",
            },
          }
        : {}),
      forward: {
        label: t({ id: "open.languages.continue", message: "Continue" }),
        onClick: () => onComplete(undefined),
        testId: "open-languages-continue",
      },
    }),
    [onBack, onComplete, t],
  );
  usePublishStepNav(navSpec);

  // Same composition as the survey steps (Prefill): left-aligned column,
  // display title above the accent-topped card — not the old centred card
  // with hand-rolled buttons this page used to render.
  return (
    <div style={surveyPageColumn}>
      <h2 id="open-languages-heading" style={phaseHeading}>
        {t({ id: "open.languages.title", message: "Languages this keyboard supports" })}
      </h2>
      <section aria-labelledby="open-languages-heading" style={surveyCard}>
        <p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.6, color: TEXT_DIM }}>
          {t({
            id: "open.languages.intro",
            message: "These are written to the keyboard's package exactly as listed. Add, remove or reorder them.",
          })}
        </p>
        {list.length === 0 ? (
          <p style={{ fontSize: 13, color: TEXT_DIM }}>
            {t({ id: "open.languages.empty", message: "No languages are listed yet." })}
          </p>
        ) : (
          <ol style={{ margin: "0 0 12px", paddingLeft: 20 }}>
            {list.map((l, i) => {
              const rowFindings = findingsByTag.get(l.tag) ?? [];
              return (
                <li key={`${l.tag}-${i}`} style={{ marginBottom: 6 }}>
                  <span>{l.name !== undefined ? `${l.name} (${l.tag})` : l.tag}</span>{" "}
                  <Button
                    type="button"
                    size="compact"
                    disabled={i === 0}
                    onClick={() => commit(moveLanguage(list, i, -1))}
                    aria-label={t({ id: "open.languages.moveUp", message: `Move ${{ tag: l.tag }} up` })}
                  >
                    {"↑"}
                  </Button>{" "}
                  <Button
                    type="button"
                    size="compact"
                    disabled={i === list.length - 1}
                    onClick={() => commit(moveLanguage(list, i, 1))}
                    aria-label={t({ id: "open.languages.moveDown", message: `Move ${{ tag: l.tag }} down` })}
                  >
                    {"↓"}
                  </Button>{" "}
                  <Button
                    type="button"
                    size="compact"
                    onClick={() => commit(removeLanguage(list, i))}
                    aria-label={t({ id: "open.languages.remove", message: `Remove ${{ tag: l.tag }}` })}
                  >
                    {t({ id: "open.languages.removeButton", message: "Remove" })}
                  </Button>
                  {rowFindings.map((f, j) => {
                    const replacement = f.kind === "hint" ? f.replacement : undefined;
                    return (
                      <div
                        key={j}
                        style={{
                          fontSize: 12,
                          lineHeight: 1.5,
                          color:
                            f.kind === "error"
                              ? ERROR_TEXT
                              : f.kind === "warning"
                                ? CSS_WARNING_TEXT
                                : TEXT_DIM,
                        }}
                      >
                        {f.message}{" "}
                        {replacement !== undefined && (
                          <Button
                            type="button"
                            size="compact"
                            disabled={list.some(
                              (o, k) => k !== i && o.tag.toLowerCase() === replacement.toLowerCase(),
                            )}
                            onClick={() => commit(replaceLanguageTag(list, i, replacement))}
                            aria-label={t({
                              id: "open.languages.useReplacement",
                              message: `Use ${{ replacement }} instead`,
                            })}
                          >
                            {t({
                              id: "open.languages.useReplacementButton",
                              message: `Use ${{ replacement }}`,
                            })}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </li>
              );
            })}
          </ol>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const next = addLanguage(list, tag, name);
            if (next !== list) commit(next);
            setTag("");
            setName("");
          }}
          style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", marginBottom: 12 }}
        >
          <label style={{ fontSize: 13, flex: "1 1 140px" }}>
            {t({ id: "open.languages.tagLabel", message: "Language tag (BCP 47)" })}
            <br />
            <TextField value={tag} onChange={(e) => setTag(e.target.value)} />
          </label>
          <label style={{ fontSize: 13, flex: "1 1 140px" }}>
            {t({ id: "open.languages.nameLabel", message: "Name (optional)" })}
            <br />
            <TextField value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <Button type="submit" size="compact" disabled={tag.trim() === ""}>
            {t({ id: "open.languages.add", message: "Add language" })}
          </Button>
          <Button type="button" size="compact" onClick={openBrowse}>
            {browseOpen
              ? t({ id: "open.languages.hideBrowse", message: "Hide language browser" })
              : t({ id: "open.languages.browse", message: "Browse languages" })}
          </Button>
        </form>
        {pendingFindings.map((f, j) => {
          const replacement = f.kind === "hint" ? f.replacement : undefined;
          return (
            <div
              key={`pending-${j}`}
              style={{
                fontSize: 12,
                lineHeight: 1.5,
                marginBottom: 6,
                color:
                  f.kind === "error"
                    ? ERROR_TEXT
                    : f.kind === "warning"
                      ? CSS_WARNING_TEXT
                      : TEXT_DIM,
              }}
            >
              {f.message}{" "}
              {replacement !== undefined && (
                <Button
                  type="button"
                  size="compact"
                  onClick={() => setTag(replacement)}
                  aria-label={t({
                    id: "open.languages.useReplacement",
                    message: `Use ${{ replacement }} instead`,
                  })}
                >
                  {t({
                    id: "open.languages.useReplacementButton",
                    message: `Use ${{ replacement }}`,
                  })}
                </Button>
              )}
            </div>
          );
        })}
        {typedLine !== null && (
          <p style={{ fontSize: 12, lineHeight: 1.5, margin: "0 0 12px", color: TEXT_DIM }}>
            {t({
              id: "open.languages.typedTagProposal",
              message: `Typed tag: ${{ summary: typedLine }}`,
            })}
          </p>
        )}
        {browseOpen && (
          <Suspense
            fallback={
              <p style={{ fontSize: 13, color: TEXT_DIM }}>
                {t({ id: "open.languages.chooserLoading", message: "Loading languages…" })}
              </p>
            }
          >
            <LazyLanguageChooser
              id="open-languages-chooser"
              value={chooserText}
              onChange={setChooserText}
              onEntryResolved={(entry) => {
                latestSummaryRef.current = entry as ChosenSummary | null;
              }}
              onSelectAdvance={handleChooserPick}
            />
          </Suspense>
        )}
      </section>
    </div>
  );
}
