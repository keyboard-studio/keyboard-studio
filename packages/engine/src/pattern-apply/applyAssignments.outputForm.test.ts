// Spec 106 US3 (FR-020 to FR-023): every output the assignments emit follows
// the keyboard-wide output form, through the seam in outputFormSeam.ts. Rule
// shapes follow the km-keyman ruling R5 (specs/106-consistent-keyboard-output/
// research.md). The production patterns are loaded from content/patterns; the
// two US3 patterns are mirrored inline so this file pins the engine's side of
// the slot contract on its own.

import { beforeAll, describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { MechanismAssignment, OutputForm, Pattern } from "@keyboard-studio/contracts";
import { makePattern } from "@keyboard-studio/contracts";
import { parse } from "../codec/index.js";
import { getById, loadPatterns } from "../pattern-library/index.js";
import { applyAssignments } from "./applyAssignments.js";
import type { OutputFormOptions } from "./outputFormSeam.js";

const REAL_CONTENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../content/patterns");

const CARON = "̌";
const GRAVE = "̀";

function inlinePattern(id: string, questions: string[], kmnFragment: string): Pattern {
  return makePattern({
    id,
    title: id,
    description: id,
    category: "desktop",
    appliesTo: [],
    questions: questions.map((q) => ({ id: q, prompt: q, answerType: "text" as const })),
    kmnFragment,
    tests: [],
    validatedForFamilies: [],
    sourceKeyboards: [],
    reviewedBy: "",
    reviewDate: "2026-10-29",
  });
}

const NFD_PATTERN = inlinePattern(
  "deadkey_single_tap_nfd",
  ["triggerKey", "deadkeyName", "baseLetters", "markChars", "accentChar"],
  "store(dk_{{deadkeyName}}_bases)  '{{baseLetters}}'\n\n" +
    "dk({{deadkeyName}}) + any(dk_{{deadkeyName}}_bases) > index(dk_{{deadkeyName}}_bases, 2) '{{markChars}}'\n" +
    "dk({{deadkeyName}}) + [{{triggerKey}}] > '{{accentChar}}'\n" +
    "dk({{deadkeyName}}) + [K_SPACE] > '{{accentChar}}'\n" +
    "+ [{{triggerKey}}] > dk({{deadkeyName}})\n",
);

const POSTFIX_PATTERN = inlinePattern(
  "postfix_compose",
  ["markName", "markKey", "markChar", "baseChars", "composedChars"],
  "store(pc_{{markName}}_bases)    '{{baseChars}}'\n" +
    "store(pc_{{markName}}_composed) '{{composedChars}}'\n\n" +
    "any(pc_{{markName}}_bases) + [{{markKey}}] > index(pc_{{markName}}_composed, 1)\n" +
    "+ [{{markKey}}] > '{{markChar}}'\n",
);

const BASE_KMN =
  "store(&VERSION) '10.0'\n" +
  "store(&NAME) 'Test'\n" +
  "begin Unicode > use(main)\n" +
  "\n" +
  "group(main) using keys\n";

const resolver = (id: string): Pattern | undefined =>
  id === NFD_PATTERN.id ? NFD_PATTERN : id === POSTFIX_PATTERN.id ? POSTFIX_PATTERN : getById(id);

function apply(assignments: MechanismAssignment[], options: OutputFormOptions) {
  const result = applyAssignments(assignments, resolver, BASE_KMN, options);
  expect(result.warnings).toEqual([]);
  return result.kmn;
}

function one(target: string, patternId: string, strategyId: string, slotValues: Record<string, string>): MechanismAssignment {
  return {
    scope: "individual",
    target,
    modality: "physical",
    mechanisms: [{ patternId, strategyId, slotValues }],
    source: "user",
  };
}

const caron = (target: string, base: string): MechanismAssignment =>
  one(target, "deadkey_single_tap", "S-02", {
    triggerKey: "K_COLON",
    deadkeyName: "3000",
    baseLetters: base,
    accentedForms: target,
    accentChar: ";",
  });

const altgr = (key: string, output: string): MechanismAssignment =>
  one(output, "modifier_as_layer_switch", "S-08", { altgrKeyList: key, altgrOutputList: output });

const swap = (target: string, rules: string): MechanismAssignment =>
  one(target, "simple_swap", "S-01", { kmnRules: rules });

const sequence = (target: string): MechanismAssignment =>
  one(target, "multi_char_sequence", "S-03", { firstLetterOut: "a", secondLetter: "j", collapsedChar: target });

/** Every emitted rule output and store item, as text, from a parse of `kmn`. */
function emittedStrings(kmn: string): string[] {
  const { ir } = parse(kmn, "test");
  const out: string[] = [];
  for (const store of ir.stores) {
    if (store.name.startsWith("&")) continue;
    for (const item of store.items) if (item.kind === "char") out.push(item.value);
  }
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      const text = rule.output.map((el) => (el.kind === "char" ? el.value : "")).join("");
      if (text !== "") out.push(text);
    }
  }
  return out;
}

const isNfd = (s: string) => s === s.normalize("NFD");
const isNfc = (s: string) => s === s.normalize("NFC");

describe("applyAssignments output form (spec 106 US3)", () => {
  beforeAll(async () => {
    await loadPatterns(REAL_CONTENT_DIR);
  });

  it("the content patterns carry exactly the fragments the seam is pinned against", () => {
    expect(getById("deadkey_single_tap_nfd")?.kmnFragment.trim()).toBe(NFD_PATTERN.kmnFragment.trim());
    expect(getById("postfix_compose")?.kmnFragment.trim()).toBe(POSTFIX_PATTERN.kmnFragment.trim());
  });

  describe("no output form recorded", () => {
    it("emits exactly what it did before the seam", () => {
      const assignments = [caron("ǎ", "a"), caron("Ǎ", "A"), altgr("[RALT K_E]", "ɛ"), swap("ǒ", "+ [K_Q] > U+01D2")];
      const withoutOptions = applyAssignments(assignments, resolver, BASE_KMN).kmn;
      expect(apply(assignments, {})).toBe(withoutOptions);
      expect(withoutOptions).toContain("store(dk_3000_output) 'ǎǍ'");
      expect(withoutOptions).toContain("+ [K_Q] > U+01D2");
    });
  });

  describe("S-02 deadkey", () => {
    const set = [caron("ǎ", "a"), caron("Ǎ", "A"), caron("ě", "e"), caron("Ě", "E")];

    it("base-plus-mark: one self-indexing store, the mark after index(..., 2), no output store (R5)", () => {
      const kmn = apply(set, { outputForm: "base-plus-mark" });
      expect(kmn).toContain("store(dk_3000_bases)  'aAeE'");
      expect(kmn).not.toContain("dk_3000_output");
      expect(kmn).toContain(`dk(3000) + any(dk_3000_bases) > index(dk_3000_bases, 2) '${CARON}'`);
      // Escapes and trigger unchanged.
      expect(kmn).toContain("dk(3000) + [K_COLON] > ';'");
      expect(kmn).toContain("dk(3000) + [K_SPACE] > ';'");
      expect(kmn).toContain("+ [K_COLON] > dk(3000)");
      expect(kmn).not.toMatch(/index\(dk_3000_bases, 1\)/);
      expect(emittedStrings(kmn).every(isNfd)).toBe(true);
    });

    it("ready-made: the parallel store pair with single characters", () => {
      const kmn = apply(set, { outputForm: "ready-made" });
      expect(kmn).toContain("store(dk_3000_bases)  'aAeE'");
      expect(kmn).toContain("store(dk_3000_output) 'ǎǍěĚ'");
      expect(emittedStrings(kmn).every(isNfc)).toBe(true);
    });

    it("ready-made recomposes a deadkey recorded in base-plus-mark shape", () => {
      const nfd = one("ǎ", "deadkey_single_tap_nfd", "S-02", {
        triggerKey: "K_COLON",
        deadkeyName: "3000",
        baseLetters: "aA",
        markChars: CARON,
        accentChar: ";",
      });
      const kmn = apply([nfd], { outputForm: "ready-made" });
      expect(kmn).toContain("store(dk_3000_output) 'ǎǍ'");
    });

    it("base-plus-mark keeps a mark-less variant in the parallel pair and gives each mark its own store", () => {
      const mixed = [
        caron("ǎ", "a"),
        one("ɛ", "deadkey_single_tap", "S-02", { triggerKey: "K_COLON", deadkeyName: "3000", baseLetters: "e", accentedForms: "ɛ", accentChar: ";" }),
        one("ç", "deadkey_single_tap", "S-02", { triggerKey: "K_COLON", deadkeyName: "3000", baseLetters: "c", accentedForms: "ç", accentChar: ";" }),
      ];
      const kmn = apply(mixed, { outputForm: "base-plus-mark" });
      expect(kmn).toContain("store(dk_3000_bases)  'e'");
      expect(kmn).toContain("store(dk_3000_output) 'ɛ'");
      expect(kmn).toContain("store(dk_3000_030C_bases) 'a'");
      expect(kmn).toContain("dk(3000) + any(dk_3000_030C_bases) > index(dk_3000_030C_bases, 2) U+030C");
      expect(kmn).toContain("store(dk_3000_0327_bases) 'c'");
      // No output store ever holds a multi-code-point item.
      const { ir } = parse(kmn, "test");
      for (const store of ir.stores) {
        for (const item of store.items) if (item.kind === "char") expect([...item.value]).toHaveLength(1);
      }
    });

    it("ready-made sends a combination with no single character as base plus mark, from its own store", () => {
      const kmn = apply(
        [one("ɛ̌", "deadkey_single_tap", "S-02", { triggerKey: "K_COLON", deadkeyName: "3000", baseLetters: "ɛ", accentedForms: `ɛ${CARON}`, accentChar: ";" })],
        { outputForm: "ready-made" },
      );
      expect(kmn).toContain(`index(dk_3000_bases, 2) '${CARON}'`);
      expect(kmn).not.toContain("dk_3000_output");
    });

    it("a deadkey recorded with a two-code-point output keeps every pair aligned, under both forms", () => {
      const withVariantMark = [
        caron("ǎ", "a"),
        one("ɛ̌", "deadkey_single_tap", "S-02", { triggerKey: "K_COLON", deadkeyName: "3000", baseLetters: "ɛ", accentedForms: `ɛ${CARON}`, accentChar: ";" }),
        caron("ě", "e"),
      ];
      const nfd = apply(withVariantMark, { outputForm: "base-plus-mark" });
      expect(nfd).toContain("store(dk_3000_bases)  'aɛe'");
      expect(nfd).toContain(`index(dk_3000_bases, 2) '${CARON}'`);
      const nfc = apply(withVariantMark, { outputForm: "ready-made" });
      expect(nfc).toContain("store(dk_3000_bases)  'ae'");
      expect(nfc).toContain("store(dk_3000_output) 'ǎě'");
      expect(nfc).toContain("store(dk_3000_030C_bases) 'ɛ'");
    });

    it("a precomposed base key gets a rule of its own", () => {
      const kmn = apply(
        [one("ế", "deadkey_single_tap", "S-02", { triggerKey: "K_COLON", deadkeyName: "3000", baseLetters: "ê", accentedForms: "ế", accentChar: ";", escapes: "double-tap" })],
        { outputForm: "base-plus-mark" },
      );
      expect(kmn).toContain("dk(3000) + U+00EA > U+0065 U+0302 U+0301");
      expect(kmn).toContain("+ [K_COLON] > dk(3000)");
      // Written out by the seam in U+ notation: a trigger may be a quote.
      expect(kmn).toContain("dk(3000) + [K_COLON] > U+003B");
      expect(kmn).not.toContain("[K_SPACE]");
    });

    it("the deadkey's first recorded escapes still apply", () => {
      const first = caron("ǎ", "a");
      first.mechanisms[0]!.slotValues!["escapes"] = "space altgr";
      const kmn = apply([first, caron("ě", "e")], { outputForm: "base-plus-mark" });
      expect(kmn).toContain("dk(3000) + [K_SPACE] > ';'");
      expect(kmn).not.toContain("dk(3000) + [K_COLON] >");
      expect(kmn.match(/\+ \[RALT K_COLON\] > U\+003B/g)).toHaveLength(1);
    });
  });

  describe("S-08 AltGr", () => {
    it("base-plus-mark moves a decomposed output to a per-key rule and keeps single characters in the store", () => {
      const kmn = apply([altgr("[RALT K_I]", "ɨ"), altgr("[RALT K_A]", "ǎ")], { outputForm: "base-plus-mark" });
      expect(kmn).toContain("store(altgrKeys)   [RALT K_I]");
      expect(kmn).toContain("store(altgrOutput) 'ɨ'");
      expect(kmn).toContain("+ [RALT K_A] > U+0061 U+030C");
      expect(emittedStrings(kmn).every(isNfd)).toBe(true);
    });

    it("drops the store pair when every output is decomposed", () => {
      const kmn = apply([altgr("[RALT K_A]", "ǎ")], { outputForm: "base-plus-mark" });
      expect(kmn).not.toContain("altgrKeys");
      expect(kmn).toContain("+ [RALT K_A] > U+0061 U+030C");
    });

    it("ready-made composes", () => {
      const kmn = apply([altgr("[RALT K_A]", `a${CARON}`)], { outputForm: "ready-made" });
      expect(kmn).toContain("store(altgrOutput) 'ǎ'");
    });
  });

  describe("S-01 key and S-03 sequence", () => {
    it("base-plus-mark decomposes a swap's output, ready-made composes it", () => {
      expect(apply([swap("ǒ", "+ [K_Q] > U+01D2")], { outputForm: "base-plus-mark" })).toContain("+ [K_Q] > U+006F U+030C");
      expect(apply([swap("ǒ", "+ [K_Q] > U+006F U+030C")], { outputForm: "ready-made" })).toContain("+ [K_Q] > U+01D2");
    });

    it("rewrites every line of a CAPS-aware rule list and leaves non-U+ outputs alone", () => {
      const kmn = apply([swap("ǒ", "+ [NCAPS K_Q] > U+01D2\n+ [CAPS K_Q] > U+01D1\n+ [K_W] > dk(x)")], { outputForm: "base-plus-mark" });
      expect(kmn).toContain("+ [NCAPS K_Q] > U+006F U+030C");
      expect(kmn).toContain("+ [CAPS K_Q] > U+004F U+030C");
      expect(kmn).toContain("+ [K_W] > dk(x)");
    });

    it("a sequence's collapsed output follows the form", () => {
      expect(apply([sequence("ǎ")], { outputForm: "base-plus-mark" })).toContain(`'a' + 'j' > 'a${CARON}'`);
      expect(apply([sequence(`a${CARON}`)], { outputForm: "ready-made" })).toContain("'a' + 'j' > 'ǎ'");
    });
  });

  describe("postfix compose (FR-022)", () => {
    const markKey = swap(GRAVE, "+ [K_5] > U+0300");
    const attachments = { [GRAVE]: ["a", "A", "e", "ɛ"] };

    it("ready-made: an allowed base then the mark key composes, the any() rule before the bare rule (R5)", () => {
      const kmn = apply([markKey], { outputForm: "ready-made", markAttachments: attachments });
      expect(kmn).toContain("store(pc_0300_bases)    'aAe'");
      expect(kmn).toContain("store(pc_0300_composed) 'àÀè'");
      const compose = kmn.indexOf("any(pc_0300_bases) + [K_5] > index(pc_0300_composed, 1)");
      const bare = kmn.indexOf(`+ [K_5] > '${GRAVE}'`);
      expect(compose).toBeGreaterThan(-1);
      expect(bare).toBeGreaterThan(compose);
      // ɛ + grave has no single character: it is left to the bare mark.
      expect(kmn).not.toContain("pc_0300_bases)    'aAeɛ'");
    });

    it("base-plus-mark keeps the bare mark key untouched", () => {
      const kmn = apply([markKey], { outputForm: "base-plus-mark", markAttachments: attachments });
      expect(kmn).toContain("+ [K_5] > U+0300");
      expect(kmn).not.toContain("pc_0300");
    });

    it("a mark with no attachment row stays a plain key", () => {
      const kmn = apply([markKey], { outputForm: "ready-made", markAttachments: {} });
      expect(kmn).toContain("+ [K_5] > U+0300");
      expect(kmn).not.toContain("pc_0300");
    });
  });

  describe("every mechanism emits one form only", () => {
    const all = (form: OutputForm) =>
      apply(
        [caron("ǎ", "a"), caron("Ǎ", "A"), altgr("[RALT K_O]", "ǒ"), swap("ě", "+ [K_Q] > U+011B"), sequence("ǔ")],
        { outputForm: form },
      );

    it("base-plus-mark: no precomposed character anywhere in the emitted outputs", () => {
      expect(emittedStrings(all("base-plus-mark")).filter((s) => !isNfd(s))).toEqual([]);
    });

    it("ready-made: no decomposable sequence anywhere in the emitted outputs", () => {
      expect(emittedStrings(all("ready-made")).filter((s) => !isNfc(s))).toEqual([]);
    });
  });
});
