// LanguageListPanel - the editable language list for an opened keyboard (spec 111).
//
// Add, remove and reorder the languages the package descriptor lists. The list
// seeds from the keyboard's own `.kps` on Open (workingCopyStore identity) and
// the author's edits are recorded as the `language-list` decision and mirrored
// into the identity patch, which is what the `.kps` patch writes.

import { useMemo, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import type { DecisionRendererProps } from "../../decisions/decisionTypes.ts";
import { useGalleryStepContext } from "../../steps/galleryHost.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { Button } from "../../ui/Button.tsx";
import { TextField } from "../../ui/TextField.tsx";
import { TEXT_DIM } from "../../ui/theme.ts";
import {
  phaseHeading,
  surveyCard,
  surveyPageColumn,
} from "../surveyStyles.ts";
import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";

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
            {list.map((l, i) => (
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
        </form>
      </section>
    </div>
  );
}
