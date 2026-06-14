// Tests for applyAssignments — MechanismAssignment[] to .kmn injection.
// Uses the latin_deadkey_acute_single fixture from packages/contracts.

import { describe, it, expect } from "vitest";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import { latinDeadkeyAcuteSingle } from "@keyboard-studio/contracts/fixtures";
import type { Pattern } from "@keyboard-studio/contracts";
import { applyAssignments } from "./applyAssignments.js";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const VALID_SLOT_VALUES = {
  triggerKey: "K_QUOTE",
  accentChar: "́",
  baseLetters: "aeiouAEIOU",
  accentedForms: "áéíóúÁÉÍÓÚ",
  // descriptionOfAccent intentionally omitted — it is required: false
};

/** Minimal physical MechanismAssignment using the deadkey fixture. */
function makeAssignment(
  slotValues: Record<string, string> | undefined = VALID_SLOT_VALUES
): MechanismAssignment {
  return {
    scope: "keyboard-default",
    target: "",
    modality: "physical",
    mechanisms: [
      {
        patternId: latinDeadkeyAcuteSingle.id,
        ...(slotValues !== undefined ? { slotValues } : {}),
      },
    ],
  };
}

/** Minimal resolver backed by a static map. */
function makeResolver(patterns: Pattern[]): (id: string) => Pattern | undefined {
  const map = new Map(patterns.map((p) => [p.id, p]));
  return (id: string) => map.get(id);
}

/** A minimal scaffolded .kmn with a begin line (no groups). */
const BARE_KMN =
  "c Auto-generated scaffold\n" +
  "store(&VERSION) '10.0'\n" +
  "begin Unicode > use(main)\n";

// ---------------------------------------------------------------------------
// Happy path — valid slotValues
// ---------------------------------------------------------------------------

describe("applyAssignments — valid slotValues", () => {
  const resolver = makeResolver([latinDeadkeyAcuteSingle]);
  const assignment = makeAssignment();

  it("returns no warnings when all required slots are filled", () => {
    const { warnings } = applyAssignments([assignment], resolver, BARE_KMN);
    expect(warnings).toEqual([]);
  });

  it("injects the dk_bases store into the output", () => {
    const { kmn } = applyAssignments([assignment], resolver, BARE_KMN);
    expect(kmn).toContain("store(dk_bases)");
  });

  it("injects the dk_output store into the output", () => {
    const { kmn } = applyAssignments([assignment], resolver, BARE_KMN);
    expect(kmn).toContain("store(dk_output)");
  });

  it("injects substituted base letters into the dk_bases store line", () => {
    const { kmn } = applyAssignments([assignment], resolver, BARE_KMN);
    expect(kmn).toContain("'aeiouAEIOU'");
  });

  it("injects the deadkey trigger rule with the resolved key name", () => {
    const { kmn } = applyAssignments([assignment], resolver, BARE_KMN);
    expect(kmn).toContain("[K_QUOTE] > deadkey(accent)");
  });

  it("hoists store declarations before the begin line", () => {
    const { kmn } = applyAssignments([assignment], resolver, BARE_KMN);
    const storePos = kmn.indexOf("store(dk_bases)");
    const beginPos = kmn.indexOf("begin Unicode");
    expect(storePos).toBeGreaterThanOrEqual(0);
    expect(beginPos).toBeGreaterThanOrEqual(0);
    expect(storePos).toBeLessThan(beginPos);
  });

  it("appends group/rule content after the begin line", () => {
    const { kmn } = applyAssignments([assignment], resolver, BARE_KMN);
    const beginPos = kmn.indexOf("begin Unicode");
    const groupPos = kmn.indexOf("group(main) using keys");
    expect(groupPos).toBeGreaterThan(beginPos);
  });
});

// ---------------------------------------------------------------------------
// Missing required slot — fragment must be skipped
// ---------------------------------------------------------------------------

describe("applyAssignments — missing required slot", () => {
  const resolver = makeResolver([latinDeadkeyAcuteSingle]);

  it("emits a warning when a required slot is missing", () => {
    // omit triggerKey (required) and accentedForms (required)
    const assignment = makeAssignment({ accentChar: "́", baseLetters: "aeiou" });
    const { warnings } = applyAssignments([assignment], resolver, BARE_KMN);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain(latinDeadkeyAcuteSingle.id);
  });

  it("skips the fragment when a required slot is missing (no store injected)", () => {
    const assignment = makeAssignment({ accentChar: "́", baseLetters: "aeiou" });
    const { kmn } = applyAssignments([assignment], resolver, BARE_KMN);
    // No store declarations from the fragment should appear
    expect(kmn).not.toContain("store(dk_bases)");
    expect(kmn).not.toContain("store(dk_output)");
  });

  it("names the missing required slot(s) in the warning", () => {
    const assignment = makeAssignment({ accentChar: "́", baseLetters: "aeiou" });
    const { warnings } = applyAssignments([assignment], resolver, BARE_KMN);
    expect(warnings[0]).toContain("triggerKey");
  });
});

// ---------------------------------------------------------------------------
// Unknown patternId — warning + skip
// ---------------------------------------------------------------------------

describe("applyAssignments — unknown patternId", () => {
  const resolver = makeResolver([]); // empty library

  it("emits a warning for an unrecognized patternId", () => {
    const assignment: MechanismAssignment = {
      scope: "keyboard-default",
      target: "",
      modality: "physical",
      mechanisms: [{ patternId: "no_such_pattern" }],
    };
    const { warnings } = applyAssignments([assignment], resolver, BARE_KMN);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("no_such_pattern");
  });

  it("returns the unmodified kmnSource when patternId is unknown", () => {
    const assignment: MechanismAssignment = {
      scope: "keyboard-default",
      target: "",
      modality: "physical",
      mechanisms: [{ patternId: "no_such_pattern" }],
    };
    const { kmn } = applyAssignments([assignment], resolver, BARE_KMN);
    expect(kmn).toBe(BARE_KMN);
  });
});

// ---------------------------------------------------------------------------
// Touch-modality assignments are ignored
// ---------------------------------------------------------------------------

describe("applyAssignments — touch modality ignored", () => {
  const resolver = makeResolver([latinDeadkeyAcuteSingle]);

  it("does not inject anything for touch-modality assignments", () => {
    const touchAssignment: MechanismAssignment = {
      scope: "keyboard-default",
      target: "",
      modality: "touch",
      mechanisms: [
        { patternId: latinDeadkeyAcuteSingle.id, slotValues: VALID_SLOT_VALUES },
      ],
    };
    const { kmn, warnings } = applyAssignments([touchAssignment], resolver, BARE_KMN);
    expect(kmn).toBe(BARE_KMN);
    expect(warnings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Deduplication — identical refs from multiple assignments emit once
// ---------------------------------------------------------------------------

describe("applyAssignments — deduplication", () => {
  const resolver = makeResolver([latinDeadkeyAcuteSingle]);

  it("does not duplicate stores when the same ref appears in two assignments", () => {
    const a1 = makeAssignment();
    const a2 = makeAssignment(); // same patternId + slotValues
    const { kmn } = applyAssignments([a1, a2], resolver, BARE_KMN);
    // Count occurrences of dk_bases store declaration
    const count = (kmn.match(/store\(dk_bases\)/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("is idempotent when called twice on the same source", () => {
    const assignment = makeAssignment();
    const { kmn: first } = applyAssignments([assignment], resolver, BARE_KMN);
    const { kmn: second } = applyAssignments([assignment], resolver, first);
    // Store line count should not grow
    const countFirst = (first.match(/store\(dk_bases\)/g) ?? []).length;
    const countSecond = (second.match(/store\(dk_bases\)/g) ?? []).length;
    expect(countSecond).toBe(countFirst);
  });
});

// ---------------------------------------------------------------------------
// Empty assignments list — source unchanged
// ---------------------------------------------------------------------------

describe("applyAssignments — empty input", () => {
  it("returns the original kmnSource unchanged when no assignments are given", () => {
    const resolver = makeResolver([latinDeadkeyAcuteSingle]);
    const { kmn, warnings } = applyAssignments([], resolver, BARE_KMN);
    expect(kmn).toBe(BARE_KMN);
    expect(warnings).toEqual([]);
  });
});
