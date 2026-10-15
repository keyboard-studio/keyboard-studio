/**
 * FR-009 corpus round-trip vectors for first-class `if()` guards (spec 103).
 *
 * Every rule line below is verbatim from the keymanapp/keyboards corpus
 * (release tree, as checked out locally at scoping time); the surrounding
 * fixture (header stores, group shells, the guard's own store declarations)
 * is the minimum needed to parse the line in isolation. Keyboard names are
 * given per vector so the line can be re-derived from the corpus.
 *
 * What "round-trips byte-identically" means in this codec (the same notion
 * roundtrip.test.ts uses): the canonical emit is a fixed point —
 * emit(parse(emit(parse(source)))) === emit(parse(source)) — AND the guard
 * survives as typed IR in between. The typed assertions are the anti-cheat:
 * an opaque fragment also round-trips verbatim, so each vector additionally
 * asserts the rule is present in group.rules with the expected typed
 * context, and that the fixture produces zero `if-option-store` fragments
 * (SC-004). Where a source line is already in canonical form, the vector
 * asserts direct source === emitted line equality as well.
 *
 * Offset accounting, pinned by V1/V7: a guard produces no context
 * character, but it DOES occupy an element position. Keyman `index()`
 * offsets count context elements including guards — in V1 the `any()` is
 * element 2 (the guard is element 1) and the source offset is 2. Consumers
 * that count produced characters (context-tolerance, contributor display)
 * must skip the guard; consumers that resolve `index()` alignment must
 * count it. Both disciplines are exercised by the suites that own them;
 * this file pins the IR fact they both read.
 */

import { describe, it, expect } from "vitest";
import { parse } from "./parse.js";
import { emit } from "./emit.js";
import { OPAQUE_REASONS } from "./opaque-reasons.js";
import type { IRRule, KeyboardIR } from "@keyboard-studio/contracts";

const HEADER = `store(&VERSION) '1.0'
store(&NAME) 'guard vector fixture'
store(&TARGETS) 'any'
`;

function fixture(stores: string, groupHeader: string, rules: string): string {
  return `${HEADER}${stores}
begin Unicode > use(main)

${groupHeader}
${rules}
`;
}

function allRules(ir: KeyboardIR): IRRule[] {
  return ir.groups.flatMap((g) => g.rules);
}

function expectCleanGuardRoundTrip(text: string, kbId: string): KeyboardIR {
  const { ir, opaqueFeatures } = parse(text, kbId);
  expect(
    opaqueFeatures.filter((f) => f.feature === OPAQUE_REASONS.IF_OPTION_STORE),
  ).toEqual([]);
  expect(ir.raw.filter((f) => f.reason === OPAQUE_REASONS.IF_OPTION_STORE)).toEqual([]);
  // Fixed point: canonical emit re-parses and re-emits byte-identically.
  const emitted1 = emit(ir);
  const { ir: ir2 } = parse(emitted1, kbId);
  expect(emit(ir2)).toBe(emitted1);
  return ir;
}

// ---------------------------------------------------------------------------
// V1 — single initial guard on an option store.
// Verbatim rule from sil_ipa:
//   if(option_key = '') any(equalD) + "=" > index(equalU,2)
// ---------------------------------------------------------------------------

const V1 = fixture(
  `store(equalD) "b" "d" "g"
store(equalU) U+0253 U+0257 U+0260`,
  "group(main) using keys",
  `if(option_key = '') any(equalD) + "=" > index(equalU,2)`,
);

describe("FR-009 vectors — typed guards round-trip", () => {
  it("V1: single initial guard on an option store (sil_ipa shape)", () => {
    const ir = expectCleanGuardRoundTrip(V1, "v1-sil-ipa");
    const rules = allRules(ir);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.context).toEqual([
      { kind: "if", store: "option_key", value: "" },
      { kind: "any", storeRef: "equalD" },
      { kind: "raw", text: "+" },
      { kind: "char", value: "=" },
    ]);
    expect(rules[0]!.output).toEqual([
      { kind: "index", storeRef: "equalU", offset: 2 },
    ]);
  });

  it("V7 (offset pin): the index() offset counts the guard as element 1", () => {
    const { ir } = parse(V1, "v1-sil-ipa");
    const rule = allRules(ir)[0]!;
    const out = rule.output[0]!;
    if (out.kind !== "index") throw new Error("expected index output");
    // Element-position counting (guards included, separator excluded):
    // the element at position offset-1 among non-separator elements is the
    // any() the offset points at. A character-counting discipline would
    // put the any() at position 1 and misalign every guarded index().
    const elements = rule.context.filter(
      (el) => !(el.kind === "raw" && el.text.trim() === "+"),
    );
    expect(elements[out.offset - 1]).toEqual({ kind: "any", storeRef: "equalD" });
    expect(elements[0]!.kind).toBe("if");
    // Character discipline: the guard contributes no produced character —
    // the only character-producing context element here is the trigger.
    const charProducers = rule.context.filter(
      (el) => el.kind === "char" || el.kind === "any",
    );
    expect(charProducers.some((el) => el.kind === "if")).toBe(false);
  });

  // -------------------------------------------------------------------------
  // V2 — the two-guard &newlayer/&layer cluster (verbatim, chechen_latin).
  // V4 — a guarded rule with no keystroke separator (same cluster, the
  //      'numerals' line): the guard cluster IS the whole context.
  // Both lines live in chechen_latin's group(NewContext) in the source.
  // -------------------------------------------------------------------------

  it("V2: two-guard &newlayer/&layer cluster (chechen_latin)", () => {
    const text = fixture(
      "",
      "group(NewContext) readonly",
      `if(&newLayer = "") if(&layer = 'symbols') > context`,
    );
    const ir = expectCleanGuardRoundTrip(text, "v2-chechen");
    const rules = allRules(ir);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.context).toEqual([
      { kind: "if", store: "&newLayer", value: "" },
      { kind: "if", store: "&layer", value: "symbols" },
    ]);
    expect(rules[0]!.output).toEqual([{ kind: "context", offset: 0 }]);
    // The double-quoted empty value canonicalises to the FR-004 form.
    expect(emit(ir)).toContain("if(&newLayer = '') if(&layer = 'symbols') > context");
  });

  it("V4: guarded rule with no keystroke separator (chechen_latin)", () => {
    const text = fixture(
      "",
      "group(NewContext) readonly",
      `if(&newLayer = "") if(&layer = 'numerals') > context`,
    );
    const ir = expectCleanGuardRoundTrip(text, "v4-chechen");
    const rule = allRules(ir)[0]!;
    expect(rule.context.every((el) => el.kind === "if")).toBe(true);
    expect(rule.context).toHaveLength(2);
    expect(emit(ir)).toContain("if(&layer = 'numerals')");
  });

  // -------------------------------------------------------------------------
  // V3 — platform(...)-preceded guard (verbatim, khmer_angkor). The
  // platform head element is carried as a raw element by the codec; both
  // guards after it are typed, in source order.
  // -------------------------------------------------------------------------

  it("V3: platform-preceded two-guard cluster (khmer_angkor)", () => {
    const text = fixture(
      `store(digit) '1234567890'`,
      "group(NewContext) readonly",
      `platform('touch') if(&newLayer = "") if(&layer = 'numeric') any(digit) > context`,
    );
    const ir = expectCleanGuardRoundTrip(text, "v3-khmer");
    const rule = allRules(ir)[0]!;
    expect(rule.context).toEqual([
      { kind: "raw", text: "platform('touch')" },
      { kind: "if", store: "&newLayer", value: "" },
      { kind: "if", store: "&layer", value: "numeric" },
      { kind: "any", storeRef: "digit" },
    ]);
    expect(emit(ir)).toContain(
      "platform('touch') if(&newLayer = '') if(&layer = 'numeric') any(digit) > context",
    );
  });

  // -------------------------------------------------------------------------
  // V5 — system-store (&platform) guard (verbatim, btl_kenya). This source
  // line is already in canonical form, so it asserts direct byte identity.
  // -------------------------------------------------------------------------

  it("V5: system-store &platform guard, byte-identical line (btl_kenya)", () => {
    const line = `if(&platform = 'touch') + [T_V_Macron] > U+0076 U+0331`;
    const text = fixture("", "group(main) using keys", line);
    const ir = expectCleanGuardRoundTrip(text, "v5-btl-kenya");
    const rule = allRules(ir)[0]!;
    expect(rule.context[0]).toEqual({
      kind: "if",
      store: "&platform",
      value: "touch",
    });
    expect(emit(ir)).toContain(line);
  });

  // -------------------------------------------------------------------------
  // V6 — scale case: 24 consecutive verbatim guarded rules from
  // vietnamese_telex (the option_toneplace tone-placement block). The full
  // keyboard carries 26,128 such guards; 24 consecutive source lines pin
  // the shape at scale without importing the whole file.
  // -------------------------------------------------------------------------

  it("V6: Vietnamese tone-placement scale case (vietnamese_telex, 24 verbatim rules)", () => {
    const rules = `    if(option_toneplace = '') 'oa' + 's' > 'óa'
    if(option_toneplace = '') 'oa' + 'S' > 'óa'
    if(option_toneplace = '') 'oA' + 's' > 'óA'
    if(option_toneplace = '') 'oA' + 'S' > 'óA'
    if(option_toneplace = '') 'Oa' + 's' > 'Óa'
    if(option_toneplace = '') 'Oa' + 'S' > 'Óa'
    if(option_toneplace = '') 'OA' + 's' > 'ÓA'
    if(option_toneplace = '') 'OA' + 'S' > 'ÓA'
    if(option_toneplace = '') 'óa' + 's' > 'oas'
    if(option_toneplace = '') 'óa' + 'S' > 'oaS'
    if(option_toneplace = '') 'óA' + 's' > 'oAs'
    if(option_toneplace = '') 'óA' + 'S' > 'oAS'
    if(option_toneplace = '') 'Óa' + 's' > 'Oas'
    if(option_toneplace = '') 'Óa' + 'S' > 'OaS'
    if(option_toneplace = '') 'ÓA' + 's' > 'OAs'
    if(option_toneplace = '') 'ÓA' + 'S' > 'OAS'
    if(option_toneplace = '') 'óa' + 'f' > 'òa'
    if(option_toneplace = '') 'óa' + 'F' > 'òa'
    if(option_toneplace = '') 'óA' + 'f' > 'òA'
    if(option_toneplace = '') 'óA' + 'F' > 'òA'
    if(option_toneplace = '') 'Óa' + 'f' > 'Òa'
    if(option_toneplace = '') 'Óa' + 'F' > 'Òa'
    if(option_toneplace = '') 'ÓA' + 'f' > 'ÒA'
    if(option_toneplace = '') 'ÓA' + 'F' > 'ÒA'`;
    const text = fixture(
      `store(option_toneplace) ''`,
      "group(main) using keys",
      rules,
    );
    const ir = expectCleanGuardRoundTrip(text, "v6-vietnamese-telex");
    const typed = allRules(ir);
    expect(typed).toHaveLength(24);
    for (const rule of typed) {
      expect(rule.context[0]).toEqual({
        kind: "if",
        store: "option_toneplace",
        value: "",
      });
    }
    const emitted = emit(ir);
    expect(emitted.match(/if\(option_toneplace = ''\)/g)).toHaveLength(24);
  });
});

// ---------------------------------------------------------------------------
// FR-003 — guards the codec cannot type faithfully stay opaque.
// ---------------------------------------------------------------------------

describe("FR-003 — untypeable guards stay opaque", () => {
  function expectOpaque(ruleLine: string): void {
    const text = fixture(
      `store(equalD) "b" "d" "g"`,
      "group(main) using keys",
      ruleLine,
    );
    const { ir, opaqueFeatures } = parse(text, "fr003");
    expect(allRules(ir)).toHaveLength(0);
    expect(
      opaqueFeatures.some((f) => f.feature === OPAQUE_REASONS.IF_OPTION_STORE),
    ).toBe(true);
    expect(ir.raw.some((f) => f.reason === OPAQUE_REASONS.IF_OPTION_STORE)).toBe(true);
  }

  it("not-equal guard stays opaque (never mistyped as equality)", () => {
    expectOpaque(`if(option_key <> '') any(equalD) + "=" > index(equalD,2)`);
  });

  it("comma-form guard stays opaque", () => {
    expectOpaque(`if(option_key, '') any(equalD) + "=" > index(equalD,2)`);
  });

  it("unparseable guard head stays opaque", () => {
    expectOpaque(`if(option_key = ) any(equalD) + "=" > index(equalD,2)`);
  });

  it("post-keystroke guard stays opaque", () => {
    expectOpaque(`any(equalD) + if(option_key = '') "=" > index(equalD,2)`);
  });

  it("guard after a content element stays opaque", () => {
    expectOpaque(`any(equalD) if(option_key = '') + "=" > index(equalD,2)`);
  });

  it("store-body if() stays opaque (unchanged, spec non-goal)", () => {
    const text = `${HEADER}store(bad) if(option_key = 'x') 'a'\n\nbegin Unicode > use(main)\n\ngroup(main) using keys\n\n+ [K_A] > 'a'\n`;
    const { opaqueFeatures } = parse(text, "fr003-store");
    expect(
      opaqueFeatures.some((f) => f.feature === OPAQUE_REASONS.IF_OPTION_STORE),
    ).toBe(true);
  });
});
