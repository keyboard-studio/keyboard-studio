// Tests for the decision-spike adapt diff (km/decisions-spike).

import { describe, it, expect } from "vitest";
import type { DecisionSet } from "./decisionTypes.ts";
import { diffDecisions } from "./adaptDiff.ts";

describe("diffDecisions", () => {
  it("marks kept, changed, new, and missing decisions", () => {
    const extracted: DecisionSet = {
      "language-code": { id: "language-code", value: "bam", provenance: "extracted", source: "sil_cameroon_qwerty" },
      "target-script": { id: "target-script", value: "Latn", provenance: "extracted", source: "sil_cameroon_qwerty" },
      "author-name": { id: "author-name", value: undefined, provenance: "default" },
    };
    const answers: DecisionSet = {
      "language-code": { id: "language-code", value: "bam", provenance: "asked" },
      "target-script": { id: "target-script", value: "Arab", provenance: "asked" },
      "language-name": { id: "language-name", value: "Hausa", provenance: "asked" },
    };

    const byId = Object.fromEntries(diffDecisions(extracted, answers).map((d) => [d.id, d]));

    // Same value as extracted → confirmed.
    expect(byId["language-code"]).toMatchObject({ status: "confirmed", provenance: "extracted" });
    // Different value → changed, carrying the answer's provenance.
    expect(byId["target-script"]).toMatchObject({ status: "changed", provenance: "asked" });
    // Answer where nothing was extracted → changed (new information).
    expect(byId["language-name"]).toMatchObject({ status: "changed", provenance: "asked" });
    // Neither extracted nor answered → missing.
    expect(byId["author-name"]).toMatchObject({ status: "missing" });
  });

  it("is empty when both sets are empty", () => {
    expect(diffDecisions({}, {})).toEqual([]);
  });

  it("compares array/object values structurally, not by reference", () => {
    const extracted: DecisionSet = {
      "character-inventory": {
        id: "character-inventory",
        value: ["a", "é"],
        provenance: "extracted",
      },
    };
    const same: DecisionSet = {
      "character-inventory": {
        id: "character-inventory",
        value: ["a", "é"],
        provenance: "asked",
      },
    };
    const reordered: DecisionSet = {
      "character-inventory": {
        id: "character-inventory",
        value: ["é", "a"],
        provenance: "asked",
      },
    };
    const byId = (d: DecisionSet) =>
      Object.fromEntries(diffDecisions(extracted, d).map((x) => [x.id, x]));

    // Structurally equal arrays → confirmed (reference equality would say changed).
    expect(byId(same)["character-inventory"]).toMatchObject({
      status: "confirmed",
      provenance: "extracted",
    });
    // Different order → changed.
    expect(byId(reordered)["character-inventory"]).toMatchObject({
      status: "changed",
      provenance: "asked",
    });
  });

  it("compares nested objects structurally", () => {
    const extracted: DecisionSet = {
      "language-name": {
        id: "language-name",
        value: { name: "Hausa", tags: ["a"] },
        provenance: "extracted",
      },
    };
    const same: DecisionSet = {
      "language-name": {
        id: "language-name",
        value: { name: "Hausa", tags: ["a"] },
        provenance: "asked",
      },
    };
    const different: DecisionSet = {
      "language-name": {
        id: "language-name",
        value: { name: "Hausa", tags: ["b"] },
        provenance: "asked",
      },
    };
    const byId = (d: DecisionSet) =>
      Object.fromEntries(diffDecisions(extracted, d).map((x) => [x.id, x]));
    expect(byId(same)["language-name"]).toMatchObject({ status: "confirmed" });
    expect(byId(different)["language-name"]).toMatchObject({ status: "changed" });
  });
});
