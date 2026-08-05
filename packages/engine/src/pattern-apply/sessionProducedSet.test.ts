// Tests for buildSessionProducedSet — the session-aware produced-glyph set
// (base keyboard AS MODIFIED by this session's not-yet-serialized physical
// MechanismAssignments). See sessionProducedSet.ts docstring for the full
// bug context (shaped bug — diacritic-implementability).
//
// Concrete scenario throughout: "ӝ" U+04DD (Cyrillic zhe with diaeresis) =
// "ж" U+0436 + combining diaeresis U+0308.
//
// Test categories:
//   (a) EMPTY / no-physical-assignments — short-circuit path matches
//       buildProducedSet(baseIr, {excludeBackspaceCorrections:true}) directly.
//   (b) DEADKEY-BYPRODUCT (the crux) — a deadkey_single_tap assignment whose
//       double-tap trigger rule emits the BARE combining mark as a raw
//       output byproduct (never any assignment's own `target`), proving the
//       mandated emit->applyAssignments->parse->buildProducedSet route
//       captures byproducts that direct target-threading would miss.
//   (c) PARSE-FAILURE FALLBACK — buildSessionProducedSet must never throw;
//       on unparseable merged KMN it falls back to the base-only set.

import { describe, it, expect, beforeAll } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { KeyboardIR, MechanismAssignment, Pattern } from "@keyboard-studio/contracts";
import { buildProducedSet, makePattern } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { loadPatterns, getById } from "../pattern-library/index.js";
import { buildSessionProducedSet } from "./sessionProducedSet.js";

const REAL_CONTENT_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../content/patterns",
);

/** A minimal scaffolded .kmn with a begin line and an empty group(main). */
const BASE_KMN =
  "store(&VERSION) '10.0'\n" +
  "store(&NAME) 'Test'\n" +
  "store(&TARGETS) 'any'\n" +
  "begin Unicode > use(main)\n" +
  "\n" +
  "group(main) using keys\n" +
  "\n" +
  "+ [K_ZH] > 'ж'\n";

function makeBaseIr(): KeyboardIR {
  return parse(BASE_KMN, "session-produced-set-test").ir;
}

/** Minimal resolver backed by a static map. */
function makeResolver(patterns: Pattern[]): (id: string) => Pattern | undefined {
  const map = new Map(patterns.map((p) => [p.id, p]));
  return (id: string) => map.get(id);
}

// ---------------------------------------------------------------------------
// (a) EMPTY / no-physical-assignments — short-circuit path
// ---------------------------------------------------------------------------

describe("buildSessionProducedSet — empty / no-physical-assignments (short-circuit)", () => {
  const resolver = makeResolver([]);

  it("with an empty assignments array, returns the same set as buildProducedSet(baseIr, {excludeBackspaceCorrections:true})", () => {
    const baseIr = makeBaseIr();
    const expected = buildProducedSet(baseIr, { excludeBackspaceCorrections: true });
    const actual = buildSessionProducedSet(baseIr, [], resolver);
    expect(actual).toEqual(expected);
  });

  it("with only touch-modality assignments (no physical entries), still matches the base-only set", () => {
    const baseIr = makeBaseIr();
    const expected = buildProducedSet(baseIr, { excludeBackspaceCorrections: true });
    const touchOnly: MechanismAssignment[] = [
      {
        scope: "keyboard-default",
        target: "",
        modality: "touch",
        mechanisms: [{ patternId: "some_touch_pattern" }],
      },
    ];
    const actual = buildSessionProducedSet(baseIr, touchOnly, resolver);
    expect(actual).toEqual(expected);
  });

  it("the base-only set itself contains the base rule's plain output ('ж') as a sanity check on the fixture", () => {
    const baseIr = makeBaseIr();
    const actual = buildSessionProducedSet(baseIr, [], resolver);
    expect(actual.has("ж")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (b) DEADKEY-BYPRODUCT (the crux) — real deadkey_single_tap (S-02) pattern
// ---------------------------------------------------------------------------

describe("buildSessionProducedSet — deadkey double-tap byproduct (the crux bug)", () => {
  beforeAll(async () => {
    await loadPatterns(REAL_CONTENT_DIR);
  });

  /**
   * Builds a physical MechanismAssignment for the real `deadkey_single_tap`
   * pattern (content/patterns/desktop-input/deadkey-single-tap.yaml), mirroring
   * the fixture shape already proven in applyAssignments.test.ts's
   * "deadkey_single_tap (S-02) merge by triggerKey" suite.
   */
  function makeDeadkeyAssignment(
    target: string,
    slotValues: {
      triggerKey: string;
      deadkeyName: string;
      baseLetters: string;
      accentedForms: string;
      accentChar: string;
    },
  ): MechanismAssignment {
    return {
      scope: "individual",
      target,
      modality: "physical",
      mechanisms: [
        {
          patternId: "deadkey_single_tap",
          strategyId: "S-02",
          slotValues,
        },
      ],
      source: "user",
    };
  }

  it("the composed target 'ӝ' (U+04DD) is present in the session produced set", () => {
    const baseIr = makeBaseIr();
    const pattern = getById("deadkey_single_tap")!;
    const resolver = (id: string) => (id === pattern.id ? pattern : undefined);

    const assignment = makeDeadkeyAssignment("ӝ", {
      triggerKey: "K_QUOTE",
      deadkeyName: "diaeresis",
      baseLetters: "ж",
      accentedForms: "ӝ",
      accentChar: "̈",
    });

    const produced = buildSessionProducedSet(baseIr, [assignment], resolver);
    expect(produced.has("ӝ")).toBe(true);
  });

  it("the BARE combining diaeresis U+0308 double-tap byproduct is present in the session produced set — proving the emit->applyAssignments->parse->buildProducedSet route (not direct target-threading)", () => {
    const baseIr = makeBaseIr();
    const pattern = getById("deadkey_single_tap")!;
    const resolver = (id: string) => (id === pattern.id ? pattern : undefined);

    const assignment = makeDeadkeyAssignment("ӝ", {
      triggerKey: "K_QUOTE",
      deadkeyName: "diaeresis",
      baseLetters: "ж",
      accentedForms: "ӝ",
      accentChar: "̈",
    });

    const produced = buildSessionProducedSet(baseIr, [assignment], resolver);

    // U+0308 is NEVER any assignment's own `target` (the target is "ӝ") — it
    // only appears because the pattern's double-tap trigger rule
    // (`dk(diaeresis) + [K_QUOTE] > '̈'`) emits it as raw rule output. A
    // produced-set builder that threaded `assignment.target` directly instead
    // of walking real rule output would miss this entirely.
    expect(produced.has("̈")).toBe(true);
  });

  it("does NOT contain U+0308 in the BASE-ONLY set (proves the byproduct is genuinely session-introduced, not already present in the base)", () => {
    const baseIr = makeBaseIr();
    const baseOnly = buildProducedSet(baseIr, { excludeBackspaceCorrections: true });
    expect(baseOnly.has("̈")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (c) PARSE-FAILURE FALLBACK — must never throw; falls back to base-only set
// ---------------------------------------------------------------------------
//
// CONTRACT (per sessionProducedSet.ts's mandated route + the programmer's
// companion fix, landing in a parallel cycle): on an assignment whose
// substituted+injected fragment produces unparseable merged KMN,
// buildSessionProducedSet must
//   (1) never throw, and
//   (2) return buildProducedSet(baseIr, {excludeBackspaceCorrections:true})
//       (the base-only set) as a safe fallback.
//
// NOTE: at the time this test was authored, sessionProducedSet.ts has NOT
// YET landed the try/catch fallback described in its own docstring — this
// test PINS that contract ahead of / alongside that fix. If it is red right
// now, that is expected: it goes green when the programmer's fallback lands.
// ---------------------------------------------------------------------------

describe("buildSessionProducedSet — parse-failure fallback (never throws)", () => {
  /**
   * A pathological pattern whose kmnFragment, once merged into the base
   * source, contains a rule-shaped line with NO `>` at all. The codec's
   * tokenizer falls through to a "rule" token for any unrecognized,
   * non-blank line (tokenize.ts), and parse.ts's rule-line parser throws
   * "Malformed rule at line ...: ..." when it cannot split the line into a
   * context/output pair on `>`. This forces the exact failure mode
   * buildSessionProducedSet's mandated parse() step must survive.
   */
  const brokenFragmentPattern: Pattern = makePattern({
    id: "test_broken_fragment_no_arrow",
    title: "Pathological pattern with unparseable fragment",
    description: "Test fixture only — never a real content pattern.",
    category: "desktop",
    appliesTo: [],
    questions: [],
    kmnFragment: "group(main) using keys\nBOGUS_LINE_WITH_NO_ARROW_AT_ALL\n",
    tests: [],
    validatedForFamilies: [],
    sourceKeyboards: [],
    reviewedBy: "test",
    reviewDate: "2026-01-01",
  });

  const resolver = makeResolver([brokenFragmentPattern]);

  const brokenAssignment: MechanismAssignment = {
    scope: "individual",
    target: "x",
    modality: "physical",
    mechanisms: [{ patternId: brokenFragmentPattern.id }],
  };

  it("does not throw when the merged KMN is unparseable", () => {
    const baseIr = makeBaseIr();
    expect(() => buildSessionProducedSet(baseIr, [brokenAssignment], resolver)).not.toThrow();
  });

  it("falls back to the base-only produced set (buildProducedSet(baseIr, {excludeBackspaceCorrections:true})) on parse failure", () => {
    const baseIr = makeBaseIr();
    const expected = buildProducedSet(baseIr, { excludeBackspaceCorrections: true });
    const actual = buildSessionProducedSet(baseIr, [brokenAssignment], resolver);
    expect(actual).toEqual(expected);
  });
});
