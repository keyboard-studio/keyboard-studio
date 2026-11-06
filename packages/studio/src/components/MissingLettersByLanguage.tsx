// MissingLettersByLanguage — the expected characters an opened keyboard cannot
// type, grouped by the language that expects them (spec 111 FR-018a).
//
// Each missing character is an 18.6 finding with its own "add" fix; this view
// says which listed language asks for it, and offers the other way out: when
// the layout should not change, drop the language from the keyboard's list.
// Removal records the same `language-list` decision the Languages step does,
// so the .kps patch and the next criteria run both follow it.

import { Trans, useLingui } from "@lingui/react/macro";

import { Button } from "../ui/Button.tsx";
import { BORDER, FONT, TEXT_DIM } from "../ui/theme.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { decideGalleryValue } from "../steps/galleryHost.tsx";
import { buildGalleryHostDeps } from "../lib/galleryHostDeps.ts";
import languageListModule from "../survey/questions/gallery/languageList.ts";

export interface LanguageGroup {
  tag: string;
  chars: string[];
}

/** Group missing characters under each language that expects them, in list order. */
export function groupMissingByLanguage(
  missing: readonly string[],
  sourcesByChar: Readonly<Record<string, readonly string[]>>,
  languageOrder: readonly string[],
): LanguageGroup[] {
  const byTag = new Map<string, string[]>();
  for (const ch of missing) {
    for (const tag of sourcesByChar[ch] ?? []) {
      const chars = byTag.get(tag) ?? [];
      if (!chars.includes(ch)) chars.push(ch);
      byTag.set(tag, chars);
    }
  }
  const rank = (tag: string): number => {
    const i = languageOrder.findIndex((t) => t.toLowerCase() === tag.toLowerCase());
    return i === -1 ? languageOrder.length : i;
  };
  return [...byTag].map(([tag, chars]) => ({ tag, chars })).sort((a, b) => rank(a.tag) - rank(b.tag));
}

const sectionStyle: React.CSSProperties = {
  margin: "0 0 16px",
  padding: "8px 12px",
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  fontFamily: FONT,
  fontSize: 13,
};

const itemStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
  padding: "6px 0",
};

export function MissingLettersByLanguage({
  missing,
  sourcesByChar,
  onAdd,
}: {
  missing: readonly string[];
  sourcesByChar: Readonly<Record<string, readonly string[]>>;
  /** When given, each letter carries an Add button that calls it with that letter. */
  onAdd?: (char: string) => void;
}) {
  const { t } = useLingui();
  const identity = useWorkingCopyStore((s) => s.identity);
  const setIdentity = useWorkingCopyStore((s) => s.setIdentity);
  const languages = identity?.languages ?? [];
  const groups = groupMissingByLanguage(
    missing,
    sourcesByChar,
    languages.map((l) => l.tag),
  );
  if (groups.length === 0) return null;

  const remove = (tag: string): void => {
    const next = languages.filter((l) => l.tag.toLowerCase() !== tag.toLowerCase());
    decideGalleryValue(languageListModule, next, { provenance: "asked" }, "open_languages", buildGalleryHostDeps());
    setIdentity({ ...identity, languages: next });
  };

  return (
    <section style={sectionStyle} data-testid="missing-letters-by-language">
      <h3 style={{ margin: "0 0 4px", fontSize: 14 }}>
        <Trans id="missingLetters.title">Letters the listed languages need</Trans>
      </h3>
      <p style={{ margin: "0 0 4px", color: TEXT_DIM }}>
        {onAdd === undefined ? (
          <Trans id="missingLetters.introNoAdd">
            The keyboard can't type these letters. Remove a language the keyboard isn't meant to support.
          </Trans>
        ) : (
          <Trans id="missingLetters.intro">
            The keyboard can't type these letters. Add them below, or remove a language
            the keyboard isn't meant to support.
          </Trans>
        )}
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {groups.map(({ tag, chars }) => {
          const entry = languages.find((l) => l.tag.toLowerCase() === tag.toLowerCase());
          const name = entry?.name !== undefined ? `${entry.name} (${tag})` : tag;
          return (
            <li key={tag} style={itemStyle} data-testid={`missing-letters-${tag}`}>
              <span style={{ flex: "1 1 200px" }}>
                <strong>{name}</strong>:{" "}
                {onAdd === undefined ? (
                  <span lang={tag}>{chars.join(" ")}</span>
                ) : (
                  chars.map((ch) => (
                    <span key={ch} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 8 }}>
                      <span lang={tag}>{ch}</span>
                      <Button
                        size="compact"
                        onClick={() => onAdd(ch)}
                        aria-label={t({
                          id: "missingLetters.add.label",
                          message: `Add ${ch} to the keyboard (${name})`,
                        })}
                      >
                        <Trans id="missingLetters.add">Add</Trans>
                      </Button>
                    </span>
                  ))
                )}
              </span>
              {entry !== undefined && (
                <Button
                  size="compact"
                  onClick={() => remove(tag)}
                  aria-label={t({
                    id: "missingLetters.remove.label",
                    message: `Remove ${name} from this keyboard's languages`,
                  })}
                >
                  <Trans id="missingLetters.remove">Remove language</Trans>
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
