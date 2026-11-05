// Tests for historyProposal (spec 080 T039/T041).
//
// Coverage:
//   historyEntryHeading:
//     1. Renders "## <version> (<dateIso>)".
//   buildHistoryProposal:
//     2. Empty seed, no base -> single "Initial release." bullet.
//     3. Base only (adaptation, no other changes) -> single "Adapted from" bullet, no "Initial release.".
//     4. Full seed (base + characters + mechanisms + characters removed) -> bullets in order.
//     5. Characters-added bullet lists every character under the cap.
//     6. Characters-added bullet caps the inline list with "and N more".
//     7. Mechanisms-assigned bullet lists every mechanism under the cap.
//     8. charactersRemoved === 0 -> no "Removed" bullet.
//     9. charactersRemoved > 0 -> "Removed N characters." bullet.
//     11. Combining marks in charactersAdded render on a dotted-circle carrier.
//     10. version/dateIso pass through onto the returned HistoryProposal unchanged.

import { describe, it, expect } from "vitest";
import {
  buildHistoryProposal,
  historyEntryHeading,
  type HistoryProposalSeed,
} from "./historyProposal.js";

function emptySeed(overrides: Partial<HistoryProposalSeed> = {}): HistoryProposalSeed {
  return {
    base: null,
    charactersAdded: [],
    mechanismsAssigned: [],
    charactersRemoved: 0,
    ...overrides,
  };
}

describe("historyEntryHeading", () => {
  it("renders the '## <version> (<dateIso>)' heading", () => {
    expect(historyEntryHeading("1.2", "2026-06-18")).toBe("## 1.2 (2026-06-18)");
  });
});

describe("buildHistoryProposal", () => {
  it("empty seed with no base yields a single 'Initial release.' bullet", () => {
    const proposal = buildHistoryProposal(emptySeed(), "1.0", "2026-06-18");
    expect(proposal.version).toBe("1.0");
    expect(proposal.dateIso).toBe("2026-06-18");
    expect(proposal.bullets).toEqual(["Initial release."]);
  });

  it("adaptation seed with no other changes yields only the 'Adapted from' bullet", () => {
    const seed = emptySeed({ base: { id: "basic_kbdfr", version: "1.3" } });
    const proposal = buildHistoryProposal(seed, "1.1", "2026-06-18");
    expect(proposal.bullets).toEqual(["Adapted from basic_kbdfr v1.3 via keyboard-studio."]);
  });

  it("full seed produces bullets in order: base, characters, mechanisms, characters removed", () => {
    const seed: HistoryProposalSeed = {
      base: { id: "basic_kbdfr", version: "1.3" },
      charactersAdded: ["é", "è"],
      mechanismsAssigned: ["dead key"],
      charactersRemoved: 2,
    };
    const proposal = buildHistoryProposal(seed, "1.1", "2026-06-18");
    expect(proposal.bullets).toEqual([
      "Adapted from basic_kbdfr v1.3 via keyboard-studio.",
      "Added 2 characters: é, è.",
      "Assigned mechanisms: dead key.",
      "Removed 2 characters.",
    ]);
  });

  it("uses singular 'character' for exactly one character added", () => {
    const seed = emptySeed({ charactersAdded: ["a"] });
    const proposal = buildHistoryProposal(seed, "1.0", "2026-06-18");
    expect(proposal.bullets).toEqual(["Added 1 character: a."]);
  });

  it("uses singular 'character' for exactly one character removed", () => {
    const seed = emptySeed({ charactersRemoved: 1 });
    const proposal = buildHistoryProposal(seed, "1.0", "2026-06-18");
    expect(proposal.bullets).toEqual(["Removed 1 character."]);
  });

  it("lists every character under the inline cap", () => {
    const seed = emptySeed({ charactersAdded: ["a", "b", "c"] });
    const proposal = buildHistoryProposal(seed, "1.0", "2026-06-18");
    expect(proposal.bullets).toEqual(["Added 3 characters: a, b, c."]);
  });

  it("caps a long characters-added list with 'and N more'", () => {
    const chars = Array.from({ length: 13 }, (_, i) => String.fromCharCode(97 + i)); // a..m
    const seed = emptySeed({ charactersAdded: chars });
    const proposal = buildHistoryProposal(seed, "1.0", "2026-06-18");
    expect(proposal.bullets).toEqual([
      "Added 13 characters: a, b, c, d, e, f, g, h, i, j, and 3 more.",
    ]);
  });

  it("lists every mechanism assigned", () => {
    const seed = emptySeed({ mechanismsAssigned: ["dead key", "multi-tap"] });
    const proposal = buildHistoryProposal(seed, "1.0", "2026-06-18");
    expect(proposal.bullets).toEqual(["Assigned mechanisms: dead key, multi-tap."]);
  });

  it("omits the 'Removed' bullet when charactersRemoved is 0", () => {
    const seed = emptySeed({ charactersAdded: ["a"], charactersRemoved: 0 });
    const proposal = buildHistoryProposal(seed, "1.0", "2026-06-18");
    expect(proposal.bullets.some((b) => b.startsWith("Removed"))).toBe(false);
  });

  it("includes a 'Removed N characters.' bullet when charactersRemoved > 0", () => {
    const seed = emptySeed({ charactersRemoved: 5 });
    const proposal = buildHistoryProposal(seed, "1.0", "2026-06-18");
    expect(proposal.bullets).toEqual(["Removed 5 characters."]);
  });

  it("uses singular nouns when the count is 1", () => {
    expect(buildHistoryProposal(emptySeed({ charactersAdded: ["ŋ"] }), "1.0", "2026-06-18").bullets).toEqual([
      "Added 1 character: ŋ.",
    ]);
    expect(buildHistoryProposal(emptySeed({ charactersRemoved: 1 }), "1.0", "2026-06-18").bullets).toEqual([
      "Removed 1 character.",
    ]);
  });

  it("renders combining marks on a dotted-circle carrier", () => {
    const nukta = "\u093C"; // Devanagari nukta (Mn)
    const seed = emptySeed({ charactersAdded: ["a", nukta, "é"] });
    const proposal = buildHistoryProposal(seed, "1.0", "2026-06-18");
    expect(proposal.bullets).toEqual([`Added 3 characters: a, ◌${nukta}, é.`]);
  });

  it("passes version and dateIso through unchanged", () => {
    const proposal = buildHistoryProposal(emptySeed(), "2.4", "2099-12-31");
    expect(proposal.version).toBe("2.4");
    expect(proposal.dateIso).toBe("2099-12-31");
  });
});
