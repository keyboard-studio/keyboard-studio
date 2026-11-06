// MissingLettersStep: the Open walk's Missing letters page (spec 111 FR-033).
//
// Shown only when the baseline recorded that the keyboard can't type letters
// its listed languages need (open-issues, FR-032). Each missing letter is
// grouped under every language that expects it, with an Add button per letter
// (routes to the editor that places it) and a Remove language button per group
// (the other way out). The list follows the live criteria result, so a letter
// leaves it once the keyboard can type it.

import { useMemo } from "react";
import { Trans } from "@lingui/react/macro";
import type { DecisionRendererProps } from "../../decisions/decisionTypes.ts";
import { MissingLettersByLanguage } from "../../components/MissingLettersByLanguage.tsx";
import { useOpenWalkCriteria } from "../../hooks/useOpenWalkCriteria.ts";
import { useRouteSuggestedFix } from "../../hooks/useRouteSuggestedFix.ts";
import { useBasicKeyboardOpen } from "../../hooks/useBasicKeyboardOpen.ts";
import { useGalleryStepContext } from "../../steps/galleryHost.tsx";
import { missingCharacterFixes } from "../../criteria/missingCharacterFixes.ts";
import { BG_CARD, BORDER, TEXT_DIM, TEXT_MAIN, FONT } from "../../lib/galleryTheme.ts";
import { WalkNav } from "./WalkNav.tsx";

export function MissingLettersRenderer({ onChange }: DecisionRendererProps<boolean>) {
  const { onComplete } = useGalleryStepContext();
  const { result } = useOpenWalkCriteria();
  const routeFix = useRouteSuggestedFix();
  // The per-letter Add routes to the physical keys, which a basic keyboard never changes.
  const physicalFixed = useBasicKeyboardOpen();

  const fixes = useMemo(
    () =>
      result === null
        ? []
        : missingCharacterFixes(
            result.rows.flatMap((r) => (r.status === "not-met" ? (r.evidence().findings ?? []) : [])),
          ),
    [result],
  );
  const missing = fixes.flatMap((f) => (f.action !== undefined ? [f.action.subject] : []));
  const sourcesByChar = result?.expectedCoverage?.sourcesByChar;

  return (
    <section
      aria-labelledby="open-missing-letters-heading"
      style={{ maxWidth: 640, margin: "24px auto", padding: 20, background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 8, fontFamily: FONT, color: TEXT_MAIN }}
    >
      <h2 id="open-missing-letters-heading" style={{ margin: "0 0 8px", fontSize: 18 }}>
        <Trans id="open.missingLetters.title">Missing letters</Trans>
      </h2>
      {result === null ? (
        <p role="status" style={{ fontSize: 13, color: TEXT_DIM }}>
          <Trans id="open.missingLetters.preparing">Checking which letters the keyboard can type...</Trans>
        </p>
      ) : sourcesByChar === undefined || missing.length === 0 ? (
        <p role="status" style={{ fontSize: 13, color: TEXT_DIM }} data-testid="missing-letters-none">
          <Trans id="open.missingLetters.none">
            The keyboard can now type every letter its listed languages need.
          </Trans>
        </p>
      ) : (
        <MissingLettersByLanguage
          missing={missing}
          sourcesByChar={sourcesByChar}
          {...(physicalFixed
            ? {}
            : {
                onAdd: (ch: string) => {
                  const fix = fixes.find((f) => f.action?.subject === ch);
                  if (fix !== undefined) routeFix(fix);
                },
              })}
        />
      )}
      {physicalFixed && missing.length > 0 && (
        <p style={{ fontSize: 13, color: TEXT_DIM }} data-testid="missing-letters-physical-fixed">
          <Trans id="open.missingLetters.physicalFixed">
            This keyboard's physical layout is fixed to match Windows, so letters can't be added to its keys. Remove
            a language the keyboard isn't meant to support, or continue.
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
  );
}
