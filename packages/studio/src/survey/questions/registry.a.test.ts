// Tests for the Phase A decision-id index (spec 085 T012): the first
// fan-out retirement step — "the module for decision X" comes from the
// modules' own `provides` declarations, not the id-keyed fan-out.

import { describe, it, expect } from "vitest";
import { phaseARegistry, phaseADecisionIndex } from "./registry.a.ts";

describe("phaseADecisionIndex", () => {
  it("indexes every Phase A provided decision to its module", () => {
    expect(phaseADecisionIndex["language-name"]?.definition.id).toBe(
      "il_language_english",
    );
    expect(phaseADecisionIndex["language-code"]?.definition.id).toBe(
      "il_language_code",
    );
    expect(phaseADecisionIndex["target-script"]?.definition.id).toBe(
      "il_target_script",
    );
    expect(phaseADecisionIndex["author-name"]?.definition.id).toBe(
      "il_author_name",
    );
    expect(phaseADecisionIndex["author-email"]?.definition.id).toBe(
      "il_author_email",
    );
    expect(phaseADecisionIndex["copyright-holder"]?.definition.id).toBe(
      "il_copyright_holder",
    );
    expect(phaseADecisionIndex["language-region"]?.definition.id).toBe(
      "il_language_region",
    );
    expect(phaseADecisionIndex["language-autonym"]?.definition.id).toBe(
      "il_language_autonym",
    );
  });

  it("covers exactly the decisions the registry provides", () => {
    const provided = new Set(
      Object.values(phaseARegistry).flatMap((m) => m.provides ?? []),
    );
    for (const id of provided) {
      expect(phaseADecisionIndex[id], id).toBeDefined();
    }
    // character-inventory belongs to Phase B — absent here, by design.
    expect(phaseADecisionIndex["character-inventory"]).toBeUndefined();
    expect(Object.keys(phaseADecisionIndex)).toHaveLength(provided.size);
  });
});
