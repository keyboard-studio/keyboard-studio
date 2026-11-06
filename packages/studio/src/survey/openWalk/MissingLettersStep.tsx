// MissingLettersStep: the Open walk's Letters page (spec 111 FR-031, FR-033).
//
// The author confirms the characters the keyboard types (read from what it
// produces, seeded by useOpenInventorySeed) and may add more, including letters
// beyond the base set. Letters the listed languages need but the keyboard cannot
// type are grouped by language, each with Add and each group with Remove language.
// "Add" puts the character into the character inventory; the Mechanisms and Touch
// galleries later in the walk are where it gets its keys, as on Copy.
//
// Shown always for a keyboard that is not basic, and for a basic keyboard only when
// the baseline found missing letters (decisions/openIssues.ts openLettersGate). A
// basic keyboard's physical layout is fixed, so there an added character can go
// on the touch layout only.

import { useMemo, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { DecisionRendererProps } from "../../decisions/decisionTypes.ts";
import { MissingLettersByLanguage } from "../../components/MissingLettersByLanguage.tsx";
import { useOpenWalkCriteria } from "../../hooks/useOpenWalkCriteria.ts";
import { useBasicKeyboardOpen } from "../../hooks/useBasicKeyboardOpen.ts";
import { useGalleryStepContext } from "../../steps/galleryHost.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { missingCharacterFixes } from "../../criteria/missingCharacterFixes.ts";
import { addToInventory, charactersOf } from "../../lib/openInventory.ts";
import { Button } from "../../ui/Button.tsx";
import { TextField } from "../../ui/TextField.tsx";
import { TEXT_DIM } from "../../ui/theme.ts";
import {
  phaseHeading,
  sectionHeading,
  surveyCard,
  surveyPageColumn,
} from "../surveyStyles.ts";
import { WalkNav } from "./WalkNav.tsx";

export function MissingLettersRenderer({ onChange }: DecisionRendererProps<boolean>) {
  const { t } = useLingui();
  const { onComplete } = useGalleryStepContext();
  const { result } = useOpenWalkCriteria();
  const basic = useBasicKeyboardOpen();
  const inventory = useWorkingCopyStore((s) => s.session.confirmedInventory);
  const [typed, setTyped] = useState("");

  const have = useMemo(() => new Set((inventory ?? []).map((c) => c.normalize("NFC"))), [inventory]);
  const missing = useMemo(
    () =>
      result === null
        ? []
        : missingCharacterFixes(
            result.rows.flatMap((r) => (r.status === "not-met" ? (r.evidence().findings ?? []) : [])),
          ).flatMap((f) => (f.action !== undefined ? [f.action.subject] : [])),
    [result],
  );
  const sourcesByChar = result?.expectedCoverage?.sourcesByChar;

  // Same composition as the survey steps (Prefill): left-aligned column,
  // display title above the accent-topped card — not the old centred card
  // with a plain 18px title this page used to render.
  return (
    <div style={surveyPageColumn}>
      <h2 id="open-letters-heading" style={phaseHeading}>
        <Trans id="open.letters.title">Letters</Trans>
      </h2>
      <section aria-labelledby="open-letters-heading" style={surveyCard}>
        <h3 style={sectionHeading}>
          <Trans id="open.letters.current.title">Characters this keyboard types</Trans>
        </h3>
        <p style={{ margin: "0 0 8px", fontSize: 13, color: TEXT_DIM }}>
          <Trans id="open.letters.current.intro">
            Check these are the letters and marks the keyboard should have. Add any it should also have; the
            keyboard can type more than the base set.
          </Trans>
        </p>
        {have.size === 0 ? (
          <p style={{ fontSize: 13, color: TEXT_DIM }}>
            <Trans id="open.letters.current.empty">No characters have been read from the keyboard yet.</Trans>
          </p>
        ) : (
          <p data-testid="open-letters-inventory" style={{ margin: "0 0 12px", fontSize: 18, lineHeight: 1.6, wordBreak: "break-all" }}>
            {[...have].join(" ")}
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            addToInventory(charactersOf(typed));
            setTyped("");
          }}
          style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap", margin: "0 0 16px" }}
        >
          <label style={{ fontSize: 13, flex: "1 1 200px" }}>
            <Trans id="open.letters.add.label">Characters to add</Trans>
            <br />
            <TextField
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-label={t({ id: "open.letters.add.input", message: "Characters to add to the keyboard" })}
              style={{ fontSize: 16 }}
            />
          </label>
          <Button type="submit" size="compact" disabled={charactersOf(typed).length === 0}>
            <Trans id="open.letters.add.button">Add characters</Trans>
          </Button>
        </form>

        {result === null ? (
          <p role="status" style={{ fontSize: 13, color: TEXT_DIM }}>
            <Trans id="open.missingLetters.preparing">Checking which letters the keyboard can type...</Trans>
          </p>
        ) : sourcesByChar !== undefined && missing.length > 0 ? (
          <MissingLettersByLanguage
            missing={missing}
            sourcesByChar={sourcesByChar}
            added={have}
            onAdd={(ch) => addToInventory([ch])}
          />
        ) : (
          <p role="status" style={{ fontSize: 13, color: TEXT_DIM }} data-testid="missing-letters-none">
            <Trans id="open.missingLetters.none">
              The keyboard can now type every letter its listed languages need.
            </Trans>
          </p>
        )}
        {basic && (
          <p style={{ fontSize: 13, color: TEXT_DIM }} data-testid="missing-letters-physical-fixed">
            <Trans id="open.missingLetters.physicalFixed">
              This keyboard's physical layout is fixed to match Windows, so added letters can only go on its touch
              layout. Remove a language the keyboard isn't meant to support, or continue.
            </Trans>
          </p>
        )}
        <WalkNav
          onContinue={() => {
            onChange(true);
            onComplete(undefined);
          }}
        />
      </section>
    </div>
  );
}
