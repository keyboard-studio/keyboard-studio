// buildReadmeFacts (spec 110): the README.md / readme.htm facts from the IR
// and the recorded answers, over the spec 102 documentation fixtures.

import { describe, expect, it } from "vitest";
import { parseKmn } from "@keyboard-studio/engine";
import { README_DESIGN_NOTE_CAP, README_TYPING_ROW_CAP, buildReadmeFacts, type ReadmeFactsInput } from "./readmeFacts.ts";
import {
  COMBINING_FIXTURE,
  DEADKEY_RIGHT_ALT_FIXTURE,
  LARGE_FIXTURE,
  NO_TOUCH_FIXTURE,
  RIGHT_ALT_FIXTURE,
  TOUCH_FIXTURE,
  type DocFixture,
} from "./docContent.fixtures.ts";

function input(f: DocFixture | null, overrides: Partial<ReadmeFactsInput> = {}): ReadmeFactsInput {
  return {
    ir: f?.ir ?? null,
    touchLayout: f?.touchLayout ?? null,
    languages: [],
    isAdaptation: false,
    startKeyboard: { displayName: "US English" },
    fallbackPolicy: "swallow",
    carveChars: new Set(),
    ...overrides,
  };
}

describe("characters", () => {
  it("lists only characters beyond printable ASCII, by group", () => {
    const facts = buildReadmeFacts(input(DEADKEY_RIGHT_ALT_FIXTURE));
    expect(facts.characterGroups).toEqual([{ kind: "letters", label: "Letters", chars: ["é", "ŋ"] }]);
  });

  it("draws a combining mark on a dotted circle", () => {
    const facts = buildReadmeFacts(input(COMBINING_FIXTURE));
    expect(facts.characterGroups[0]).toMatchObject({ kind: "marks", chars: ["◌̀", "◌́"] });
  });

  it("is empty for an ASCII-only keyboard, with no typing rows and no font note", () => {
    const facts = buildReadmeFacts(input(NO_TOUCH_FIXTURE));
    expect(facts.characterGroups).toEqual([]);
    expect(facts.typingRows).toEqual([]);
    expect(facts.needsFontNote).toBe(false);
    expect(facts.composition).toBeUndefined();
  });

  it("lists the removed characters", () => {
    expect(buildReadmeFacts(input(NO_TOUCH_FIXTURE, { carveChars: new Set(["œ", "æ"]) })).removed).toEqual(["æ", "œ"]);
  });
});

describe("typing rows", () => {
  it("shows one example per method before repeating one", () => {
    const facts = buildReadmeFacts(input(DEADKEY_RIGHT_ALT_FIXTURE));
    // One row per method (rightAlt, sequence), shown in code-point order.
    expect(facts.typingRows).toEqual([
      { keys: "' then e", output: "é" },
      { keys: "AltGr + n", output: "ŋ" },
    ]);
    expect(facts.typingRowsOmitted).toBe(false);
  });

  it("includes a touch long-press or flick example", () => {
    const facts = buildReadmeFacts(input(TOUCH_FIXTURE));
    expect(facts.typingRows.some((r) => r.keys.endsWith("(touch)"))).toBe(true);
  });

  it(`caps the examples at ${README_TYPING_ROW_CAP} and says rows were left out`, () => {
    const facts = buildReadmeFacts(input(LARGE_FIXTURE));
    expect(facts.typingRows).toHaveLength(README_TYPING_ROW_CAP);
    expect(facts.typingRowsOmitted).toBe(true);
  });

  it("adds how to type a dead key's own character, outside the cap", () => {
    const ir = parseKmn(
      [
        "store(&NAME) 'lit'",
        "begin Unicode > use(main)",
        "group(main) using keys",
        "store(acuteBase) \"e'\"",
        "store(acuteOut) U+00E9 \"'\"",
        "+ [K_QUOTE] > dk(1)",
        "dk(1) + any(acuteBase) > index(acuteOut, 2)",
        "",
      ].join("\n"),
      "lit",
    ).ir;
    const facts = buildReadmeFacts(input(null, { ir }));
    expect(facts.literalRows).toEqual([{ keys: "' then '", output: "'" }]);
  });

  it("names the space bar instead of leaving a blank keystroke", () => {
    const ir = parseKmn(
      [
        "store(&NAME) 'sp'",
        "begin Unicode > use(main)",
        "group(main) using keys",
        "store(diaBase) ' '",
        "store(diaOut) U+00A8",
        "+ [K_QUOTE] > dk(1)",
        "dk(1) + any(diaBase) > index(diaOut, 2)",
        "",
      ].join("\n"),
      "sp",
    ).ir;
    expect(buildReadmeFacts(input(null, { ir })).typingRows).toEqual([{ keys: "' then Space", output: "¨" }]);
  });

  it("invents no row for a dead key the keyboard gives no way to type", () => {
    expect(buildReadmeFacts(input(DEADKEY_RIGHT_ALT_FIXTURE)).literalRows).toEqual([]);
  });
});

describe("composition and fonts", () => {
  it("is precomposed for é, decomposed for combining marks", () => {
    expect(buildReadmeFacts(input(DEADKEY_RIGHT_ALT_FIXTURE)).composition).toBe("precomposed");
    expect(buildReadmeFacts(input(COMBINING_FIXTURE)).composition).toBe("decomposed");
  });

  it("asks for the font note only beyond Latin-1", () => {
    expect(buildReadmeFacts(input(RIGHT_ALT_FIXTURE)).needsFontNote).toBe(true);
    const latin1 = parseKmn("store(&NAME) 'l1'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ [RALT K_E] > U+00E9\n", "l1").ir;
    expect(buildReadmeFacts(input(null, { ir: latin1 })).needsFontNote).toBe(false);
  });
});

describe("language, based-on and use case", () => {
  it("puts the autonym on the primary language only", () => {
    const facts = buildReadmeFacts(
      input(null, {
        languages: [
          { tag: "ha-Latn-NG", name: "Hausa", autonym: "Harshen Hausa" },
          { tag: "ff", name: "Fulfulde", autonym: "Fulfulde" },
        ],
      }),
    );
    expect(facts.languages).toEqual([
      { tag: "ha-Latn-NG", name: "Hausa", autonym: "Harshen Hausa" },
      { tag: "ff", name: "Fulfulde" },
    ]);
  });

  it("names the copied keyboard and base layout on Track 1, nothing on Track 2", () => {
    expect(buildReadmeFacts(input(null, { layoutFamily: "azerty" })).basedOn).toEqual({ name: "US English", layoutFamily: "AZERTY" });
    expect(buildReadmeFacts(input(null, { layoutFamily: "non-roman" })).basedOn).toEqual({ name: "US English" });
    expect(buildReadmeFacts(input(null, { isAdaptation: true })).basedOn).toBeUndefined();
  });

  it("phrases literacy, messaging and official, and drops general", () => {
    expect(buildReadmeFacts(input(null, { useCase: "literacy" })).useCase).toBe("school and literacy materials");
    expect(buildReadmeFacts(input(null, { useCase: "general" })).useCase).toBeUndefined();
  });

  it("carries the inherited description on Track 2 only", () => {
    expect(buildReadmeFacts(input(null, { isAdaptation: true, fallbackDescription: "Old." })).fallbackDescription).toBe("Old.");
    expect(buildReadmeFacts(input(null, { fallbackDescription: "Old." })).fallbackDescription).toBeUndefined();
  });
});

describe("design notes", () => {
  it("records the starting point, methods, marks, touch source, removals and rationale, in that order", () => {
    const facts = buildReadmeFacts(
      input(DEADKEY_RIGHT_ALT_FIXTURE, {
        markInputOrder: "postfix",
        touchSeedSource: "reseed-from-desktop",
        carveChars: new Set(["q"]),
        designRationale: "Matches the national standard.",
      }),
    );
    expect(facts.designNotes).toEqual([
      "Started from US English.",
      "Letters: Right Alt, key sequences.",
      "Marks are typed after the letter they belong to.",
      "The touch layout was generated from the desktop layout.",
      "1 characters of US English were removed; those keys now do nothing.",
      "Matches the national standard.",
    ]);
  });

  it(`never exceeds ${README_DESIGN_NOTE_CAP} notes, and names an adaptation's starting point`, () => {
    const facts = buildReadmeFacts(input(DEADKEY_RIGHT_ALT_FIXTURE, { isAdaptation: true, startKeyboard: { displayName: "K" } }));
    expect(facts.designNotes[0]).toBe("Adapted from the previous release of this keyboard.");
    expect(facts.designNotes.length).toBeLessThanOrEqual(README_DESIGN_NOTE_CAP);
    expect(facts.designNotes.join(" ")).not.toMatch(/S-\d\d/);
  });
});
