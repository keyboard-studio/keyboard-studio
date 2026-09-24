// scaffoldTouchLayout tests — overflow spilling/classification, addSuccessor relatedness, and unplacedChars diagnostics.
// Split from the former single scaffoldTouchLayout.test.ts; shared builders live
// in ./scaffoldTouchLayoutHelpers.ts.

import { describe, it, expect } from "vitest";
import {
  scaffoldTouchLayout,
  scaffoldTouchLayoutWithDiagnostics,
} from "../scaffoldTouchLayout.js";
import type {
  IRRule,
  TouchLayoutIR,
  Pattern,
} from "@keyboard-studio/contracts";
import {
  freshId,
  makeMinimalIR,
  makeCharRule,
  makeGroup,
  getLayer,
} from "./scaffoldTouchLayoutHelpers.js";

describe("scaffoldTouchLayout", () => {
  describe("overflow spilling for non-slot vkeys (defect 2 fix)", () => {
    it("a character produced on a non-QWERTY-slot vkey (K_QUOTE) is not dropped — it lands on the nearest slot key's (K_L) sk[]", () => {
      const overflowChar = "ʼ"; // MODIFIER LETTER APOSTROPHE (saltillo)
      const rule = makeCharRule("K_QUOTE", [], overflowChar);
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);

      // Never dropped: the character appears somewhere in the default layer.
      const foundOnAnyKey = allKeys.some((k) => k.sk?.some((s) => s.text === overflowChar));
      expect(foundOnAnyKey).toBe(true);

      // Placed on the documented nearest-neighbor slot (K_L).
      const klKey = allKeys.find((k) => k.id === "K_L");
      expect(klKey?.sk?.some((s) => s.text === overflowChar)).toBe(true);
    });

    it("a character produced on a vkey with no known physical neighbor lands on the space bar's extras sk[] rather than being dropped", () => {
      const overflowChar = "ʔ"; // LATIN LETTER GLOTTAL STOP
      const rule = makeCharRule("K_oE2", [], overflowChar);
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const funcRow = defaultLayer.rows[3]!;
      const spaceKey = funcRow.keys.find((k) => k.id === "K_SPACE");

      expect(spaceKey?.sk?.some((s) => s.text === overflowChar)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // BUG 2 fix: an unplaced overflow character (no OVERFLOW_NEAREST_SLOT
  // neighbor) is classified before falling back to the space bar's "extras"
  // grouping — a combining mark routes to the sk[] of the vkey producing the
  // base letter it decorates, and a punctuation/symbol char routes to the
  // numeric layer, instead of both being dumped onto the space bar.
  // ---------------------------------------------------------------------------

  describe("overflow classification — marks and punctuation route off the space bar (BUG 2 fix)", () => {
    it("an unplaced combining mark attaches as a longpress option under its typical base letter's key (static fallback table), not the space bar", () => {
      const mark = "́"; // COMBINING ACUTE ACCENT — MARK_FALLBACK_VKEY maps this to K_E
      const rule = makeCharRule("K_oMark1", [], mark);
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const { layout, unplacedChars } = scaffoldTouchLayoutWithDiagnostics(ir);
      const defaultLayer = layout.platforms
        .find((p) => p.id === "phone")!
        .layers.find((l) => l.id === "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);

      const keKey = allKeys.find((k) => k.id === "K_E");
      expect(keKey?.sk?.some((s) => s.text === mark)).toBe(true);

      const funcRow = defaultLayer.rows[3]!;
      const spaceKey = funcRow.keys.find((k) => k.id === "K_SPACE");
      expect(spaceKey?.sk?.some((s) => s.text === mark) ?? false).toBe(false);
      expect(unplacedChars).not.toContain(mark);
    });

    it("an unplaced combining mark resolves via an already-known composed form in the IR (resolveDiacriticBaseVkey), not just the static fallback", () => {
      // K_QUOTE already produces the composed form "é" (base 'e' + this exact
      // mark) somewhere in the IR; the mark itself is produced, unplaced, on
      // a vkey with no compact slot and no OVERFLOW_NEAREST_SLOT neighbor.
      // resolveDiacriticBaseVkey must find "é" via decomposeGrapheme, take
      // its base 'e', and resolve K_E (the vkey that actually produces 'e')
      // — NOT K_QUOTE (which produces the composed form, not the bare 'e').
      const mark = "́"; // COMBINING ACUTE ACCENT
      const rules = [
        makeCharRule("K_E", [], "e"),
        makeCharRule("K_QUOTE", [], "é"),
        makeCharRule("K_oMark2", [], mark),
      ];
      const ir = makeMinimalIR({ groups: [makeGroup(rules)] });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);

      const keKey = allKeys.find((k) => k.id === "K_E");
      expect(keKey?.sk?.some((s) => s.text === mark)).toBe(true);
    });

    it("an unplaced punctuation character routes to the numeric layer's nearest literal key, not the space bar", () => {
      const punct = ";"; // NUMERIC_NEAREST_SLOT maps this to the "_" key
      const rule = makeCharRule("K_oPunct1", [], punct);
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const numericLayer = getLayer(result, "numeric")!;
      const allNumKeys = numericLayer.rows.flatMap((r) => r.keys);
      const underscoreKey = allNumKeys.find((k) => k.id === "U_005F");
      expect(underscoreKey?.sk?.some((s) => s.text === punct)).toBe(true);

      const defaultLayer = getLayer(result, "default")!;
      const funcRow = defaultLayer.rows[3]!;
      const spaceKey = funcRow.keys.find((k) => k.id === "K_SPACE");
      expect(spaceKey?.sk?.some((s) => s.text === punct) ?? false).toBe(false);
    });

    it("an unplaced punctuation char already rendered by the numeric layer's own literal keys needs no further placement (not spilled to the space bar)", () => {
      const punct = "#"; // already one of the numeric layer's hardcoded literals
      const rule = makeCharRule("K_oPunct2", [], punct);
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const { layout, unplacedChars } = scaffoldTouchLayoutWithDiagnostics(ir);
      expect(unplacedChars).not.toContain(punct);

      const defaultLayer = layout.platforms
        .find((p) => p.id === "phone")!
        .layers.find((l) => l.id === "default")!;
      const funcRow = defaultLayer.rows[3]!;
      const spaceKey = funcRow.keys.find((k) => k.id === "K_SPACE");
      expect(spaceKey?.sk?.some((s) => s.text === punct) ?? false).toBe(false);
    });

    it("a mark with no resolvable base (no IR composed form, absent from the static fallback table) lands on the space bar's extras — reachable there, so NOT reported in unplacedChars (reachability-based diagnostic)", () => {
      const mark = "̥"; // COMBINING RING BELOW — absent from MARK_FALLBACK_VKEY
      const rule = makeCharRule("K_oMark3", [], mark);
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const { layout, unplacedChars } = scaffoldTouchLayoutWithDiagnostics(ir);
      const defaultLayer = layout.platforms
        .find((p) => p.id === "phone")!
        .layers.find((l) => l.id === "default")!;
      const funcRow = defaultLayer.rows[3]!;
      const spaceKey = funcRow.keys.find((k) => k.id === "K_SPACE");

      // Still placed on the space bar's extras (never dropped).
      expect(spaceKey?.sk?.some((s) => s.text === mark)).toBe(true);
      // But reachable there, so the TRUE data-loss diagnostic does not flag
      // it — only a character reachable NOWHERE in the layout is unplaced.
      expect(unplacedChars).not.toContain(mark);
    });
  });

  // ---------------------------------------------------------------------------
  // BUG 3 fix: relatedness validation lives INSIDE addSuccessor, so both the
  // accurate owned-rule (store-pair) path and the kmnFragment-regex fallback
  // path reject a candidate successor that isn't actually a diacritic
  // variant of the vkey's own base letter (ASCII digits, Unicode No-category
  // fractions, and stray punctuation are rejected outright).
  // ---------------------------------------------------------------------------

  describe("addSuccessor relatedness validation (BUG 3 fix)", () => {
    it("K_E-style regression: digits/fraction/punctuation are rejected from sk[] via the accurate store-pair path, while a genuine case-variant of the vkey's own base letter (schwa/Schwa) survives", () => {
      const baseVkey = "K_E";
      const baseChar = "ə"; // this keyboard's K_E key itself produces schwa
      const bodyRuleNodeId = freshId("rule");
      const baseLetterRule = makeCharRule(baseVkey, [], baseChar);
      const bodyRule: IRRule = {
        nodeId: bodyRuleNodeId,
        context: [
          { kind: "deadkey", id: 1 } as never,
          { kind: "any", storeRef: "s_garbled_base" },
        ],
        output: [{ kind: "index", storeRef: "s_garbled_out", offset: 2 }],
      };

      const pattern: Pattern = {
        id: "test_s02_garbled",
        title: "Garbled deadkey (K_E regression)",
        description: "Reproduces the reported K_E sk = ə,Ə,3,#,¾ garbling",
        category: "desktop",
        appliesTo: [],
        strategyId: "S-02",
        origin: "recognized",
        ownedNodes: [{ nodeId: bodyRuleNodeId, kind: "rule" }],
        questions: [],
        kmnFragment: "+ [K_TILDE] > dk(x)\ndk(x) + any(s_garbled_base) > index(s_garbled_out, 2)",
        tests: [],
        validatedForFamilies: [],
        sourceKeyboards: [],
        reviewedBy: "test",
        reviewDate: "2026-07-28",
      };

      const ir = makeMinimalIR({
        groups: [makeGroup([baseLetterRule, bodyRule])],
        stores: [
          {
            nodeId: freshId("store"),
            name: "s_garbled_base",
            items: [
              { kind: "char", value: baseChar },
              { kind: "char", value: baseChar },
              { kind: "char", value: baseChar },
              { kind: "char", value: baseChar },
            ],
            isSystem: false,
          },
          {
            nodeId: freshId("store"),
            name: "s_garbled_out",
            items: [
              { kind: "char", value: "Ə" },
              { kind: "char", value: "3" },
              { kind: "char", value: "#" },
              { kind: "char", value: "¾" },
            ],
            isSystem: false,
          },
        ],
        recognizedPatterns: [pattern],
      });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const keKey = allKeys.find((k) => k.id === baseVkey)!;

      const skTexts = keKey.sk?.map((s) => s.text) ?? [];
      expect(skTexts).toContain("Ə");
      expect(skTexts).not.toContain("3");
      expect(skTexts).not.toContain("#");
      expect(skTexts).not.toContain("¾");
    });

    it("K_E-style regression via the kmnFragment fallback path: digits/fraction/punctuation leaking from an unrelated line are rejected", () => {
      const vkey = "K_E";

      const pattern: Pattern = {
        id: "test_s02_fallback_garbled",
        title: "Fallback-shape garbled deadkey",
        description: "No ownedNodes — exercises the kmnFragment-regex fallback",
        category: "desktop",
        appliesTo: [],
        strategyId: "S-02",
        origin: "recognized",
        ownedNodes: [],
        questions: [
          {
            id: "triggerKey",
            prompt: "Virtual key that triggers the deadkey state",
            answerType: "key-name",
            default: vkey,
          },
        ],
        // The real successor line for this slot, plus an UNRELATED line
        // (a different vkey's rule) that happens to mention the same
        // placeholder text on its OUTPUT side — under the old
        // "match anywhere in the line" scan this line contaminated the
        // slot's successors with '3'/'#'/'¾'; the fix requires the
        // placeholder to appear on the CONTEXT side (left of the first '>').
        kmnFragment:
          "+ [{{triggerKey}}] > 'ə'\n" + "+ [K_9] > '3' '#' '¾' {{triggerKey}}",
        tests: [],
        validatedForFamilies: [],
        sourceKeyboards: [],
        reviewedBy: "test",
        reviewDate: "2026-07-28",
      };

      const ir = makeMinimalIR({ recognizedPatterns: [pattern] });
      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const targetKey = allKeys.find((k) => k.id === vkey)!;

      const skTexts = targetKey.sk?.map((s) => s.text) ?? [];
      expect(skTexts).toContain("ə");
      expect(skTexts).not.toContain("3");
      expect(skTexts).not.toContain("#");
      expect(skTexts).not.toContain("¾");
    });

    it("kmnFragment fallback: a contaminating line whose placeholder text appears only on the OUTPUT side (not the context side) is not scanned for this slot", () => {
      const vkey = "K_E";

      const pattern: Pattern = {
        id: "test_s02_context_side_only",
        title: "Context-side-only fallback isolation",
        description: "Proves the {{slotId}} match is required on the context side, not anywhere in the line",
        category: "desktop",
        appliesTo: [],
        strategyId: "S-02",
        origin: "recognized",
        ownedNodes: [],
        questions: [
          {
            id: "triggerKey",
            prompt: "Virtual key that triggers the deadkey state",
            answerType: "key-name",
            default: vkey,
          },
        ],
        // Line 2's context ("+ [K_9]") never mentions the slot placeholder —
        // it only appears on the OUTPUT side, alongside an unrelated letter
        // ('q'). Category validation alone would not catch this (a bare
        // letter passes when the base char is unknown), so this exercises
        // the context-side-only line-scan fix specifically.
        kmnFragment:
          "+ [{{triggerKey}}] > 'ə'\n" + "+ [K_9] > 'q' {{triggerKey}}",
        tests: [],
        validatedForFamilies: [],
        sourceKeyboards: [],
        reviewedBy: "test",
        reviewDate: "2026-07-28",
      };

      const ir = makeMinimalIR({ recognizedPatterns: [pattern] });
      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const targetKey = allKeys.find((k) => k.id === vkey)!;

      const skTexts = targetKey.sk?.map((s) => s.text) ?? [];
      expect(skTexts).toContain("ə");
      expect(skTexts).not.toContain("q");
    });
  });

  // ---------------------------------------------------------------------------
  // BUG 3 FINISH — the relatedness filter that already guarded the deadkey-
  // successor path (addSuccessor / isValidSuccessorChar, above) is now also
  // applied to collectOverflowEntries' OVERFLOW_NEAREST_SLOT routing: a
  // number-row vkey (K_1..K_0, and its shift/RAlt symbol variants) must
  // never spill onto a top-row letter's sk[] — only the numeric/symbol layer
  // — even though OVERFLOW_NEAREST_SLOT lists a physical letter neighbor for
  // it. Also covers the QC follow-ups: no-silent-drops diagnostics for a
  // rejected deadkey successor, and Unicode (non-ASCII) digit rejection.
  // ---------------------------------------------------------------------------

  describe("overflow-path digit/symbol routing (BUG 3 finish)", () => {
    it("K_E regression via the overflow path: holding 'e' no longer shows the K_3 key's 3/#/¾ on its sk[]", () => {
      const rules = [
        makeCharRule("K_E", [], "e"),
        makeCharRule("K_3", [], "3"),
        makeCharRule("K_3", ["SHIFT"], "#"),
        makeCharRule("K_3", ["RALT"], "¾"),
      ];
      const ir = makeMinimalIR({ groups: [makeGroup(rules)] });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const keKey = allKeys.find((k) => k.id === "K_E")!;

      const skTexts = keKey.sk?.map((s) => s.text) ?? [];
      expect(skTexts).not.toContain("3");
      expect(skTexts).not.toContain("#");
      expect(skTexts).not.toContain("¾");
    });

    it("a number-row char (shift variant '!' from K_1) routes to the numeric layer's nearest literal key, not onto its physical letter neighbor's (K_Q) sk[]", () => {
      const rules = [
        makeCharRule("K_1", [], "1"),
        makeCharRule("K_1", ["SHIFT"], "!"),
      ];
      const ir = makeMinimalIR({ groups: [makeGroup(rules)] });

      const result = scaffoldTouchLayout(ir);

      const defaultLayer = getLayer(result, "default")!;
      const qKey = defaultLayer.rows.flatMap((r) => r.keys).find((k) => k.id === "K_Q");
      expect(qKey?.sk?.some((s) => s.text === "!") ?? false).toBe(false);

      const numericLayer = getLayer(result, "numeric")!;
      const oneKey = numericLayer.rows.flatMap((r) => r.keys).find((k) => k.text === "1");
      expect(oneKey?.sk?.some((s) => s.text === "!")).toBe(true);
    });

    it("a rejected deadkey-successor candidate that IS reachable elsewhere (a digit — the numeric layer always renders 0-9) is filtered from the letter's sk[] but NOT reported in unplacedChars", () => {
      const baseVkey = "K_E";
      const baseChar = "ə";
      const bodyRuleNodeId = freshId("rule");
      const baseLetterRule = makeCharRule(baseVkey, [], baseChar);
      const bodyRule: IRRule = {
        nodeId: bodyRuleNodeId,
        context: [
          { kind: "deadkey", id: 1 } as never,
          { kind: "any", storeRef: "s_garbled_base2" },
        ],
        output: [{ kind: "index", storeRef: "s_garbled_out2", offset: 2 }],
      };

      const pattern: Pattern = {
        id: "test_s02_garbled_diagnostics",
        title: "Garbled deadkey (rejection diagnostics)",
        description: "Same garbling regression, checked via the diagnostics channel",
        category: "desktop",
        appliesTo: [],
        strategyId: "S-02",
        origin: "recognized",
        ownedNodes: [{ nodeId: bodyRuleNodeId, kind: "rule" }],
        questions: [],
        kmnFragment: "+ [K_TILDE] > dk(x)\ndk(x) + any(s_garbled_base2) > index(s_garbled_out2, 2)",
        tests: [],
        validatedForFamilies: [],
        sourceKeyboards: [],
        reviewedBy: "test",
        reviewDate: "2026-07-28",
      };

      const ir = makeMinimalIR({
        groups: [makeGroup([baseLetterRule, bodyRule])],
        stores: [
          {
            nodeId: freshId("store"),
            name: "s_garbled_base2",
            items: [{ kind: "char", value: baseChar }],
            isSystem: false,
          },
          {
            nodeId: freshId("store"),
            name: "s_garbled_out2",
            items: [{ kind: "char", value: "3" }],
            isSystem: false,
          },
        ],
        recognizedPatterns: [pattern],
      });

      const { layout, unplacedChars } = scaffoldTouchLayoutWithDiagnostics(ir);
      const defaultLayer = layout.platforms
        .find((p) => p.id === "phone")!
        .layers.find((l) => l.id === "default")!;
      const keKey = defaultLayer.rows.flatMap((r) => r.keys).find((k) => k.id === baseVkey)!;

      // Internal filtering still holds: "3" never leaks onto K_E's own sk[].
      expect(keKey.sk?.some((s) => s.text === "3") ?? false).toBe(false);
      // But "3" is trivially reachable via the compact layout's always-present
      // numeric-layer literal key, so it is NOT a true data-loss case.
      expect(unplacedChars.some((u) => u.includes("3"))).toBe(false);
    });

    it("a rejected deadkey-successor candidate that is genuinely unreachable elsewhere (a symbol unrelated to the base letter, never assigned to any vkey) IS reported in unplacedChars", () => {
      const baseVkey = "K_E";
      const baseChar = "e";
      const symbol = "§"; // SECTION SIGN — unrelated to 'e'; not a digit, not on the numeric layer's literal/nearest-slot tables, never produced elsewhere in this IR
      const bodyRuleNodeId = freshId("rule");
      const baseLetterRule = makeCharRule(baseVkey, [], baseChar);
      const bodyRule: IRRule = {
        nodeId: bodyRuleNodeId,
        context: [
          { kind: "deadkey", id: 1 } as never,
          { kind: "any", storeRef: "s_unreachable_base" },
        ],
        output: [{ kind: "index", storeRef: "s_unreachable_out", offset: 2 }],
      };

      const pattern: Pattern = {
        id: "test_s02_genuinely_unreachable",
        title: "Rejected candidate with no home anywhere in the layout",
        description: "Locks the TRUE data-loss diagnostic: a rejected candidate not reachable via any other key/layer is still reported",
        category: "desktop",
        appliesTo: [],
        strategyId: "S-02",
        origin: "recognized",
        ownedNodes: [{ nodeId: bodyRuleNodeId, kind: "rule" }],
        questions: [],
        kmnFragment: "+ [K_TILDE] > dk(z)\ndk(z) + any(s_unreachable_base) > index(s_unreachable_out, 2)",
        tests: [],
        validatedForFamilies: [],
        sourceKeyboards: [],
        reviewedBy: "test",
        reviewDate: "2026-07-28",
      };

      const ir = makeMinimalIR({
        groups: [makeGroup([baseLetterRule, bodyRule])],
        stores: [
          {
            nodeId: freshId("store"),
            name: "s_unreachable_base",
            items: [{ kind: "char", value: baseChar }],
            isSystem: false,
          },
          {
            nodeId: freshId("store"),
            name: "s_unreachable_out",
            items: [{ kind: "char", value: symbol }],
            isSystem: false,
          },
        ],
        recognizedPatterns: [pattern],
      });

      const { layout, unplacedChars } = scaffoldTouchLayoutWithDiagnostics(ir);
      const defaultLayer = layout.platforms
        .find((p) => p.id === "phone")!
        .layers.find((l) => l.id === "default")!;
      const keKey = defaultLayer.rows.flatMap((r) => r.keys).find((k) => k.id === baseVkey)!;

      expect(keKey.sk?.some((s) => s.text === symbol) ?? false).toBe(false);
      expect(unplacedChars).toContain(symbol);
    });

    it("[QC P2] a non-ASCII (Unicode) decimal digit is rejected from a letter's sk[], not just ASCII 0-9", () => {
      const baseVkey = "K_E";
      const baseChar = "ə";
      const nonAsciiDigit = "٣"; // ARABIC-INDIC DIGIT THREE (U+0663), category Nd
      const bodyRuleNodeId = freshId("rule");
      const baseLetterRule = makeCharRule(baseVkey, [], baseChar);
      const bodyRule: IRRule = {
        nodeId: bodyRuleNodeId,
        context: [
          { kind: "deadkey", id: 1 } as never,
          { kind: "any", storeRef: "s_nonascii_base" },
        ],
        output: [{ kind: "index", storeRef: "s_nonascii_out", offset: 2 }],
      };

      const pattern: Pattern = {
        id: "test_s02_nonascii_digit",
        title: "Non-ASCII digit successor",
        description: "A Unicode decimal digit outside ASCII must still be rejected",
        category: "desktop",
        appliesTo: [],
        strategyId: "S-02",
        origin: "recognized",
        ownedNodes: [{ nodeId: bodyRuleNodeId, kind: "rule" }],
        questions: [],
        kmnFragment: "+ [K_TILDE] > dk(y)\ndk(y) + any(s_nonascii_base) > index(s_nonascii_out, 2)",
        tests: [],
        validatedForFamilies: [],
        sourceKeyboards: [],
        reviewedBy: "test",
        reviewDate: "2026-07-28",
      };

      const ir = makeMinimalIR({
        groups: [makeGroup([baseLetterRule, bodyRule])],
        stores: [
          {
            nodeId: freshId("store"),
            name: "s_nonascii_base",
            items: [{ kind: "char", value: baseChar }],
            isSystem: false,
          },
          {
            nodeId: freshId("store"),
            name: "s_nonascii_out",
            items: [{ kind: "char", value: nonAsciiDigit }],
            isSystem: false,
          },
        ],
        recognizedPatterns: [pattern],
      });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const keKey = defaultLayer.rows.flatMap((r) => r.keys).find((k) => k.id === baseVkey)!;

      const skTexts = keKey.sk?.map((s) => s.text) ?? [];
      expect(skTexts).not.toContain(nonAsciiDigit);
    });
  });

  // ---------------------------------------------------------------------------
  // P1 fix: unplaced/spilled overflow characters must be surfaced as
  // structured data (not console-only) so a UI caller (the studio's live
  // reseed preview) can render an advisory note. scaffoldTouchLayout's own
  // signature is unchanged (still returns a bare TouchLayoutIR); the new
  // sibling scaffoldTouchLayoutWithDiagnostics exposes `unplacedChars`.
  // ---------------------------------------------------------------------------

  describe("scaffoldTouchLayoutWithDiagnostics — unplacedChars structured data", () => {
    it("returns the same layout as scaffoldTouchLayout for an IR with no overflow", () => {
      const ir = makeMinimalIR();
      const plain = scaffoldTouchLayout(ir);
      const { layout, unplacedChars } = scaffoldTouchLayoutWithDiagnostics(ir);

      expect(layout).toEqual(plain);
      expect(unplacedChars).toEqual([]);
    });

    it("unplacedChars stays empty for a character spilled onto the space bar's extras sk[] — it IS reachable there, just not on its 'natural' key", () => {
      const overflowChar = "ʔ"; // LATIN LETTER GLOTTAL STOP — same fixture as the defect 2 regression above
      const rule = makeCharRule("K_oE2", [], overflowChar);
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const { layout, unplacedChars } = scaffoldTouchLayoutWithDiagnostics(ir);
      const defaultLayer = layout.platforms
        .find((p) => p.id === "phone")!
        .layers.find((l) => l.id === "default")!;
      const funcRow = defaultLayer.rows[3]!;
      const spaceKey = funcRow.keys.find((k) => k.id === "K_SPACE");

      expect(spaceKey?.sk?.some((s) => s.text === overflowChar)).toBe(true);
      expect(unplacedChars).not.toContain(overflowChar);
    });

    it("unplacedChars is empty for a character routed to a nearest-neighbor slot (not the extras grouping)", () => {
      const overflowChar = "ʼ"; // MODIFIER LETTER APOSTROPHE — routes to K_L, not extras
      const rule = makeCharRule("K_QUOTE", [], overflowChar);
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const { unplacedChars } = scaffoldTouchLayoutWithDiagnostics(ir);

      expect(unplacedChars).toEqual([]);
    });

    it("unplacedChars stays empty when a phone platform is synthesized onto an existing non-phone touchLayout and the overflow character lands on ITS space bar's extras (reachable)", () => {
      const overflowChar = "ʔ";
      const rule = makeCharRule("K_oE2", [], overflowChar);
      const existingTouchLayout: TouchLayoutIR = {
        platforms: [
          {
            id: "tablet",
            layers: [{ id: "default", rows: [{ keys: [{ nodeId: freshId("key"), id: "K_A" }] }] }],
          },
        ],
        nodeIds: [],
      };
      const ir = makeMinimalIR({ groups: [makeGroup([rule])], touchLayout: existingTouchLayout });

      const { layout, unplacedChars } = scaffoldTouchLayoutWithDiagnostics(ir);
      const phonePlatform = layout.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phonePlatform.layers.find((l) => l.id === "default")!;
      const funcRow = defaultLayer.rows[3]!;
      const spaceKey = funcRow.keys.find((k) => k.id === "K_SPACE");

      expect(spaceKey?.sk?.some((s) => s.text === overflowChar)).toBe(true);
      expect(unplacedChars).not.toContain(overflowChar);
    });
  });

  // ---------------------------------------------------------------------------
  // Provenance tagging (spec-035 T021 / research R6)
  //
  // Case A (generate-from-scratch): keys built by buildLetterKey, and the
  // sk[] deadkey-augmentation entries it attaches, are projection output and
  // must carry provenance: "physical-suggested".
  //
  // Case B (existing ir.touchLayout carried through): a carried-through key
  // with no existing provenance is tagged "base-derived" per R6 (absent
  // provenance would otherwise deserialize as "hand-set" — the never-auto-
  // clobber state — which R6 explicitly rejects for carried keys); a
  // carried-through key that already has an explicit provenance (e.g.
  // author-set "hand-set") is left untouched. Only the NEW sk[] entries
  // added by the deadkey-augmentation pass are projection output and always
  // get tagged "physical-suggested".
  //
  // Wire-format check: emitTouchLayout must never write a literal
  // "provenance" property — the IR field, when present, is carried on the
  // non-standard "p" wire key (spec-014 FR-010), never as "provenance".
  // ---------------------------------------------------------------------------
});
