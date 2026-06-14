// Tests for applyAssignments — MechanismAssignment[] to .kmn injection.
// Uses the latin_deadkey_acute_single fixture from packages/contracts.
//
// Test categories:
//   - Happy path: valid slotValues, correct injection
//   - P0 (km-keyman): merge-by-group-name — no duplicate group(main)
//   - P0 (km-qc): system store (&-prefixed) not hoisted
//   - P1 (km-synthesis): resolveRenderableMechanisms precedence helper
//   - Missing required slot, unknown patternId, touch modality, deduplication
//   - P2: empty kmnFragment, idempotency at group/rule level

import { describe, it, expect } from "vitest";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import { latinDeadkeyAcuteSingle } from "@keyboard-studio/contracts/fixtures";
import type { Pattern } from "@keyboard-studio/contracts";
import {
  applyAssignments,
  resolveRenderableMechanisms,
} from "./applyAssignments.js";

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

/**
 * A base .kmn that ALREADY contains group(main) using keys with a pre-existing
 * rule. This is the exact scenario km-keyman flagged: injection must MERGE into
 * the existing group, not create a duplicate.
 */
const BASE_WITH_MAIN_GROUP =
  "c Auto-generated scaffold\n" +
  "store(&VERSION) '10.0'\n" +
  "begin Unicode > use(main)\n" +
  "\n" +
  "group(main) using keys\n" +
  "\n" +
  "c Pre-existing rule\n" +
  "+ [K_A] > 'a'\n";

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

  it("places group/rule content after the begin line", () => {
    const { kmn } = applyAssignments([assignment], resolver, BARE_KMN);
    const beginPos = kmn.indexOf("begin Unicode");
    const groupPos = kmn.indexOf("group(main) using keys");
    expect(groupPos).toBeGreaterThan(beginPos);
  });
});

// ---------------------------------------------------------------------------
// P0 (km-keyman): merge-by-group-name — no duplicate group(main)
// ---------------------------------------------------------------------------

describe("applyAssignments — merge-by-group-name (km-keyman P0)", () => {
  const resolver = makeResolver([latinDeadkeyAcuteSingle]);
  const assignment = makeAssignment();

  it("group(main) using keys appears EXACTLY ONCE when base already has it", () => {
    const { kmn } = applyAssignments([assignment], resolver, BASE_WITH_MAIN_GROUP);
    const matches = kmn.match(/group\s*\(\s*main\s*\)\s*using\s*keys/gi) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("trigger rule lands INSIDE the main group body (after group header, before any next group or EOF)", () => {
    const { kmn } = applyAssignments([assignment], resolver, BASE_WITH_MAIN_GROUP);
    const groupMainPos = kmn.indexOf("group(main) using keys");
    const triggerRulePos = kmn.indexOf("+ [K_QUOTE] > deadkey(accent)");
    // The trigger rule must come AFTER the group(main) header.
    expect(triggerRulePos).toBeGreaterThan(groupMainPos);
    // The deadkeys group (from the fixture) comes after main — confirm ordering.
    const deadkeysGroupPos = kmn.indexOf("group(deadkeys)");
    if (deadkeysGroupPos !== -1) {
      expect(triggerRulePos).toBeLessThan(deadkeysGroupPos);
    }
  });

  it("match > use(deadkeys) is the last non-blank line of the main group body", () => {
    const { kmn } = applyAssignments([assignment], resolver, BASE_WITH_MAIN_GROUP);
    // Find main group span: from "group(main)" to the next "group(" or EOF.
    const mainStart = kmn.indexOf("group(main) using keys");
    expect(mainStart).toBeGreaterThanOrEqual(0);
    const nextGroupAfterMain = kmn.indexOf("\ngroup(", mainStart + 1);
    const mainBody =
      nextGroupAfterMain === -1
        ? kmn.slice(mainStart)
        : kmn.slice(mainStart, nextGroupAfterMain);
    // The last non-blank, non-comment line in mainBody must be the match directive.
    const bodyLines = mainBody.split("\n").map((l) => l.trim());
    const substantiveLines = bodyLines.filter(
      (l) => l !== "" && !l.startsWith("c ") && l !== "c" && !l.startsWith("//")
    );
    const lastLine = substantiveLines[substantiveLines.length - 1];
    expect(lastLine).toMatch(/^match\s*>\s*use\s*\(\s*deadkeys\s*\)/i);
  });

  it("pre-existing rule in base group(main) is preserved after merge", () => {
    const { kmn } = applyAssignments([assignment], resolver, BASE_WITH_MAIN_GROUP);
    expect(kmn).toContain("+ [K_A] > 'a'");
  });
});

// ---------------------------------------------------------------------------
// P0 (km-qc): system store (&-prefixed) must NOT be hoisted
// ---------------------------------------------------------------------------

describe("applyAssignments — system store misclassification (km-qc P0)", () => {
  /** A pattern with a &-prefixed system store in its fragment. */
  const patternWithSystemStore: Pattern = {
    id: "test_with_system_store",
    title: "Test pattern with system store",
    description: "Test",
    category: "desktop",
    appliesTo: [],
    questions: [
      { id: "triggerKey", prompt: "Trigger?", answerType: "key-name" },
    ],
    kmnFragment:
      "store(&VERSION) '10.0'\n" +
      "store(my_chars) '{{triggerKey}}'\n" +
      "group(main) using keys\n" +
      "+ [K_X] > 'x'\n",
    touchLayoutFragment: "",
    tests: [],
    validatedForFamilies: [],
    sourceKeyboards: [],
    reviewedBy: "test",
    reviewDate: "2026-06-14",
  };

  const resolver = makeResolver([patternWithSystemStore]);
  const assignment: MechanismAssignment = {
    scope: "keyboard-default",
    target: "",
    modality: "physical",
    mechanisms: [
      {
        patternId: patternWithSystemStore.id,
        slotValues: { triggerKey: "K_QUOTE" },
      },
    ],
  };

  it("emits a warning when a fragment contains a system store (&-prefixed)", () => {
    const { warnings } = applyAssignments([assignment], resolver, BARE_KMN);
    expect(warnings.some((w) => w.includes("system store"))).toBe(true);
  });

  it("does NOT hoist the &-prefixed store line into the output", () => {
    const { kmn } = applyAssignments([assignment], resolver, BARE_KMN);
    // The base already has store(&VERSION); the fragment's store(&VERSION)
    // should not cause a second copy to appear.
    const count = (kmn.match(/store\s*\(\s*&VERSION\s*\)/gi) ?? []).length;
    expect(count).toBe(1); // only the one already in BARE_KMN
  });

  it("still hoists the user store (non-& prefixed) from the same fragment", () => {
    const { kmn } = applyAssignments([assignment], resolver, BARE_KMN);
    expect(kmn).toContain("store(my_chars)");
    // And it must appear before begin.
    const storePos = kmn.indexOf("store(my_chars)");
    const beginPos = kmn.indexOf("begin Unicode");
    expect(storePos).toBeLessThan(beginPos);
  });
});

// ---------------------------------------------------------------------------
// Missing required slot — fragment must be skipped
// ---------------------------------------------------------------------------

describe("applyAssignments — missing required slot", () => {
  const resolver = makeResolver([latinDeadkeyAcuteSingle]);

  it("emits a warning when a required slot is missing", () => {
    const assignment = makeAssignment({ accentChar: "́", baseLetters: "aeiou" });
    const { warnings } = applyAssignments([assignment], resolver, BARE_KMN);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain(latinDeadkeyAcuteSingle.id);
  });

  it("skips the fragment when a required slot is missing (no store injected)", () => {
    const assignment = makeAssignment({ accentChar: "́", baseLetters: "aeiou" });
    const { kmn } = applyAssignments([assignment], resolver, BARE_KMN);
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
    const count = (kmn.match(/store\(dk_bases\)/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("is idempotent at the store level when called twice on the same source", () => {
    const assignment = makeAssignment();
    const { kmn: first } = applyAssignments([assignment], resolver, BARE_KMN);
    const { kmn: second } = applyAssignments([assignment], resolver, first);
    const countFirst = (first.match(/store\(dk_bases\)/g) ?? []).length;
    const countSecond = (second.match(/store\(dk_bases\)/g) ?? []).length;
    expect(countSecond).toBe(countFirst);
  });

  it("is idempotent at the group level — group(main) appears once after two calls", () => {
    const assignment = makeAssignment();
    const { kmn: first } = applyAssignments([assignment], resolver, BARE_KMN);
    const { kmn: second } = applyAssignments([assignment], resolver, first);
    const countFirst = (first.match(/group\s*\(\s*main\s*\)/gi) ?? []).length;
    const countSecond = (second.match(/group\s*\(\s*main\s*\)/gi) ?? []).length;
    expect(countSecond).toBe(countFirst);
  });

  it("is idempotent at the rule level — trigger rule appears once after two calls", () => {
    const assignment = makeAssignment();
    const { kmn: first } = applyAssignments([assignment], resolver, BARE_KMN);
    const { kmn: second } = applyAssignments([assignment], resolver, first);
    const countFirst = (first.match(/\+ \[K_QUOTE\] > deadkey\(accent\)/g) ?? []).length;
    const countSecond = (second.match(/\+ \[K_QUOTE\] > deadkey\(accent\)/g) ?? []).length;
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

// ---------------------------------------------------------------------------
// P2: empty kmnFragment — documented behavior: no injection, no error
// ---------------------------------------------------------------------------

describe("applyAssignments — empty kmnFragment", () => {
  const emptyFragmentPattern: Pattern = {
    id: "test_empty_fragment",
    title: "Pattern with empty fragment",
    description: "Test",
    category: "desktop",
    appliesTo: [],
    questions: [],
    kmnFragment: "",
    touchLayoutFragment: "",
    tests: [],
    validatedForFamilies: [],
    sourceKeyboards: [],
    reviewedBy: "test",
    reviewDate: "2026-06-14",
  };

  const resolver = makeResolver([emptyFragmentPattern]);

  it("returns original source unchanged when kmnFragment is empty", () => {
    const assignment: MechanismAssignment = {
      scope: "keyboard-default",
      target: "",
      modality: "physical",
      mechanisms: [{ patternId: emptyFragmentPattern.id }],
    };
    const { kmn, warnings } = applyAssignments([assignment], resolver, BARE_KMN);
    expect(kmn).toBe(BARE_KMN);
    expect(warnings).toEqual([]);
  });

  it("returns original source unchanged when kmnFragment is whitespace-only", () => {
    const wsPattern: Pattern = { ...emptyFragmentPattern, id: "test_ws_fragment", kmnFragment: "   \n  \n" };
    const wsResolver = makeResolver([wsPattern]);
    const assignment: MechanismAssignment = {
      scope: "keyboard-default",
      target: "",
      modality: "physical",
      mechanisms: [{ patternId: wsPattern.id }],
    };
    const { kmn, warnings } = applyAssignments([assignment], wsResolver, BARE_KMN);
    expect(kmn).toBe(BARE_KMN);
    expect(warnings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// P1 (km-synthesis): resolveRenderableMechanisms — precedence
// ---------------------------------------------------------------------------

describe("resolveRenderableMechanisms — §7.7 precedence", () => {
  it("individual scope wins over keyboard-default for the same target", () => {
    const individualRef = { patternId: "pat_individual", slotValues: { k: "v" } };
    const defaultRef = { patternId: "pat_default", slotValues: { k: "v" } };

    const assignments: MechanismAssignment[] = [
      {
        scope: "keyboard-default",
        target: "",
        modality: "physical",
        mechanisms: [defaultRef],
      },
      {
        scope: "individual",
        target: "á",
        modality: "physical",
        mechanisms: [individualRef],
      },
    ];

    // For target "á", individual wins; for "b" (no individual), default applies.
    const refs = resolveRenderableMechanisms(
      assignments,
      ["á", "b"],
      () => [],
      "physical"
    );

    const patIds = refs.map((r) => r.patternId);
    // "á" → individual ref only
    expect(patIds).toContain("pat_individual");
    // "b" → default ref
    expect(patIds).toContain("pat_default");
    // default ref must not appear for "á" (individual wins)
    // Both refs are in the deduped list — the key point is that pat_individual
    // is present (the individual winner for "á") and pat_default is present
    // (the default winner for "b"). We verify count — pat_default appears once.
    expect(patIds.filter((id) => id === "pat_default")).toHaveLength(1);
  });

  it("character-class scope wins over keyboard-default", () => {
    const classRef = { patternId: "pat_class" };
    const defaultRef = { patternId: "pat_default" };

    const assignments: MechanismAssignment[] = [
      {
        scope: "keyboard-default",
        target: "",
        modality: "physical",
        mechanisms: [defaultRef],
      },
      {
        scope: "character-class",
        target: "vowels",
        modality: "physical",
        mechanisms: [classRef],
      },
    ];

    // "é" belongs to the "vowels" class; "b" does not.
    const classesOf = (c: string) => (c === "é" ? ["vowels"] : []);
    const refs = resolveRenderableMechanisms(
      assignments,
      ["é", "b"],
      classesOf,
      "physical"
    );

    const patIds = refs.map((r) => r.patternId);
    expect(patIds).toContain("pat_class");
    expect(patIds).toContain("pat_default");
  });

  it("returns empty array when no assignments cover any inventory target", () => {
    const refs = resolveRenderableMechanisms([], ["a", "b"], () => [], "physical");
    expect(refs).toEqual([]);
  });

  it("deduplicates refs that win for multiple targets", () => {
    const sharedRef = { patternId: "shared_pat" };
    const assignments: MechanismAssignment[] = [
      {
        scope: "keyboard-default",
        target: "",
        modality: "physical",
        mechanisms: [sharedRef],
      },
    ];

    const refs = resolveRenderableMechanisms(
      assignments,
      ["a", "b", "c"],
      () => [],
      "physical"
    );
    // The same ref covers all three, but must appear only once.
    expect(refs).toHaveLength(1);
    expect(refs[0]?.patternId).toBe("shared_pat");
  });
});
