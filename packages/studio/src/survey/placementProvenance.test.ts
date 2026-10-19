// Unit tests for placementProvenance (issue #331) — which provenance a
// placement proposal expresses on its chip, decided from the candidate's
// stored metadata (priorSource / priorCount) and the author's community
// context.

import { describe, it, expect } from "vitest";
import type { PlacementCandidate } from "@keyboard-studio/contracts";
import { provenanceForCandidate } from "./placementProvenance.ts";
import type { CommunityContext } from "./communityContext.ts";

function candidate(overrides: Partial<PlacementCandidate>): PlacementCandidate {
  return {
    vkey: "K_F",
    modifiers: ["RALT"],
    mechanism: "direct",
    priorSource: "corpus",
    priorCount: 5,
    confidence: 0.9,
    ...overrides,
  };
}

const CONTEXT: CommunityContext = {
  facetId: "community.muscle-memory",
  existingKeyboards: "French AZERTY keyboard",
  layoutFamily: "azerty",
};

describe("provenanceForCandidate", () => {
  it("frames a corpus candidate as community evidence when the author gave context", () => {
    expect(provenanceForCandidate(candidate({}), CONTEXT)).toEqual({
      kind: "corpus-community",
      priorCount: 5,
    });
  });

  it("falls back to the plain corpus citation without context", () => {
    expect(provenanceForCandidate(candidate({}), null)).toEqual({
      kind: "corpus",
      priorCount: 5,
    });
  });

  it("carries the candidate's own attestation count, not a recomputed one", () => {
    expect(provenanceForCandidate(candidate({ priorCount: 2 }), null)).toEqual({
      kind: "corpus",
      priorCount: 2,
    });
  });

  it("shows nothing for a corpus candidate with no attestation", () => {
    expect(provenanceForCandidate(candidate({ priorCount: 0 }), CONTEXT)).toBeNull();
    expect(provenanceForCandidate(candidate({ priorCount: 0 }), null)).toBeNull();
  });

  it.each(["unicode-decomp", "phonetic", "confusable", "manual"] as const)(
    "labels a %s candidate by its anchor type, with or without context",
    (anchor) => {
      const c = candidate({ priorSource: anchor, priorCount: 0 });
      expect(provenanceForCandidate(c, CONTEXT)).toEqual({ kind: "anchor", anchor });
      expect(provenanceForCandidate(c, null)).toEqual({ kind: "anchor", anchor });
    },
  );
});
