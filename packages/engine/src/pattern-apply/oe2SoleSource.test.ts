// Tests for findOe2SoleSourceGlyphs / findSessionOe2SoleSourceGlyphs — the
// sole-source oe2 glyph detector. See oe2SoleSource.ts for the definition:
// a glyph fires only when its ONLY typing route is the oe2 key (K_oE2, the
// extra key beside left Shift that ANSI hardware does not have).
//
// Fixtures are built by parsing real .kmn text, so the rule shapes under
// test are the shapes the codec actually produces (bare vkey contexts,
// deadkey + vkey contexts, any()/index() fan-outs).

import { describe, it, expect } from "vitest";
import type { KeyboardIR, MechanismAssignment, Pattern, TouchLayoutIR } from "@keyboard-studio/contracts";
import { makePattern } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import {
  findOe2SoleSourceGlyphs,
  findSessionOe2SoleSourceGlyphs,
  isOe2VkeyName,
} from "./oe2SoleSource.js";

function makeIr(kmnBody: string): KeyboardIR {
  const kmn =
    "store(&VERSION) '10.0'\n" +
    "store(&NAME) 'Test'\n" +
    "store(&TARGETS) 'any'\n" +
    "begin Unicode > use(main)\n\n" +
    kmnBody;
  return parse(kmn, "oe2-test").ir;
}

function mainGroup(rules: string): string {
  return `group(main) using keys\n${rules}\n`;
}

// ---------------------------------------------------------------------------
// Sole-source: fires
// ---------------------------------------------------------------------------

describe("findOe2SoleSourceGlyphs — sole-source glyphs fire", () => {
  it("fires for a glyph placed only on K_oE2", () => {
    const ir = makeIr(mainGroup("+ [K_oE2] > '§'\n+ [K_A] > 'a'"));
    expect(findOe2SoleSourceGlyphs(ir)).toEqual(["§"]);
  });

  it("fires for a glyph on a modified layer of K_oE2 (any layer/modifier)", () => {
    const ir = makeIr(mainGroup("+ [SHIFT K_oE2] > '±'\n+ [K_A] > 'a'"));
    expect(findOe2SoleSourceGlyphs(ir)).toEqual(["±"]);
  });

  it("fires when a glyph sits on both the plain and shifted oe2 layers and nowhere else", () => {
    const ir = makeIr(mainGroup("+ [K_oE2] > '§'\n+ [SHIFT K_oE2] > '§'"));
    expect(findOe2SoleSourceGlyphs(ir)).toEqual(["§"]);
  });

  it("accepts the K_OEM_102 spelling as the same key", () => {
    expect(isOe2VkeyName("K_oE2")).toBe(true);
    expect(isOe2VkeyName("K_OE2")).toBe(true);
    expect(isOe2VkeyName("K_OEM_102")).toBe(true);
    expect(isOe2VkeyName("K_A")).toBe(false);
    expect(isOe2VkeyName("K_BKSLASH")).toBe(false);
  });

  it("fires for a deadkey sequence whose final key is K_oE2 (the sequence still needs the missing key)", () => {
    const ir = makeIr(
      "group(deadkeys) using keys\n+ [K_QUOTE] > dk(1)\n\n" +
        mainGroup("dk(1) + [K_oE2] > '§'\n+ [K_A] > 'a'"),
    );
    expect(findOe2SoleSourceGlyphs(ir)).toEqual(["§"]);
  });

  it("fires only for the oe2 slot of a store fan-out", () => {
    const ir = makeIr(
      "store(keys) [K_A] [K_oE2] [K_B]\nstore(outs) 'a' '§' 'b'\n\n" +
        mainGroup("+ any(keys) > index(outs,1)"),
    );
    expect(findOe2SoleSourceGlyphs(ir)).toEqual(["§"]);
  });

  it("returns glyphs sorted by codepoint for a stable findings order", () => {
    const ir = makeIr(mainGroup("+ [K_oE2] > '§'\n+ [SHIFT K_oE2] > '±'"));
    expect(findOe2SoleSourceGlyphs(ir)).toEqual(["§", "±"]);
  });
});

// ---------------------------------------------------------------------------
// Second route: does not fire
// ---------------------------------------------------------------------------

describe("findOe2SoleSourceGlyphs — a second route suppresses the warning", () => {
  it("does not fire when the glyph is also on another key", () => {
    const ir = makeIr(mainGroup("+ [K_oE2] > '§'\n+ [K_BKSLASH] > '§'"));
    expect(findOe2SoleSourceGlyphs(ir)).toEqual([]);
  });

  it("does not fire when the glyph is also produced through an outs() store on another key", () => {
    const ir = makeIr(
      "store(symbols) '§' '©'\n\n" +
        mainGroup("+ [K_oE2] > '§'\n+ [K_S] > outs(symbols)"),
    );
    expect(findOe2SoleSourceGlyphs(ir)).toEqual([]);
  });

  it("does not fire for a glyph with no oe2 route at all", () => {
    const ir = makeIr(mainGroup("+ [K_A] > 'a'\n+ [K_B] > 'b'"));
    expect(findOe2SoleSourceGlyphs(ir)).toEqual([]);
  });

  it("does not fire for the non-oe2 slots of a store fan-out", () => {
    const ir = makeIr(
      "store(keys) [K_A] [K_oE2] [K_B]\nstore(outs) 'a' '§' 'b'\n\n" +
        mainGroup("+ any(keys) > index(outs,1)\n+ [K_C] > '§'"),
    );
    expect(findOe2SoleSourceGlyphs(ir)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Deadkey / longpress routes count as routes
// ---------------------------------------------------------------------------

describe("findOe2SoleSourceGlyphs — deadkey and longpress routes count", () => {
  it("does not fire when the glyph is reachable by a deadkey sequence ending on another key", () => {
    const ir = makeIr(
      "group(deadkeys) using keys\n+ [K_QUOTE] > dk(1)\n\n" +
        mainGroup("+ [K_oE2] > '§'\ndk(1) + [K_A] > '§'"),
    );
    expect(findOe2SoleSourceGlyphs(ir)).toEqual([]);
  });

  it("does not fire when the glyph is on a touch longpress menu", () => {
    const ir = makeIr(mainGroup("+ [K_oE2] > '§'"));
    const touchLayout: TouchLayoutIR = {
      platforms: [
        {
          id: "phone",
          layers: [
            {
              id: "default",
              rows: [
                {
                  keys: [
                    {
                      nodeId: "tk1",
                      id: "T_s",
                      text: "s",
                      output: "s",
                      sk: [{ nodeId: "tk1-sk1", id: "T_section", text: "§", output: "§" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      nodeIds: [],
    };
    expect(findOe2SoleSourceGlyphs({ ...ir, touchLayout })).toEqual([]);
  });

  it("does not fire when the glyph is on a plain touch key", () => {
    const ir = makeIr(mainGroup("+ [K_oE2] > '§'"));
    const touchLayout: TouchLayoutIR = {
      platforms: [
        {
          id: "phone",
          layers: [
            {
              id: "default",
              rows: [{ keys: [{ nodeId: "tk1", id: "T_section", text: "§", output: "§" }] }],
            },
          ],
        },
      ],
      nodeIds: [],
    };
    expect(findOe2SoleSourceGlyphs({ ...ir, touchLayout })).toEqual([]);
  });

  it("a backspace-correction rule is not a route: it neither fires nor suppresses", () => {
    // The correction shape re-emits a glyph after Backspace; it is not a
    // way to type the glyph, so the oe2 warning still stands.
    const ir = makeIr(
      "store(typed) 'x'\n\n" +
        mainGroup("+ [K_oE2] > '§'\nany(typed) + [K_BKSP] > '§'"),
    );
    expect(findOe2SoleSourceGlyphs(ir)).toEqual(["§"]);
  });
});

// ---------------------------------------------------------------------------
// Session variant
// ---------------------------------------------------------------------------

describe("findSessionOe2SoleSourceGlyphs", () => {
  const noPatterns = (): Pattern | undefined => undefined;

  it("with no assignments, matches the base-only detector", () => {
    const ir = makeIr(mainGroup("+ [K_oE2] > '§'\n+ [K_A] > 'a'"));
    expect(findSessionOe2SoleSourceGlyphs(ir, [], noPatterns)).toEqual(["§"]);
  });

  it("sees a glyph this session placed on K_oE2", () => {
    const ir = makeIr(mainGroup("+ [K_A] > 'a'"));
    const pattern = makePattern({
      id: "test_oe2_placement",
      title: "Test placement on oe2",
      description: "Test fixture only.",
      category: "desktop",
      appliesTo: [],
      questions: [],
      kmnFragment: "group(main) using keys\n+ [K_oE2] > '§'\n",
      tests: [],
      validatedForFamilies: [],
      sourceKeyboards: [],
      reviewedBy: "test",
      reviewDate: "2026-01-01",
    });
    const assignment: MechanismAssignment = {
      scope: "individual",
      target: "§",
      modality: "physical",
      mechanisms: [{ patternId: pattern.id }],
    };
    const resolver = (id: string): Pattern | undefined =>
      id === pattern.id ? pattern : undefined;
    expect(findSessionOe2SoleSourceGlyphs(ir, [assignment], resolver)).toEqual(["§"]);
    // The pristine base alone has no oe2 glyph.
    expect(findOe2SoleSourceGlyphs(ir)).toEqual([]);
  });

  it("never throws on an unparseable merged fragment; falls back to the base-only result", () => {
    const ir = makeIr(mainGroup("+ [K_oE2] > '§'"));
    const broken = makePattern({
      id: "test_broken_fragment_no_arrow",
      title: "Pathological pattern with unparseable fragment",
      description: "Test fixture only.",
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
    const assignment: MechanismAssignment = {
      scope: "individual",
      target: "x",
      modality: "physical",
      mechanisms: [{ patternId: broken.id }],
    };
    const resolver = (id: string): Pattern | undefined =>
      id === broken.id ? broken : undefined;
    expect(() => findSessionOe2SoleSourceGlyphs(ir, [assignment], resolver)).not.toThrow();
    expect(findSessionOe2SoleSourceGlyphs(ir, [assignment], resolver)).toEqual(["§"]);
  });
});
