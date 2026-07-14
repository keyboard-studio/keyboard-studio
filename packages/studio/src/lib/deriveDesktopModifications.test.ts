// deriveDesktopModifications tests (spec 035 T010).
//
// Pins the removals produced-set-diff derivation (data-model.md Entity 2) and
// the placements filter (Phase C physical + individual assignments).

import { describe, it, expect } from "vitest";
import { makeTestIR, makeCharStore } from "@keyboard-studio/contracts/fixtures";
import type { IRGroup, IRRule, IRStore, SurveyPhaseResult, MechanismAssignment } from "@keyboard-studio/contracts";
import { deriveDesktopModifications } from "./deriveDesktopModifications.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeGroup(nodeId: string, name: string, rules: IRRule[]): IRGroup {
  return { nodeId, name, usingKeys: true, rules, readonly: false };
}

function makeVkeyRule(nodeId: string, vkey: string, output: IRRule["output"]): IRRule {
  return {
    nodeId,
    context: [{ kind: "vkey", name: vkey, modifiers: [] }],
    output,
  };
}

function makePhaseC(assignments: MechanismAssignment[]): SurveyPhaseResult {
  return { phase: "C", assignments };
}

const NO_PHASE_RESULTS: readonly SurveyPhaseResult[] = [];

// ---------------------------------------------------------------------------
// 1. Nul-filled carve slot: rule survives, only the character disappears.
// ---------------------------------------------------------------------------

describe("deriveDesktopModifications — removals", () => {
  it("a nul-filled carve slot surfaces its character in removals (rule survives)", () => {
    // Store "dkt" is an output target (referenced by index() in a rule's
    // output), so applyStoreSlotRemovals classifies it as nul-fill.
    const dkt: IRStore = makeCharStore("store#dkt", "dkt", "xy");
    const rule = makeVkeyRule("rule#0", "K_B", [
      { kind: "index", storeRef: "dkt", offset: 2 },
    ]);
    const group = makeGroup("group#main", "main", [rule]);
    const baseIr = makeTestIR([group], [dkt]);

    // Slot id "<storeNodeId>#<itemsIndex>" — carve item 0 ("x") to nul.
    const result = deriveDesktopModifications(
      baseIr,
      new Set(),
      new Set(["store#dkt#0"]),
      NO_PHASE_RESULTS,
    );

    expect(result.removals).toEqual(["x"]);
  });

  // ---------------------------------------------------------------------------
  // 2. Multi-char-rule removal: whole-rule deletion surfaces every produced char.
  // ---------------------------------------------------------------------------

  it("removing a multi-char-output rule surfaces all its produced characters", () => {
    const survivingRule = makeVkeyRule("rule#0", "K_A", [{ kind: "char", value: "a" }]);
    // A rule whose output is two unrelated (non-combining) chars — run-merge
    // NFC-normalizes "cd" to itself, so both codepoints survive independently.
    const removedRule = makeVkeyRule("rule#1", "K_D", [
      { kind: "char", value: "c" },
      { kind: "char", value: "d" },
    ]);
    const group = makeGroup("group#main", "main", [survivingRule, removedRule]);
    const baseIr = makeTestIR([group]);

    const result = deriveDesktopModifications(
      baseIr,
      new Set(["rule#1"]),
      new Set(),
      NO_PHASE_RESULTS,
    );

    expect(result.removals).toEqual(["c", "d"]);
  });

  // ---------------------------------------------------------------------------
  // 3. NFC case: an NFD-emitting rule (base + combining mark) carved -> the
  //    removal is the NFC-precomposed codepoint, per buildProducedSet's
  //    run-merge behavior.
  // ---------------------------------------------------------------------------

  it("carving an NFD-emitting (base + combining mark) rule surfaces the NFC-precomposed codepoint", () => {
    const survivingRule = makeVkeyRule("rule#0", "K_A", [{ kind: "char", value: "a" }]);
    const removedRule = makeVkeyRule("rule#1", "K_E", [
      { kind: "char", value: "e" },
      { kind: "char", value: "́" }, // combining acute
    ]);
    const group = makeGroup("group#main", "main", [survivingRule, removedRule]);
    const baseIr = makeTestIR([group]);

    const result = deriveDesktopModifications(
      baseIr,
      new Set(["rule#1"]),
      new Set(),
      NO_PHASE_RESULTS,
    );

    // NFC of "e" + U+0301 = "é" (U+00E9) — not the two raw codepoints.
    expect(result.removals).toEqual(["é"]);
  });

  // ---------------------------------------------------------------------------
  // 5. No carve edits -> empty removals.
  // ---------------------------------------------------------------------------

  it("no carve edits -> empty removals", () => {
    const rule = makeVkeyRule("rule#0", "K_A", [{ kind: "char", value: "a" }]);
    const group = makeGroup("group#main", "main", [rule]);
    const baseIr = makeTestIR([group]);

    const result = deriveDesktopModifications(baseIr, new Set(), new Set(), NO_PHASE_RESULTS);

    expect(result.removals).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Placements filter: only physical + individual entries surface, mapped to
//    a hostKey extracted the same way TouchGallery's suggestion logic does.
// ---------------------------------------------------------------------------

describe("deriveDesktopModifications — placements", () => {
  it("surfaces only physical + individual assignments, mapped to { char, hostKey }", () => {
    const baseIr = makeTestIR([makeGroup("group#main", "main", [])]);

    const physicalIndividual: MechanismAssignment = {
      scope: "individual",
      target: "é", // é
      modality: "physical",
      mechanisms: [{ patternId: "simple_swap", slotValues: { kmnRules: "+ [K_E] > 'é'" } }],
    };
    const physicalClass: MechanismAssignment = {
      scope: "character-class",
      target: "tone-vowels",
      modality: "physical",
      mechanisms: [{ patternId: "simple_swap", slotValues: { kmnRules: "+ [K_O] > 'ó'" } }],
    };
    const touchIndividual: MechanismAssignment = {
      scope: "individual",
      target: "á", // á
      modality: "touch",
      mechanisms: [{ patternId: "touch_key_replace" }],
    };
    const physicalIndividualNoHostKey: MechanismAssignment = {
      scope: "individual",
      target: "ü", // ü — unrecognized pattern, no extractable host key
      modality: "physical",
      mechanisms: [{ patternId: "unrecognized_pattern" }],
    };

    const phaseResults = [
      makePhaseC([
        physicalIndividual,
        physicalClass,
        touchIndividual,
        physicalIndividualNoHostKey,
      ]),
    ];

    const result = deriveDesktopModifications(baseIr, new Set(), new Set(), phaseResults);

    expect(result.placements).toEqual([{ char: "é", hostKey: "K_E" }]);
  });

  it("extracts host keys for the deadkey_single_tap (S-02) and modifier_as_layer_switch (S-08) shapes", () => {
    const baseIr = makeTestIR([makeGroup("group#main", "main", [])]);

    const deadkeyAssignment: MechanismAssignment = {
      scope: "individual",
      target: "à", // à
      modality: "physical",
      mechanisms: [{ patternId: "deadkey_single_tap", slotValues: { baseLetters: "a" } }],
    };
    const layerSwitchAssignment: MechanismAssignment = {
      scope: "individual",
      target: "ñ", // ñ
      modality: "physical",
      mechanisms: [
        { patternId: "modifier_as_layer_switch", slotValues: { altgrKeyList: "[RALT K_N]" } },
      ],
    };

    const phaseResults = [makePhaseC([deadkeyAssignment, layerSwitchAssignment])];

    const result = deriveDesktopModifications(baseIr, new Set(), new Set(), phaseResults);

    expect(result.placements).toEqual([
      { char: "à", hostKey: "K_A" },
      { char: "ñ", hostKey: "K_N" },
    ]);
  });

  it("extracts a host key for the multi_char_sequence (S-03) shape", () => {
    const baseIr = makeTestIR([makeGroup("group#main", "main", [])]);

    const sequenceAssignment: MechanismAssignment = {
      scope: "individual",
      target: "th",
      modality: "physical",
      mechanisms: [
        { patternId: "multi_char_sequence", slotValues: { firstLetterOut: "th" } },
      ],
    };

    const phaseResults = [makePhaseC([sequenceAssignment])];

    const result = deriveDesktopModifications(baseIr, new Set(), new Set(), phaseResults);

    expect(result.placements).toEqual([{ char: "th", hostKey: "K_T" }]);
  });
});
