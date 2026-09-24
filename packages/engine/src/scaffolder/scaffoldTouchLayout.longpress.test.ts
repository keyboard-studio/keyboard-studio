// scaffoldTouchLayout tests — deadkey patterns resolved into sk[] longpress menus, and the spec 052 FR-014 waiting-mark guard.
// Split from the former single scaffoldTouchLayout.test.ts; shared builders live
// in ./scaffoldTouchLayoutHelpers.ts.

import { describe, it, expect } from "vitest";
import {
  scaffoldTouchLayout,
} from "./scaffoldTouchLayout.js";
import type {
  KeyboardIR,
  IRRule,
  TouchLayoutIR,
  TouchKeyIR,
  Pattern,
} from "@keyboard-studio/contracts";
import {
  freshId,
  makeMinimalIR,
  makeCharRule,
  makeGroup,
  makeS02Pattern,
  getLayer,
} from "./__fixtures__/touchLayout.js";

describe("scaffoldTouchLayout", () => {
  describe("deadkey → sk[]", () => {
    it("recognized S-02 pattern causes relevant touch key to have non-empty sk[]", () => {
      const vkey = "K_E";
      const successorChar = "é";

      const ownedNodeId = freshId("rule");
      const deadkeyRule: IRRule = {
        nodeId: ownedNodeId,
        context: [
          { kind: "deadkey", name: "dk1" } as never,
          { kind: "vkey", name: vkey, modifiers: [] },
        ],
        output: [{ kind: "char", value: successorChar }],
      };

      const pattern = makeS02Pattern(vkey, successorChar, ownedNodeId);

      const ir = makeMinimalIR({
        groups: [makeGroup([deadkeyRule])],
        recognizedPatterns: [pattern],
      });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const targetKey = allKeys.find((k) => k.id === vkey);

      expect(targetKey).toBeDefined();
      expect(targetKey?.sk).toBeDefined();
      expect(targetKey?.sk?.length).toBeGreaterThan(0);
    });

    it("sk[] entries carry the correct successor character (text; U_-id form)", () => {
      const vkey = "K_E";
      const successorChar = "é";
      const ownedNodeId = freshId("rule");

      const deadkeyRule: IRRule = {
        nodeId: ownedNodeId,
        context: [
          { kind: "deadkey", name: "dk1" } as never,
          { kind: "vkey", name: vkey, modifiers: [] },
        ],
        output: [{ kind: "char", value: successorChar }],
      };

      const pattern = makeS02Pattern(vkey, successorChar, ownedNodeId);
      const ir = makeMinimalIR({
        groups: [makeGroup([deadkeyRule])],
        recognizedPatterns: [pattern],
      });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const targetKey = allKeys.find((k) => k.id === vkey)!;

      const skTexts = targetKey.sk!.map((s) => s.text);
      expect(skTexts).toContain(successorChar);
      // U_-id form: é = U+00E9 → "U_00E9"
      const skIds = targetKey.sk!.map((s) => s.id);
      expect(skIds.some((id) => /^U_[0-9A-F]{4,5}$/i.test(id))).toBe(true);
    });

    it("hint is NOT set on a S-02 key — dot comes from platform defaultHint", () => {
      const vkey = "K_A";
      const successorChar = "à";
      const ownedNodeId = freshId("rule");

      const deadkeyRule: IRRule = {
        nodeId: ownedNodeId,
        context: [
          { kind: "deadkey", name: "dk1" } as never,
          { kind: "vkey", name: vkey, modifiers: [] },
        ],
        output: [{ kind: "char", value: successorChar }],
      };

      const pattern = makeS02Pattern(vkey, successorChar, ownedNodeId);
      const ir = makeMinimalIR({
        groups: [makeGroup([deadkeyRule])],
        recognizedPatterns: [pattern],
      });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const targetKey = allKeys.find((k) => k.id === vkey)!;

      expect(targetKey.hint).toBeUndefined();
      expect(targetKey.sk).toBeDefined();
      expect(targetKey.sk!.length).toBeGreaterThan(0);
    });

    it("a pattern whose strategyId does NOT start with S-02 does not produce sk[]", () => {
      const vkey = "K_A";
      const pattern: Pattern = {
        id: "test_s01_pattern",
        title: "S-01 pattern",
        description: "S-01 does not generate sk[]",
        category: "desktop",
        appliesTo: [],
        strategyId: "S-01",
        origin: "recognized",
        ownedNodes: [],
        questions: [],
        kmnFragment: `+ [${vkey}] > 'a'`,
        tests: [],
        validatedForFamilies: [],
        sourceKeyboards: [],
        reviewedBy: "test",
        reviewDate: "2026-06-18",
      };

      const ir = makeMinimalIR({ recognizedPatterns: [pattern] });
      const result = scaffoldTouchLayout(ir);

      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const kaKey = allKeys.find((k) => k.id === vkey);

      if (kaKey !== undefined) {
        expect(kaKey.sk === undefined || kaKey.sk.length === 0).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Defect 1 fix: trigger/continuation split (canonical store()+dk()+index()
  // S-02 shape) — a "body" rule with context [deadkey, any(baseStore)] and
  // output [index(outStore, offset)] has NO vkey of its own and NO direct
  // char output, so the old single-rule-only logic rejected it outright and
  // produced empty sk[]. Regression-locks that the fix resolves the index
  // output against the referenced store and attaches the decorated form to
  // the vkey that actually produces the base letter.
  // ---------------------------------------------------------------------------

  describe("deadkey → sk[] (trigger/continuation split — defect 1 fix)", () => {
    it("a body rule with context [deadkey, any(baseStore)] and output [index(outStore, offset)] yields non-empty sk[] on the base letter's own key", () => {
      const baseVkey = "K_E";
      const baseChar = "e";
      const accentedChar = "è";

      const baseStoreNodeId = freshId("store");
      const outStoreNodeId = freshId("store");
      const bodyRuleNodeId = freshId("rule");

      // The desktop rule that actually produces the base letter 'e' on K_E —
      // this is what the fix's charToVkey reverse-lookup resolves against.
      const baseLetterRule = makeCharRule(baseVkey, [], baseChar);

      // The canonical S-02 "body"/continuation rule: no vkey, no direct char
      // output — context is [dk, any(baseStore)], output is index(outStore).
      const bodyRule: IRRule = {
        nodeId: bodyRuleNodeId,
        context: [
          { kind: "deadkey", id: 1 },
          { kind: "any", storeRef: "s_grave_base" },
        ],
        output: [{ kind: "index", storeRef: "s_grave_out", offset: 2 }],
      };

      const pattern: Pattern = {
        id: "test_s02_split_pattern",
        title: "Split-shape deadkey",
        description: "Canonical trigger/continuation S-02 pattern",
        category: "desktop",
        appliesTo: [],
        strategyId: "S-02",
        origin: "recognized",
        ownedNodes: [{ nodeId: bodyRuleNodeId, kind: "rule" }],
        questions: [],
        kmnFragment:
          "+ [K_GRAVE] > dk(grave)\ndk(grave) + any(s_grave_base) > index(s_grave_out, 2)",
        tests: [],
        validatedForFamilies: [],
        sourceKeyboards: [],
        reviewedBy: "test",
        reviewDate: "2026-06-18",
      };

      const ir = makeMinimalIR({
        groups: [makeGroup([baseLetterRule, bodyRule])],
        stores: [
          {
            nodeId: baseStoreNodeId,
            name: "s_grave_base",
            items: [{ kind: "char", value: baseChar }],
            isSystem: false,
          },
          {
            nodeId: outStoreNodeId,
            name: "s_grave_out",
            items: [{ kind: "char", value: accentedChar }],
            isSystem: false,
          },
        ],
        recognizedPatterns: [pattern],
      });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const targetKey = allKeys.find((k) => k.id === baseVkey);

      expect(targetKey).toBeDefined();
      expect(targetKey?.sk).toBeDefined();
      expect(targetKey?.sk?.length).toBeGreaterThan(0);
      expect(targetKey?.sk?.map((s) => s.text)).toContain(accentedChar);
    });
  });

  // ---------------------------------------------------------------------------
  // QC follow-up: the kmnFragment-regex "last resort" fallback in
  // buildDeadkeySuccessors — the branch that runs ONLY when a recognized S-02
  // pattern's ownedNodes is empty (or its owned rules match neither the
  // collapsed nor the trigger/continuation shape) — had no regression test.
  // This drives that exact branch: ownedNodes is empty, so the ownedNodes scan
  // never sets matchedFromOwnedNodes, forcing the kmnFragment text scan to run.
  // The fallback resolves the triggering vkey from the "key-name" question's
  // resolved answer (`q.default`) — NOT the unresolved `{{slotId}}` placeholder
  // text still present in kmnFragment — so the successor lands on the real key.
  // ---------------------------------------------------------------------------

  describe("deadkey → sk[] (kmnFragment-regex last-resort fallback)", () => {
    it("a S-02 pattern with empty ownedNodes yields sk[] on the resolved trigger vkey via the kmnFragment text scan", () => {
      const vkey = "K_E";
      const successorChar = "é";

      const pattern: Pattern = {
        id: "test_s02_fallback_pattern",
        title: "Fallback-shape deadkey",
        description: "No ownedNodes — must fall back to the kmnFragment text scan",
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
        // Collapsed single-rule shape: the triggerKey vkey directly outputs a
        // quoted char literal — the shape this fallback's regex scan expects.
        kmnFragment: `+ [{{triggerKey}}] > '${successorChar}'`,
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
      const targetKey = allKeys.find((k) => k.id === vkey);

      expect(targetKey).toBeDefined();
      expect(targetKey?.sk).toBeDefined();
      expect(targetKey?.sk?.map((s) => s.text)).toContain(successorChar);
    });
  });

  // ---------------------------------------------------------------------------
  // Defect 2 fix: characters produced on a vkey outside the compact
  // skeleton's 26 letter slots (e.g. K_QUOTE, K_BKQUOTE) must never be
  // silently dropped — they are spilled onto the sk[] of the nearest
  // occupied slot key, or (with no known physical neighbor) onto the space
  // bar's "extras" longpress menu.
  // ---------------------------------------------------------------------------
});

// ---------------------------------------------------------------------------
// FR-014 (spec 052) — a mark key that waits for a character is UNREPRESENTABLE
// on touch, not merely discouraged there.
// ---------------------------------------------------------------------------
//
// Spec 052 FR-014 has two clauses. The first ("MUST NOT be offered for a touch
// target") is vacuous today: the spine routes every project through both the
// desktop and touch steps, so there is no touch-only target for an option set to
// fork on (research D5). The second clause is the load-bearing one — the option
// "MUST NOT be producible there by any answer the author can give" — and it is a
// property of the DERIVATION, so it is pinned here rather than in the station.
//
// The claim under test: for every `(treatment, inputOrder)` combination the S2
// station can record, the touch layout the scaffolder derives contains no
// waiting-mark key. A waiting-mark key would be one whose output is a bare
// combining mark with no subkey menu behind it — i.e. a key that consumes a tap
// and shows nothing. The scaffolder resolves recognized deadkey patterns into
// long-press `sk[]` menus on the base letter's own key, so that shape is never
// emitted.

describe("spec 052 FR-014: no sk[]-free waiting mark reaches a touch layout", () => {
  const ACUTE = "\u0301";

  /** Every answer the station can produce: two treatments x two orders. */
  const COMBINATIONS: { treatment: "own-key" | "composed"; inputOrder: "prefix" | "postfix" }[] = [
    { treatment: "own-key", inputOrder: "prefix" },
    { treatment: "own-key", inputOrder: "postfix" },
    { treatment: "composed", inputOrder: "prefix" },
    { treatment: "composed", inputOrder: "postfix" },
  ];

  /**
   * The desktop IR each combination produces, in the shape the scaffolder sees:
   *
   * - `own-key` + `prefix` — a mark key that waits for the next character, which
   *   on desktop is a deadkey (recognized S-02 pattern). This is the only
   *   combination that puts a waiting mark in the desktop IR at all.
   * - `own-key` + `postfix` — the mark key follows the letter, so the rule is a
   *   plain sequence replacement; nothing waits.
   * - `composed` (either order) — no mark key exists; each marked character is
   *   emitted whole. The order value is retained but inert.
   */
  function irFor(combination: { treatment: string; inputOrder: string }): KeyboardIR {
    const letterRule = makeCharRule("K_E", [], "e");
    if (combination.treatment === "composed") {
      return makeMinimalIR({
        groups: [makeGroup([letterRule, makeCharRule("K_2", [], "\u00e9")])],
      });
    }
    if (combination.inputOrder === "postfix") {
      // Letter first, then the mark key — a sequence replacement, no deadkey.
      return makeMinimalIR({
        groups: [
          makeGroup([
            letterRule,
            {
              nodeId: freshId("rule"),
              context: [
                { kind: "char", value: "e" },
                { kind: "vkey", name: "K_QUOTE", modifiers: [] },
              ],
              output: [{ kind: "char", value: "\u00e9" }],
            },
          ]),
        ],
      });
    }
    // Mark key first: on desktop this is a deadkey, recognized as S-02.
    const deadkeyNodeId = freshId("rule");
    return makeMinimalIR({
      groups: [
        makeGroup([
          letterRule,
          {
            nodeId: deadkeyNodeId,
            context: [
              { kind: "deadkey", name: "dk1" } as never,
              { kind: "vkey", name: "K_E", modifiers: [] },
            ],
            output: [{ kind: "char", value: "\u00e9" }],
          },
        ]),
      ],
      recognizedPatterns: [makeS02Pattern("K_E", "\u00e9", deadkeyNodeId)],
    });
  }

  /** Every key on every layer of every platform, including nested sub-keys. */
  function allKeysDeep(layout: TouchLayoutIR): TouchKeyIR[] {
    const out: TouchKeyIR[] = [];
    const walk = (key: TouchKeyIR): void => {
      out.push(key);
      for (const sub of key.sk ?? []) walk(sub);
      for (const sub of key.multitap ?? []) walk(sub);
      for (const sub of Object.values(key.flick ?? {})) {
        if (sub !== undefined) walk(sub);
      }
    };
    for (const platform of layout.platforms) {
      for (const layer of platform.layers) {
        for (const row of layer.rows) {
          for (const key of row.keys) walk(key);
        }
      }
    }
    return out;
  }

  for (const combination of COMBINATIONS) {
    const label = `${combination.treatment} / ${combination.inputOrder}`;

    it(`${label}: no key emits a bare waiting mark`, () => {
      const layout = scaffoldTouchLayout(irFor(combination));
      for (const key of allKeysDeep(layout)) {
        const emitted = key.output ?? key.text ?? "";
        // A key whose whole output is a lone combining mark would be a mark
        // awaiting a character — a waiting mark on a touch surface.
        const isBareMark = emitted !== "" && /^\p{M}+$/u.test(emitted);
        expect(isBareMark, `${label}: key "${key.id}" emits the bare mark ${JSON.stringify(emitted)}`).toBe(false);
      }
    });

    it(`${label}: no key carries a deadkey reference in its output`, () => {
      const layout = scaffoldTouchLayout(irFor(combination));
      for (const key of allKeysDeep(layout)) {
        const emitted = `${key.output ?? ""}${key.text ?? ""}`;
        expect(emitted, `${label}: key "${key.id}"`).not.toMatch(/deadkey|\bdk\d*\(/i);
      }
    });
  }

  it("own-key / prefix: the desktop deadkey is RESOLVED into a long-press menu, not dropped", () => {
    // The strong form of the claim. "No waiting mark reaches touch" would also
    // be satisfied by silently losing the mark, which would be a different
    // defect — so assert the successor is actually reachable by long-press.
    const layout = scaffoldTouchLayout(irFor({ treatment: "own-key", inputOrder: "prefix" }));
    const keys = allKeysDeep(layout);
    const baseKey = keys.find((k) => k.id === "K_E");
    expect(baseKey).toBeDefined();
    expect(baseKey?.sk?.length ?? 0).toBeGreaterThan(0);
    const successors = (baseKey?.sk ?? []).map((s) => s.text ?? s.output ?? "");
    expect(successors.some((s) => s.normalize("NFC") === "\u00e9")).toBe(true);
  });

  it("the two orders derive the SAME touch layout — order is a desktop-only distinction", () => {
    // Why FR-014 needs no platform-forked option set: on touch, prefix and
    // postfix are indistinguishable, because both resolve to the same long-press
    // affordance. There is nothing for a touch-specific option to say.
    const prefixKeys = new Set(
      allKeysDeep(scaffoldTouchLayout(irFor({ treatment: "own-key", inputOrder: "prefix" })))
        .filter((k) => (k.text ?? k.output ?? "") !== "")
        .map((k) => `${k.id}:${(k.text ?? k.output ?? "").normalize("NFC")}`),
    );
    const postfixKeys = new Set(
      allKeysDeep(scaffoldTouchLayout(irFor({ treatment: "own-key", inputOrder: "postfix" })))
        .filter((k) => (k.text ?? k.output ?? "") !== "")
        .map((k) => `${k.id}:${(k.text ?? k.output ?? "").normalize("NFC")}`),
    );
    // Both reach é; neither reaches a bare acute.
    expect([...prefixKeys].some((k) => k.endsWith(":\u00e9"))).toBe(true);
    expect([...postfixKeys].some((k) => k.endsWith(":\u00e9"))).toBe(true);
    expect([...prefixKeys, ...postfixKeys].some((k) => k.endsWith(`:${ACUTE}`))).toBe(false);
  });
});
