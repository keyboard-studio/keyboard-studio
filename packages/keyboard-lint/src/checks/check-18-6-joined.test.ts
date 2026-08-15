/**
 * Tests for the three joined 18.6 codes (spec 063 T041).
 *
 * ONE TEST PER EXEMPTION, individually. The exemptions ARE the design of the
 * dead-key check — each corresponds to a real attested idiom for a rule-less key,
 * and a single omnibus "the exempt cases are exempt" test would let any one of
 * them rot silently while still passing. If you add an exemption, add its test
 * here in the same change.
 *
 * Inline fixtures only: this package reads no disk anywhere in `src`, and the
 * corpus canaries live in studio (see touchDiagnostics.corpus.test.ts) precisely
 * so that stays true.
 */

import { describe, expect, it } from "vitest";
import type {
  KeyboardIR,
  IRRule,
  TouchKeyIR,
  TouchLayoutIR,
} from "@keyboard-studio/contracts";
import { buildTouchKeyRuleIndex } from "@keyboard-studio/contracts";

import {
  checkTouchKeyIdCase,
  checkTouchKeyNoRule,
  checkTouchRuleOrphan,
} from "./check-18-6-touch-coverage.js";

const PATH = "source/kbd.keyman-touch-layout";

function key(id: string, extra: Partial<TouchKeyIR> = {}): TouchKeyIR {
  return { nodeId: `n_${id}_${Math.abs(hash(JSON.stringify(extra)))}`, id, ...extra };
}

/** Deterministic small hash, so nodeIds are unique without Math.random. */
function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}

function layout(keys: TouchKeyIR[], layerId = "default"): TouchLayoutIR {
  return {
    platforms: [{ id: "phone", layers: [{ id: layerId, rows: [{ keys }] }] }],
    nodeIds: [],
  };
}

/**
 * Minimal IR builder, inline rather than imported from
 * `@keyboard-studio/contracts/fixtures`: this package's tests deliberately depend
 * only on the main contracts barrel, so a fixture-subpath import here would be a
 * new dependency edge for three lines of object literal.
 */
function ir(rules: IRRule[] = [], raw: KeyboardIR["raw"] = []): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "kbd",
      name: "Kbd",
      bcp47: [],
      copyright: "",
      version: "1.0",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups: [{ nodeId: "g1", name: "Main", usingKeys: true, readonly: false, rules }],
    comments: [],
    raw,
    recognizedPatterns: [],
  };
}

function producing(keyId: string, text = "x"): IRRule {
  return {
    nodeId: `r_${keyId}`,
    context: [{ kind: "vkey", name: keyId, modifiers: [] }],
    output: [{ kind: "char", value: text }],
  };
}

function inputs(keys: TouchKeyIR[], rules: IRRule[] = [], raw: KeyboardIR["raw"] = []) {
  const keyboardIR = ir(rules, raw);
  const l = layout(keys);
  keyboardIR.touchLayout = l;
  return { ir: keyboardIR, layout: l, ruleIndex: buildTouchKeyRuleIndex(keyboardIR) };
}

const OPAQUE: KeyboardIR["raw"] = [
  { nodeId: "raw1", origin: "imported", sourceText: "store(o) 'x'", reason: "save/set/reset option-store" },
];

// ---------------------------------------------------------------------------
// KM_LINT_TOUCH_KEY_NO_RULE — the positive case first, so every exemption test
// below is demonstrably suppressing something that would otherwise fire.
// ---------------------------------------------------------------------------

describe("KM_LINT_TOUCH_KEY_NO_RULE — fires for a genuinely dead key", () => {
  it("reports a T_ key with no rule, no nextlayer, and a producing sp class", () => {
    const findings = checkTouchKeyNoRule(inputs([key("T_DEAD", { text: "ŋ" })]), PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_LINT_TOUCH_KEY_NO_RULE");
    expect(findings[0]?.severity).toBe("warning");
    expect(findings[0]?.layer).toBe("C");
    expect(findings[0]?.message).toContain("T_DEAD");
  });

  it("reports each dead id ONCE even when it appears on several layers", () => {
    const keyboardIR = ir();
    const l: TouchLayoutIR = {
      platforms: [
        {
          id: "phone",
          layers: [
            { id: "default", rows: [{ keys: [key("T_DEAD", { text: "a" })] }] },
            { id: "shift", rows: [{ keys: [key("T_DEAD", { text: "A" })] }] },
          ],
        },
      ],
      nodeIds: [],
    };
    keyboardIR.touchLayout = l;
    const findings = checkTouchKeyNoRule(
      { ir: keyboardIR, layout: l, ruleIndex: buildTouchKeyRuleIndex(keyboardIR) },
      PATH,
    );
    expect(findings).toHaveLength(1);
  });
});

describe("KM_LINT_TOUCH_KEY_NO_RULE — one test per exemption", () => {
  it("EXEMPTION nextlayer: a layer-switch key needs no rule (0x092 parity)", () => {
    expect(
      checkTouchKeyNoRule(inputs([key("T_SWITCH", { text: "abc", nextlayer: "symbol" })]), PATH),
    ).toEqual([]);
  });

  it("EXEMPTION sp class: a blank key (sp 9) is non-interactive", () => {
    expect(checkTouchKeyNoRule(inputs([key("T_X", { text: " ", sp: 9 })]), PATH)).toEqual([]);
  });

  it("EXEMPTION sp class: a spacer key (sp 10) is non-interactive", () => {
    expect(checkTouchKeyNoRule(inputs([key("T_X", { text: " ", sp: 10 })]), PATH)).toEqual([]);
  });

  it("EXEMPTION sp class: a frame key (sp 1) and an active frame key (sp 2) are not producers", () => {
    expect(checkTouchKeyNoRule(inputs([key("T_F", { text: "f", sp: 1 })]), PATH)).toEqual([]);
    expect(checkTouchKeyNoRule(inputs([key("T_F2", { text: "f", sp: 2 })]), PATH)).toEqual([]);
  });

  it("NOT EXEMPT: sp 8 is deadkey-STYLED and interactive, so a dead sp:8 key IS reported", () => {
    // The corrected enum in action. Under the old `{8,10}` spacer reading this key
    // would have been skipped — which is why the FR-012 correction had to land
    // before this check could be written correctly.
    const findings = checkTouchKeyNoRule(inputs([key("T_DK", { text: "ə", sp: 8 })]), PATH);
    expect(findings).toHaveLength(1);
  });

  it("EXEMPTION frame label: a `*`-prefixed caption is not literal output", () => {
    expect(checkTouchKeyNoRule(inputs([key("T_SHIFT", { text: "*Shift*" })]), PATH)).toEqual([]);
  });

  it("EXEMPTION sentinel ids: T_BLANK, T_SPACER, T_NUL", () => {
    for (const id of ["T_BLANK", "T_SPACER", "T_NUL"]) {
      expect(checkTouchKeyNoRule(inputs([key(id, { text: " " })]), PATH)).toEqual([]);
    }
  });

  it("EXEMPTION auto-mint prefix: Developer's T_new_*", () => {
    expect(checkTouchKeyNoRule(inputs([key("T_new_123", { text: "x" })]), PATH)).toEqual([]);
  });

  it("EXEMPTION reserved neutralization prefixes: T_removed_, T_carved_, T_touchdel_", () => {
    // Ours, written by key removal, the carve cascade, and the touch-deletion
    // overlay. A key we deliberately emptied must not be reported as a defect we
    // introduced.
    for (const id of ["T_removed_1", "T_carved_A", "T_touchdel_9"]) {
      expect(checkTouchKeyNoRule(inputs([key(id, { text: "" })]), PATH)).toEqual([]);
    }
  });

  it("EXEMPTION U_ self-output: a U_ id produces its codepoint with no rule", () => {
    expect(checkTouchKeyNoRule(inputs([key("U_00E9", { text: "é" })]), PATH)).toEqual([]);
  });

  it("EXEMPTION scope: a K_ id has a physical position and is out of scope", () => {
    expect(checkTouchKeyNoRule(inputs([key("K_A", { text: "a" })]), PATH)).toEqual([]);
  });

  it("EXEMPTION wired-not-dead: a `> nul` suppression binding counts as wired", () => {
    // `+ [T_CAM] > nul` must NOT be reported. This is the case the contract calls
    // out by name.
    const suppress: IRRule = {
      nodeId: "r_nul",
      context: [{ kind: "vkey", name: "T_CAM", modifiers: [] }],
      output: [{ kind: "raw", text: "nul" }],
    };
    expect(checkTouchKeyNoRule(inputs([key("T_CAM", { text: "c" })], [suppress]), PATH)).toEqual(
      [],
    );
  });

  it("EXEMPTION wired-not-dead: a `> context` guard binding alone counts as wired", () => {
    const guard: IRRule = {
      nodeId: "r_guard",
      context: [
        { kind: "any", storeRef: "diablock" },
        { kind: "raw", text: "+" },
        { kind: "vkey", name: "T_G", modifiers: [] },
      ],
      output: [{ kind: "raw", text: "context" }],
    };
    expect(checkTouchKeyNoRule(inputs([key("T_G", { text: "g" })], [guard]), PATH)).toEqual([]);
  });

  it("EXEMPTION wired-not-dead: a `> use(g)` transition binding alone counts as wired", () => {
    const transition: IRRule = {
      nodeId: "r_use",
      context: [{ kind: "vkey", name: "T_T", modifiers: [] }],
      output: [{ kind: "useGroup", groupName: "other" }],
    };
    expect(checkTouchKeyNoRule(inputs([key("T_T", { text: "t" })], [transition]), PATH)).toEqual(
      [],
    );
  });

  it("EXEMPTION wired-not-dead: an opaque binding alone counts as wired", () => {
    const opaque: IRRule = {
      nodeId: "r_op",
      context: [{ kind: "vkey", name: "T_O", modifiers: [] }],
      output: [{ kind: "raw", text: "if(opt='x') U+0041" }],
    };
    expect(checkTouchKeyNoRule(inputs([key("T_O", { text: "o" })], [opaque]), PATH)).toEqual([]);
  });

  it("DOWNGRADE on any opaque fragment anywhere in the IR: warning becomes hint", () => {
    // Whole-IR scope, not per-group. A fragment can hold a rule for any key, and
    // the check cannot prove otherwise.
    const findings = checkTouchKeyNoRule(inputs([key("T_DEAD", { text: "ŋ" })], [], OPAQUE), PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("hint");
    expect(findings[0]?.hint).toContain("could not read");
  });

  it("DESCENDS into sk / multitap / flick, as Developer's 0x092 does", () => {
    // walkTouchKeys (the flat iterator) would miss all three of these.
    const findings = checkTouchKeyNoRule(
      inputs([
        key("T_HOST", {
          text: "h",
          sk: [key("T_SUB", { text: "s" })],
          multitap: [key("T_MT", { text: "m" })],
          flick: { n: key("T_FL", { text: "f" }) },
        }),
      ]),
      PATH,
    );
    const ids = findings.map((f) => f.message);
    expect(findings).toHaveLength(4);
    expect(ids.some((m) => m.includes("T_SUB"))).toBe(true);
    expect(ids.some((m) => m.includes("T_MT"))).toBe(true);
    expect(ids.some((m) => m.includes("T_FL"))).toBe(true);
  });

  it("does not fire for a key that HAS a producing rule", () => {
    expect(
      checkTouchKeyNoRule(inputs([key("T_OK", { text: "o" })], [producing("T_OK", "ɔ")]), PATH),
    ).toEqual([]);
  });

  it("joins case-insensitively, so a case-mismatched rule still counts as wired", () => {
    expect(
      checkTouchKeyNoRule(
        inputs([key("T_MiXeD", { text: "m" })], [producing("T_MIXED", "m")]),
        PATH,
      ),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// KM_LINT_TOUCH_RULE_ORPHAN
// ---------------------------------------------------------------------------

describe("KM_LINT_TOUCH_RULE_ORPHAN", () => {
  it("reports a rule keyed on an id no key carries", () => {
    const findings = checkTouchRuleOrphan(
      inputs([key("K_A", { text: "a" })], [producing("T_MISSING", "z")]),
      PATH,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_LINT_TOUCH_RULE_ORPHAN");
    expect(findings[0]?.severity).toBe("warning");
  });

  it("NAMES THE NEAR-MISS and explains the U_ bypass — the finding's real payoff", () => {
    // The reduced AZERTY defect: the layout carries `U_03B1` where the rules expect
    // `T_03B1`. `U_` self-outputs before any rule runs, so the author's guard is
    // silently skipped and the keyboard appears to work.
    const findings = checkTouchRuleOrphan(
      inputs([key("U_03B1", { text: "α" })], [producing("T_03B1", "α")]),
      PATH,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("U_03B1");
    expect(findings[0]?.message).toContain("bypasses");
    expect(findings[0]?.hint).toContain("self-outputs");
  });

  it("distinguishes UNREACHABLE-LAYER from absent", () => {
    const keyboardIR = ir([producing("T_STRANDED", "א")]);
    const l: TouchLayoutIR = {
      platforms: [
        {
          id: "phone",
          layers: [
            { id: "default", rows: [{ keys: [key("K_A", { text: "a" })] }] },
            // Nothing has a nextlayer pointing here.
            { id: "stranded", rows: [{ keys: [key("T_STRANDED", { text: "א" })] }] },
          ],
        },
      ],
      nodeIds: [],
    };
    keyboardIR.touchLayout = l;
    const findings = checkTouchRuleOrphan(
      { ir: keyboardIR, layout: l, ruleIndex: buildTouchKeyRuleIndex(keyboardIR) },
      PATH,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("only on a layer nothing navigates to");
    expect(findings[0]?.hint).toContain("nextlayer");
  });

  it("reports a guard+producing PAIR as ONE finding, not two", () => {
    // They share a cause and a fix; two findings would read as two problems.
    const guard: IRRule = {
      nodeId: "r_og",
      context: [
        { kind: "any", storeRef: "diablock" },
        { kind: "raw", text: "+" },
        { kind: "vkey", name: "T_03B1", modifiers: [] },
      ],
      output: [{ kind: "raw", text: "context" }],
    };
    const findings = checkTouchRuleOrphan(
      inputs([key("U_03B1", { text: "α" })], [guard, producing("T_03B1", "α")]),
      PATH,
    );
    expect(findings).toHaveLength(1);
  });

  it("does NOT report a K_-keyed rule — a physical key always exists", () => {
    // Load-bearing: otherwise every desktop rule on a keyboard whose touch layout
    // omits that key would be reported.
    expect(
      checkTouchRuleOrphan(inputs([key("T_A", { text: "a" })], [producing("K_QUOTE", "̀")]), PATH),
    ).toEqual([]);
  });

  it("does NOT fire at all when there is no touch layout", () => {
    const keyboardIR = ir([producing("T_MISSING", "z")]);
    // touchLayout deliberately left undefined.
    expect(
      checkTouchRuleOrphan(
        {
          ir: keyboardIR,
          layout: layout([key("K_A", { text: "a" })]),
          ruleIndex: buildTouchKeyRuleIndex(keyboardIR),
        },
        PATH,
      ),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// KM_HINT_TOUCH_KEY_ID_CASE
// ---------------------------------------------------------------------------

describe("KM_HINT_TOUCH_KEY_ID_CASE", () => {
  it("reports a HINT when the layout and rule spellings differ only by case", () => {
    const findings = checkTouchKeyIdCase(
      inputs([key("T_MiXeD", { text: "m" })], [producing("T_MIXED", "m")]),
      PATH,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_HINT_TOUCH_KEY_ID_CASE");
    // HINT, not warning: nothing is broken here — kmcmplib interns
    // case-insensitively. It is latent, reportable only because Keyman
    // Developer's validator compares case-sensitively.
    expect(findings[0]?.severity).toBe("hint");
    expect(findings[0]?.message).toContain("Keyman Developer");
  });

  it("is silent when the spellings match exactly", () => {
    expect(
      checkTouchKeyIdCase(inputs([key("T_OK", { text: "o" })], [producing("T_OK", "o")]), PATH),
    ).toEqual([]);
  });

  it("is silent for a key with no rule at all (that is the dead-key check's business)", () => {
    expect(checkTouchKeyIdCase(inputs([key("T_NORULE", { text: "n" })]), PATH)).toEqual([]);
  });

  it("names every differing spelling when a file is inconsistent three ways", () => {
    const findings = checkTouchKeyIdCase(
      inputs(
        [key("T_MiXeD", { text: "m" })],
        [producing("T_MIXED", "a"), producing("t_mixed", "b")],
      ),
      PATH,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("T_MIXED");
    expect(findings[0]?.message).toContain("t_mixed");
  });
});
