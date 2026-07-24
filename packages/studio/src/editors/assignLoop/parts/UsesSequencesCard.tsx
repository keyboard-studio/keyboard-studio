// UsesSequencesCard — shared "Sequences using this character" read-only card
// for the two assignment-loop galleries (MechanismGallery: physical/desktop;
// TouchGallery: touch). Extracted from a byte-identical block hand-copied in
// both galleries (see MechanismGallery.tsx/TouchGallery.tsx history) —
// consolidated here the same way CharScrollStrip.tsx consolidated the
// character-scroll strip.
//
// Every recorded multi_char_sequence where `char` appears in ANY slot
// (content, indicator, or output), not just the ones whose output IS `char`.
// Read-only here — mirrors SequenceGallery's own "Recorded sequences" card
// style (SequenceGallery.tsx) but editing a sequence stays owned by the
// Sequence Gallery, so no Remove control is offered.
//
// Data source stays the caller's own concern (see charMechanisms.ts's own
// header comment): MechanismGallery passes its physical `sessionAssignments`
// + modality "physical"; TouchGallery passes its desktop `desktopAssignments`
// + modality "touch" (sequences are always recorded with physical modality,
// so the `modality` argument doesn't affect this card's `usesSequences`
// list — it's only consulted by charMechanisms.ts's PRODUCES half — but each
// gallery keeps passing its own modality for consistency with the shared
// getCharMechanisms signature CharScrollStrip also uses).
//
// Test-id scheme (documented, per Part-3 follow-up): the card itself is
// `uses-sequences-card`; each row is `uses-sequences-row-<idx>`, where <idx>
// is the row's position in the (already deterministic, assignments-array-
// order) usesSequences list — simpler than CharScrollStrip's per-codepoint
// hex scheme because rows here aren't independently addressable by a single
// character (a row is a content+indicator+output triple), and render order
// is stable across re-renders for a given currentChar/assignments pair.

import { Trans } from "@lingui/react/macro";
import type { MechanismAssignment, Modality } from "@keyboard-studio/contracts";
import { displayChar } from "../../../lib/irToCarveNodes.ts";
import { getCharMechanisms } from "./charMechanisms.ts";
import { BG_CARD, BORDER, TEXT_DIM, TEXT_MAIN, FONT } from "../../../lib/galleryTheme.ts";

export interface UsesSequencesCardProps {
  /** Currently selected character, or null before the list has settled. */
  currentChar: string | null;
  /** Assignments the usesSequences list is computed from (see charMechanisms.ts). */
  assignments: ReadonlyArray<MechanismAssignment>;
  /** Which modality to pass through to getCharMechanisms — see file header re: this list's own modality-independence. */
  modality: Modality;
}

export function UsesSequencesCard({
  currentChar,
  assignments,
  modality,
}: UsesSequencesCardProps) {
  const usesSequences =
    currentChar !== null
      ? getCharMechanisms(currentChar, assignments, modality).usesSequences
      : [];

  if (usesSequences.length === 0) return null;

  return (
    <div
      data-testid="uses-sequences-card"
      style={{
        background: BG_CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 10,
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: TEXT_DIM,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        <Trans id="editor.assignLoop.usesSequences.heading">
          Sequences using this character
        </Trans>
      </p>
      {usesSequences.map(({ target, ref }, idx) => {
        const seqContent = ref.slotValues?.["firstLetterOut"] ?? "";
        const seqIndicator = ref.slotValues?.["secondLetter"] ?? "";
        return (
          <div
            key={`${target}\0${seqContent}\0${seqIndicator}\0${idx}`}
            data-testid={`uses-sequences-row-${idx}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 13,
              fontFamily: FONT,
            }}
          >
            <span style={{ color: TEXT_MAIN }}>
              {displayChar(seqContent)}
              {" + "}
              {displayChar(seqIndicator)}
              {" "}
              &rarr;{" "}
              <span style={{ fontFamily: "monospace", fontSize: 15 }}>
                {displayChar(target)}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
