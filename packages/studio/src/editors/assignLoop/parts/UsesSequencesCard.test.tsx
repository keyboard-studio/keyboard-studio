// Unit tests for UsesSequencesCard — the "Sequences using this character"
// read-only card shared by MechanismGallery (physical) and TouchGallery
// (touch). See the file-header comment on UsesSequencesCard.tsx for the
// PRODUCES-vs-USES distinction and the testid scheme (card:
// uses-sequences-card; rows: uses-sequences-row-<idx>).
//
// This file exercises the component's OWN rendering contract against
// hand-built props — it is deliberately isolated (no store, no gallery). The
// integration gap this isolation would otherwise leave (proving each gallery
// actually wires this component to REAL store-backed assignments, not a
// constant) is closed separately in MechanismGallery.test.tsx and
// TouchGallery.test.tsx's own "UsesSequencesCard (integration)" suites.

import { describe, it, expect, afterEach } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { render } from "../../../test/renderWithI18n.tsx";
import { UsesSequencesCard } from "./UsesSequencesCard.tsx";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import { PATTERN_SEQUENCE, PATTERN_DEADKEY } from "../patternIds.ts";

afterEach(() => {
  cleanup();
});

/** A recorded multi_char_sequence assignment: `target` PRODUCES via the
 * sequence's collapse; `firstLetterOut`/`secondLetter` are its two INPUT
 * slots. */
function sequenceAssignment(opts: {
  target: string;
  firstLetterOut: string;
  secondLetter: string;
}): MechanismAssignment {
  return {
    scope: "individual",
    target: opts.target,
    modality: "physical",
    mechanisms: [
      {
        patternId: PATTERN_SEQUENCE,
        strategyId: "S-03",
        slotValues: {
          firstLetterOut: opts.firstLetterOut,
          secondLetter: opts.secondLetter,
          collapsedChar: opts.target,
        },
      },
    ],
    source: "user",
  };
}

describe("UsesSequencesCard — empty states (no card)", () => {
  it("renders nothing when currentChar is null", () => {
    const { container } = render(
      <UsesSequencesCard
        currentChar={null}
        assignments={[sequenceAssignment({ target: "ŋ", firstLetterOut: "n", secondLetter: "g" })]}
        modality="physical"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when assignments is empty", () => {
    const { container } = render(
      <UsesSequencesCard currentChar="n" assignments={[]} modality="physical" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when currentChar appears in no recorded sequence's slots", () => {
    // "z" is unrelated to the recorded n+g -> ŋ sequence — it must not surface.
    const { container } = render(
      <UsesSequencesCard
        currentChar="z"
        assignments={[sequenceAssignment({ target: "ŋ", firstLetterOut: "n", secondLetter: "g" })]}
        modality="physical"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for a currentChar that only appears as a NON-sequence mechanism's target (produces, not uses)", () => {
    // A simple_swap assignment targeting "n" is a PRODUCER of "n", not a
    // sequence that USES it — the card must not conflate the two halves.
    const { container } = render(
      <UsesSequencesCard
        currentChar="n"
        assignments={[
          {
            scope: "individual",
            target: "n",
            modality: "physical",
            mechanisms: [{ patternId: PATTERN_DEADKEY, slotValues: { baseLetters: "n" } }],
          },
        ]}
        modality="physical"
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("UsesSequencesCard — populated (renders the card + rows)", () => {
  it("renders the card and one row for a sequence where currentChar is an INPUT slot (firstLetterOut), not the produced char", () => {
    render(
      <UsesSequencesCard
        currentChar="n"
        assignments={[sequenceAssignment({ target: "ŋ", firstLetterOut: "n", secondLetter: "g" })]}
        modality="physical"
      />,
    );
    const card = screen.getByTestId("uses-sequences-card");
    const row = within(card).getByTestId("uses-sequences-row-0");
    expect(row.textContent).toContain("n");
    expect(row.textContent).toContain("g");
    expect(row.textContent).toContain("ŋ");
  });

  it("also surfaces currentChar when it is the OTHER input slot (secondLetter)", () => {
    render(
      <UsesSequencesCard
        currentChar="g"
        assignments={[sequenceAssignment({ target: "ŋ", firstLetterOut: "n", secondLetter: "g" })]}
        modality="physical"
      />,
    );
    expect(screen.getByTestId("uses-sequences-card")).toBeTruthy();
    expect(screen.getByTestId("uses-sequences-row-0")).toBeTruthy();
  });

  it("renders one row per matching sequence, in assignments-array order", () => {
    render(
      <UsesSequencesCard
        currentChar="n"
        assignments={[
          sequenceAssignment({ target: "ŋ", firstLetterOut: "n", secondLetter: "g" }),
          sequenceAssignment({ target: "ñ", firstLetterOut: "n", secondLetter: "~" }),
        ]}
        modality="physical"
      />,
    );
    const card = screen.getByTestId("uses-sequences-card");
    expect(within(card).getByTestId("uses-sequences-row-0").textContent).toContain("ŋ");
    expect(within(card).getByTestId("uses-sequences-row-1").textContent).toContain("ñ");
    expect(within(card).queryByTestId("uses-sequences-row-2")).toBeNull();
  });

  it("still surfaces a sequence (always recorded physical) when modality='touch' — sequences are cross-modality by design", () => {
    // charMechanisms.ts's file-header comment: usesSequences is NOT gated by
    // the `modality` argument, because sequences are always recorded
    // physical — TouchGallery passes modality="touch" for this same card.
    render(
      <UsesSequencesCard
        currentChar="n"
        assignments={[sequenceAssignment({ target: "ŋ", firstLetterOut: "n", secondLetter: "g" })]}
        modality="touch"
      />,
    );
    expect(screen.getByTestId("uses-sequences-card")).toBeTruthy();
  });
});
