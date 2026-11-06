// LanguageListPanel - the editable language list for an opened keyboard (spec 111).
//
// Add, remove and reorder the languages the package descriptor lists. The list
// seeds from the keyboard's own `.kps` on Open (workingCopyStore identity) and
// the author's edits are recorded as the `language-list` decision and mirrored
// into the identity patch, which is what the `.kps` patch writes.

import { useState } from "react";
import { useLingui } from "@lingui/react/macro";
import type { DecisionRendererProps } from "../../decisions/decisionTypes.ts";
import { useGalleryStepContext } from "../../steps/galleryHost.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { BG_CARD, BORDER, TEXT_DIM, TEXT_MAIN, FONT, galleryForwardBtnStyle } from "../../lib/galleryTheme.ts";

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

const smallBtn = {
  padding: "2px 8px",
  fontSize: 12,
  fontFamily: FONT,
  color: TEXT_MAIN,
  background: "transparent",
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  cursor: "pointer",
} as const;

export function LanguageListRenderer({ value, onChange }: DecisionRendererProps<LanguageListValue>) {
  const { t } = useLingui();
  const { onComplete, onBack } = useGalleryStepContext();
  const identity = useWorkingCopyStore((s) => s.identity);
  const setIdentity = useWorkingCopyStore((s) => s.setIdentity);
  const list: LanguageListValue = value ?? identity?.languages ?? [];
  const [tag, setTag] = useState("");
  const [name, setName] = useState("");

  const commit = (next: LanguageListValue): void => {
    onChange(next);
    setIdentity({ ...identity, languages: next });
  };

  return (
    <section
      aria-labelledby="open-languages-heading"
      style={{ maxWidth: 560, margin: "24px auto", padding: 20, background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 8, fontFamily: FONT, color: TEXT_MAIN }}
    >
      <h2 id="open-languages-heading" style={{ margin: "0 0 8px", fontSize: 18 }}>
        {t({ id: "open.languages.title", message: "Languages this keyboard supports" })}
      </h2>
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
          {list.map((l, i) => (
            <li key={`${l.tag}-${i}`} style={{ marginBottom: 6 }}>
              <span>{l.name !== undefined ? `${l.name} (${l.tag})` : l.tag}</span>{" "}
              <button
                type="button"
                style={smallBtn}
                disabled={i === 0}
                onClick={() => commit(moveLanguage(list, i, -1))}
                aria-label={t({ id: "open.languages.moveUp", message: `Move ${{ tag: l.tag }} up` })}
              >
                {"↑"}
              </button>{" "}
              <button
                type="button"
                style={smallBtn}
                disabled={i === list.length - 1}
                onClick={() => commit(moveLanguage(list, i, 1))}
                aria-label={t({ id: "open.languages.moveDown", message: `Move ${{ tag: l.tag }} down` })}
              >
                {"↓"}
              </button>{" "}
              <button
                type="button"
                style={smallBtn}
                onClick={() => commit(removeLanguage(list, i))}
                aria-label={t({ id: "open.languages.remove", message: `Remove ${{ tag: l.tag }}` })}
              >
                {t({ id: "open.languages.removeButton", message: "Remove" })}
              </button>
            </li>
          ))}
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
        <label style={{ fontSize: 13 }}>
          {t({ id: "open.languages.tagLabel", message: "Language tag (BCP 47)" })}
          <br />
          <input value={tag} onChange={(e) => setTag(e.target.value)} style={{ fontFamily: FONT }} />
        </label>
        <label style={{ fontSize: 13 }}>
          {t({ id: "open.languages.nameLabel", message: "Name (optional)" })}
          <br />
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ fontFamily: FONT }} />
        </label>
        <button type="submit" style={smallBtn} disabled={tag.trim() === ""}>
          {t({ id: "open.languages.add", message: "Add language" })}
        </button>
      </form>
      <div style={{ display: "flex", gap: 8 }}>
        {onBack !== undefined && (
          <button type="button" style={smallBtn} onClick={onBack}>
            {t({ id: "open.languages.back", message: "Back" })}
          </button>
        )}
        <button type="button" style={galleryForwardBtnStyle} onClick={() => onComplete(undefined)}>
          {t({ id: "open.languages.continue", message: "Continue" })}
        </button>
      </div>
    </section>
  );
}
