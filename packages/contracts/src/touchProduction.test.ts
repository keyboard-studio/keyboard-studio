/**
 * Spec 104 T003/T004 — the production resolver and the key-id decision table.
 *
 * One case per contracts §1 source, plus the conditional-production case the
 * whole record shape exists for (Cameroon's guarded mark: U+0300 after a
 * letter, nothing after a diablock character, in the SAME state). The
 * decision-table half is table-driven: one row per contracts §2 arm.
 */

import { describe, expect, it } from "vitest";

import { makeTestIR } from "./fixtures/keyboard-ir.js";
import { charRule, charStore, irGroup, touchKey, vkeyRule } from "./fixtures/ir-builders.js";
import type { KeyboardIR, TouchKeyIR } from "./keyboard-ir.js";
import { buildTouchKeyRuleIndex } from "./touch-key-rule-join.js";
import {
  decideKeyIdForm,
  resolveTouchProduction,
} from "./touchProduction.js";
import type {
  KeyIdFormInput,
  TouchKeyProduction,
  TouchKeyState,
} from "./touchProduction.js";

const STATE0: TouchKeyState = { modifiers: [] };
const SHIFT: TouchKeyState = { modifiers: ["SHIFT"] };
const RALT: TouchKeyState = { modifiers: ["RALT"] };
const CAPS: TouchKeyState = { modifiers: [], caps: true };
const SHIFT_CAPS: TouchKeyState = { modifiers: ["SHIFT"], caps: true };
const RALT_CAPS: TouchKeyState = { modifiers: ["RALT"], caps: true };

function resolve(ir: KeyboardIR, key: TouchKeyIR, state: TouchKeyState = STATE0): TouchKeyProduction {
  return resolveTouchProduction({ ir, ruleIndex: buildTouchKeyRuleIndex(ir) }, key, state);
}

function irWithRules(...rules: Parameters<typeof vkeyRule>[0][]): KeyboardIR {
  return makeTestIR([irGroup({ rules: rules.map((r) => vkeyRule(r)) })]);
}

// ---------------------------------------------------------------------------
// resolveTouchProduction — one case per source (contracts §1)
// ---------------------------------------------------------------------------

describe("resolveTouchProduction — source: rule", () => {
  it("T_ key with a producing rule", () => {
    const ir = irWithRules({ nodeId: "r1", vkey: "T_0300", output: "̀" });
    const p = resolve(ir, touchKey({ id: "T_0300" }));
    expect(p.source).toBe("rule");
    expect(p.productions).toEqual([{ output: { kind: "text", text: "̀" } }]);
    expect(p.contextConditional).toBe(false);
    expect(p.ruleRefs).toEqual(["r1"]);
    expect(p.fallbackCertain).toBe(true);
  });

  it("K_ key with a producing rule — the rule beats the fallback", () => {
    const ir = irWithRules({ nodeId: "r1", vkey: "K_QUOTE", output: "̀" });
    const p = resolve(ir, touchKey({ id: "K_QUOTE" }));
    expect(p.source).toBe("rule");
    expect(p.productions).toEqual([{ output: { kind: "text", text: "̀" } }]);
  });

  it("U_ key with a producing rule — the hindi_flick shape: rule output AND the decode fall-through", () => {
    // hindi_flick: `+ [U_0905] > 'ा'`. The rule governs the keystrokes it
    // matches; keystrokes no rule matches fall through to the U_ decode
    // (अ) — contracts §1: "its U_ decode is the production only for
    // keystrokes no rule matches." Both are productions of the key; the
    // decode entry is marked `viaFallback` so consumers can distinguish
    // it without string-matching its condition label.
    const ir = irWithRules({ nodeId: "r1", vkey: "U_0905", output: "ा" });
    const p = resolve(ir, touchKey({ id: "U_0905" }));
    expect(p.source).toBe("rule");
    expect(p.productions).toEqual([
      { output: { kind: "text", text: "ा" } },
      {
        output: { kind: "text", text: "अ" },
        condition: "no rule matches",
        viaFallback: true,
      },
    ]);
    // Rule-matched and unmatched keystrokes produce differently: the
    // record is genuinely context-dependent.
    expect(p.contextConditional).toBe(true);
    expect(p.fallbackCertain).toBe(true);
    expect(p.ruleRefs).toEqual(["r1"]);
  });

  it("ruled multi-segment U_ key: the fall-through entry carries the whole decoded string", () => {
    const ir = irWithRules({ nodeId: "r1", vkey: "U_0065_0301", output: "x" });
    const p = resolve(ir, touchKey({ id: "U_0065_0301" }));
    expect(p.source).toBe("rule");
    expect(p.productions).toEqual([
      { output: { kind: "text", text: "x" } },
      {
        output: { kind: "text", text: "é" },
        condition: "no rule matches",
        viaFallback: true,
      },
    ]);
  });

  it("a SHIFT-state rule does not leak into state 0", () => {
    const ir = irWithRules({ nodeId: "r1", vkey: "T_0301", modifiers: ["SHIFT"], output: "́" });
    expect(resolve(ir, touchKey({ id: "T_0301" }), STATE0).source).toBe("none");
    const shifted = resolve(ir, touchKey({ id: "T_0301" }), SHIFT);
    expect(shifted.source).toBe("rule");
    expect(shifted.productions).toEqual([{ output: { kind: "text", text: "́" } }]);
  });

  it("a deadkey-emitting rule is a production (deadkey output kind)", () => {
    const ir = makeTestIR([
      irGroup({
        rules: [
          vkeyRule({ nodeId: "r1", vkey: "T_DK", output: [{ kind: "namedDeadkey", name: "tone" }] }),
        ],
      }),
    ]);
    const p = resolve(ir, touchKey({ id: "T_DK" }));
    expect(p.source).toBe("rule");
    expect(p.productions).toEqual([{ output: { kind: "deadkey", name: "tone" } }]);
  });
});

describe("resolveTouchProduction — conditional productions (the Cameroon guard pair)", () => {
  function guardedMarkIR(): KeyboardIR {
    return makeTestIR(
      [
        irGroup({
          rules: [
            charRule({
              nodeId: "r-guard",
              context: [
                { kind: "any", storeRef: "diablock" },
                { kind: "vkey", name: "T_0300", modifiers: [] },
              ],
              output: [{ kind: "context", offset: 0 }],
            }),
            vkeyRule({ nodeId: "r-bare", vkey: "T_0300", output: "̀" }),
          ],
        }),
      ],
      [charStore({ name: "diablock", chars: " 0123456789" })],
    );
  }

  it("guard + bare rule ⇒ contextConditional, with a none carve-out naming the guard store", () => {
    const p = resolve(guardedMarkIR(), touchKey({ id: "T_0300" }));
    expect(p.source).toBe("rule");
    expect(p.contextConditional).toBe(true);
    expect(p.productions).toHaveLength(2);
    const text = p.productions.find((e) => e.output.kind === "text");
    expect(text?.output).toEqual({ kind: "text", text: "̀" });
    expect(text?.condition).toBe("otherwise");
    const carveOut = p.productions.find((e) => e.output.kind === "none");
    expect(carveOut?.condition).toContain("diablock");
    expect([...p.ruleRefs].sort()).toEqual(["r-bare", "r-guard"]);
  });

  it("guard rule alone (no bare rule): wired, produces nothing, NOT a rule source", () => {
    const ir = makeTestIR(
      [
        irGroup({
          rules: [
            charRule({
              nodeId: "r-guard",
              context: [
                { kind: "any", storeRef: "diablock" },
                { kind: "vkey", name: "T_0300", modifiers: [] },
              ],
              output: [{ kind: "context", offset: 0 }],
            }),
          ],
        }),
      ],
      [charStore({ name: "diablock", chars: " " })],
    );
    const p = resolve(ir, touchKey({ id: "T_0300" }));
    expect(p.source).toBe("none");
    expect(p.productions).toEqual([{ output: { kind: "none" } }]);
    expect(p.ruleRefs).toEqual(["r-guard"]);
  });
});

describe("resolveTouchProduction — source: u-decode", () => {
  it("unruled U_ key decodes, certainly", () => {
    const p = resolve(makeTestIR([]), touchKey({ id: "U_00A1" }));
    expect(p.source).toBe("u-decode");
    expect(p.productions).toEqual([{ output: { kind: "text", text: "¡" } }]);
    expect(p.fallbackCertain).toBe(true);
    expect(p.ruleRefs).toEqual([]);
  });

  it("multi-segment U_ id decodes the whole string", () => {
    const p = resolve(makeTestIR([]), touchKey({ id: "U_0065_0301" }));
    expect(p.source).toBe("u-decode");
    expect(p.productions).toEqual([{ output: { kind: "text", text: "é" } }]);
  });

  it("presumptive (fallbackCertain: false) when the keyboard has a nomatch rule", () => {
    const ir = makeTestIR([
      irGroup({
        rules: [charRule({ nodeId: "r-nm", context: "x", output: "y", matchKind: "nomatch" })],
      }),
    ]);
    const p = resolve(ir, touchKey({ id: "U_00A1" }));
    expect(p.source).toBe("u-decode");
    expect(p.fallbackCertain).toBe(false);
  });

  it("presumptive when any rule binds the id — here, only in another state", () => {
    const ir = irWithRules({ nodeId: "r1", vkey: "U_00A1", modifiers: ["SHIFT"], output: "!" });
    const p = resolve(ir, touchKey({ id: "U_00A1" }), STATE0);
    expect(p.source).toBe("u-decode");
    expect(p.fallbackCertain).toBe(false);
    // …and in the ruled state, the rule is the production.
    expect(resolve(ir, touchKey({ id: "U_00A1" }), SHIFT).source).toBe("rule");
  });

  it("a non-producing binding in this state is in ruleRefs but does not set the source", () => {
    const ir = makeTestIR([
      irGroup({
        rules: [
          charRule({
            nodeId: "r-guard",
            context: [
              { kind: "any", storeRef: "s" },
              { kind: "vkey", name: "U_0300", modifiers: [] },
            ],
            output: [{ kind: "context", offset: 0 }],
          }),
        ],
      }),
    ]);
    const p = resolve(ir, touchKey({ id: "U_0300" }));
    expect(p.source).toBe("u-decode");
    expect(p.ruleRefs).toEqual(["r-guard"]);
    expect(p.fallbackCertain).toBe(false);
  });
});

describe("resolveTouchProduction — source: k-fallback", () => {
  it("state 0: US base character", () => {
    const p = resolve(makeTestIR([]), touchKey({ id: "K_1" }));
    expect(p.source).toBe("k-fallback");
    expect(p.productions).toEqual([{ output: { kind: "text", text: "1" } }]);
    expect(p.fallbackCertain).toBe(true);
  });

  it("SHIFT state: shifted US base character", () => {
    const p = resolve(makeTestIR([]), touchKey({ id: "K_1" }), SHIFT);
    expect(p.source).toBe("k-fallback");
    expect(p.productions).toEqual([{ output: { kind: "text", text: "!" } }]);
  });

  it("RALT state: no fallback — production is none", () => {
    const p = resolve(makeTestIR([]), touchKey({ id: "K_1" }), RALT);
    expect(p.source).toBe("none");
    expect(p.productions).toEqual([{ output: { kind: "none" } }]);
  });

  it("caps state: the fallback FIRES with the state-0 char, and is certain (T022 verdict, §5)", () => {
    // Settled empirically by the caps_probe tap fixture (tapSimulation
    // .test.ts): an unmatched K_Q on a caps layer types 'q'. KMW's
    // forBaseKeys gates on Lmodifiers only; CAPITAL is invisible to it.
    const p = resolve(makeTestIR([]), touchKey({ id: "K_A" }), CAPS);
    expect(p.source).toBe("k-fallback");
    expect(p.productions).toEqual([{ output: { kind: "text", text: "a" } }]);
    expect(p.fallbackCertain).toBe(true);
  });

  it("caps + SHIFT: the SHIFT arm of the fallback — shifted char, certain (T022)", () => {
    // caps_shift layer in the probe fixture: unmatched K_Q types 'Q'.
    const p = resolve(makeTestIR([]), touchKey({ id: "K_A" }), SHIFT_CAPS);
    expect(p.source).toBe("k-fallback");
    expect(p.productions).toEqual([{ output: { kind: "text", text: "A" } }]);
    expect(p.fallbackCertain).toBe(true);
  });

  it("memoised IR maps are keyed on the IR object: a rebuilt IR never inherits stale maps", () => {
    // The resolver memoises its per-IR lookup maps (WeakMap on the IR
    // object) so corpus-scale consumers stay linear in rules-per-key.
    // The invariant that makes it sound: a NEW IR object — the only way
    // an edited keyboard ever reaches the resolver — gets fresh maps.
    const ruled = irWithRules({ nodeId: "r1", vkey: "T_0300", output: "̀" });
    const inputs = { ir: ruled, ruleIndex: buildTouchKeyRuleIndex(ruled) };
    const key = touchKey({ id: "T_0300" });
    expect(resolveTouchProduction(inputs, key, STATE0).source).toBe("rule");
    // Repeat call over the same inputs (the memo path) — identical record.
    expect(resolveTouchProduction(inputs, key, STATE0).source).toBe("rule");
    // A different IR object without the rule must NOT see the memoised map.
    const bare = makeTestIR([]);
    const p = resolve(bare, key);
    expect(p.source).toBe("none");
  });

  it("caps + RALT: the modifier arm settles it — none", () => {
    const p = resolve(makeTestIR([]), touchKey({ id: "K_A" }), RALT_CAPS);
    expect(p.source).toBe("none");
    expect(p.productions).toEqual([{ output: { kind: "none" } }]);
  });
});

describe("resolveTouchProduction — none / layerSwitch / emulation / unclassified", () => {
  it("rule-free producing T_ key is none — the dead-key case", () => {
    const p = resolve(makeTestIR([]), touchKey({ id: "T_0021" }));
    expect(p.source).toBe("none");
    expect(p.productions).toEqual([{ output: { kind: "none" } }]);
  });

  it("nextlayer key: layerSwitch production (T_CAM shape, with its nul rule)", () => {
    const ir = makeTestIR([
      irGroup({ rules: [vkeyRule({ nodeId: "r1", vkey: "T_CAM", output: [{ kind: "nul" }] })] }),
    ]);
    const p = resolve(ir, touchKey({ id: "T_CAM", nextlayer: "rightalt" }));
    expect(p.productions).toEqual([{ output: { kind: "layerSwitch", layerId: "rightalt" } }]);
    expect(p.source).toBe("none");
  });

  it("producer + layer-switch key carries both productions under one record", () => {
    const ir = irWithRules({ nodeId: "r1", vkey: "T_X", output: "x" });
    const p = resolve(ir, touchKey({ id: "T_X", nextlayer: "vowels" }));
    expect(p.source).toBe("rule");
    expect(p.productions).toEqual([
      { output: { kind: "layerSwitch", layerId: "vowels" } },
      { output: { kind: "text", text: "x" } },
    ]);
  });

  it("U_ decode + layer-switch key carries both productions — the switch does not preempt the decode", () => {
    // The basic_* symbol-layer idiom in U_ form: type the character,
    // return to the default layer. Before the arm reorder this resolved
    // `none` with only the switch entry, and the dead-key scan read a
    // working key as dead.
    const p = resolve(makeTestIR([]), touchKey({ id: "U_0021", nextlayer: "default" }));
    expect(p.source).toBe("u-decode");
    expect(p.productions).toEqual([
      { output: { kind: "layerSwitch", layerId: "default" } },
      { output: { kind: "text", text: "!" } },
    ]);
  });

  it("K_ fallback + layer-switch key carries both productions under one record", () => {
    const p = resolve(makeTestIR([]), touchKey({ id: "K_1", nextlayer: "default" }));
    expect(p.source).toBe("k-fallback");
    expect(p.productions).toEqual([
      { output: { kind: "layerSwitch", layerId: "default" } },
      { output: { kind: "text", text: "1" } },
    ]);
  });

  it("rule-free producing T_ key with a layer return is still none — the basic_* dead-key shape", () => {
    const p = resolve(makeTestIR([]), touchKey({ id: "T_0031", nextlayer: "default" }));
    expect(p.source).toBe("none");
    expect(p.productions).toEqual([{ output: { kind: "layerSwitch", layerId: "default" } }]);
  });

  it("spacer-class key is none", () => {
    const p = resolve(makeTestIR([]), touchKey({ id: "T_BLANK", sp: 10 }));
    expect(p.source).toBe("none");
    expect(p.productions).toEqual([{ output: { kind: "none" } }]);
  });

  it("special-function K_ ids are emulation (no text production listed)", () => {
    for (const id of ["K_BKSP", "K_ENTER", "K_TAB", "K_LOPT", "K_ROPT", "K_NP5"]) {
      const p = resolve(makeTestIR([]), touchKey({ id }));
      expect(p.source, id).toBe("emulation");
      expect(p.productions).toEqual([]);
    }
  });

  it("an id outside the K_/T_/U_ families is unclassified — never read as dead", () => {
    const p = resolve(makeTestIR([]), touchKey({ id: "ISO_A1" }));
    expect(p.source).toBe("unclassified");
    expect(p.productions).toEqual([{ output: { kind: "unknown" } }]);
  });
});

// ---------------------------------------------------------------------------
// decideKeyIdForm — the contracts §2 table, one row per arm
// ---------------------------------------------------------------------------

describe("decideKeyIdForm — contracts §2 arms", () => {
  const cases: readonly {
    name: string;
    input: KeyIdFormInput;
    arm: string;
    destination: unknown;
  }[] = [
    {
      name: "arm 0: behaviour equals the physical key's — keep K_",
      input: {
        roles: ["producer"],
        behaviourVsPhysical: "equal",
        existingIdentity: { id: "K_1", form: "K_", ruled: true },
        plainOutput: "1",
      },
      arm: "0",
      destination: { form: "K_", action: "keep" },
    },
    {
      name: "arm 0: equality undecidable defaults to keep K_ (non-interference)",
      input: {
        roles: ["producer"],
        behaviourVsPhysical: "undecidable",
        existingIdentity: { id: "K_1", form: "K_", ruled: false },
        plainOutput: "§",
      },
      arm: "0",
      destination: { form: "K_", action: "keep" },
    },
    {
      name: "arm a: rule logic, no existing ruled identity — mint T_ + rules",
      input: { roles: ["producer"], ruleLogicRequired: true, behaviourVsPhysical: "differs" },
      arm: "a",
      destination: { form: "T_", action: "mint-with-rules" },
    },
    {
      name: "arm a: rule logic, existing ruled T_ identity — keep T_, rules against it",
      input: {
        roles: ["producer"],
        ruleLogicRequired: true,
        existingIdentity: { id: "T_X", form: "T_", ruled: true },
      },
      arm: "a",
      destination: { form: "T_", action: "keep-with-rules", id: "T_X" },
    },
    {
      name: "arm b: rule logic, existing ruled U_ identity — keep U_ (fail-open rider)",
      input: {
        roles: ["producer"],
        ruleLogicRequired: true,
        existingIdentity: { id: "U_0905", form: "U_", ruled: true },
      },
      arm: "b",
      destination: { form: "U_", action: "keep-with-rules", id: "U_0905" },
    },
    {
      name: "arm b: rule logic, existing UNruled U_ identity — still keep U_ (least change)",
      input: {
        roles: ["producer"],
        ruleLogicRequired: true,
        existingIdentity: { id: "U_00A1", form: "U_", ruled: false },
      },
      arm: "b",
      destination: { form: "U_", action: "keep-with-rules", id: "U_00A1" },
    },
    {
      name: "arm c: plain char — U_ (single codepoint needs no version floor)",
      input: { roles: ["producer"], plainOutput: "ñ", keyboardVersion: "10.0" },
      arm: "c",
      destination: { form: "U_", action: "mint", output: "ñ" },
    },
    {
      name: "arm c: fixed string at &VERSION 15.0 — multi-segment U_",
      input: { roles: ["producer"], plainOutput: "FCFA", keyboardVersion: "15.0" },
      arm: "c",
      destination: { form: "U_", action: "mint", output: "FCFA" },
    },
    {
      name: "arm c′: fixed string below &VERSION 15.0 — falls to arm (a)",
      input: { roles: ["producer"], plainOutput: "FCFA", keyboardVersion: "14.0" },
      arm: "c′",
      destination: { form: "T_", action: "mint-with-rules" },
    },
    {
      name: "arm c′: fixed string with no &VERSION at all — falls to arm (a)",
      input: { roles: ["producer"], plainOutput: "FCFA" },
      arm: "c′",
      destination: { form: "T_", action: "mint-with-rules" },
    },
    {
      name: "arm c′: string containing a C1 segment is not runtime-decodable — arm (a)",
      input: { roles: ["producer"], plainOutput: "a\u0085b", keyboardVersion: "16.0" },
      arm: "c′",
      destination: { form: "T_", action: "mint-with-rules" },
    },
    {
      name: "arm d′: combining mark with no box value — unticked default, guarded T_",
      input: { roles: ["producer"], isCombiningMark: true, plainOutput: "̀" },
      arm: "d′",
      destination: { form: "T_", action: "mint-with-rules" },
    },
    {
      name: "arm d: mark with a ticked start-of-line box needs no guard — U_",
      input: {
        roles: ["producer"],
        isCombiningMark: true,
        plainOutput: "̀",
        bareMarkAllowed: true,
      },
      arm: "d",
      destination: { form: "U_", action: "mint", output: "̀" },
    },
    {
      name: "arm d′: mark with an unticked start-of-line box — arm (a), guarded T_",
      input: {
        roles: ["producer"],
        isCombiningMark: true,
        plainOutput: "̀",
        bareMarkAllowed: false,
      },
      arm: "d′",
      destination: { form: "T_", action: "mint-with-rules" },
    },
    {
      name: "arm d′: mark with no box (late-added, no survey row) — unticked default, guarded T_",
      input: { roles: ["producer"], isCombiningMark: true, plainOutput: "̀" },
      arm: "d′",
      destination: { form: "T_", action: "mint-with-rules" },
    },
    {
      name: "arm d″: deadkey-composed mark — arm (a) as a deadkey output rule, guard irrelevant",
      input: {
        roles: ["producer"],
        isCombiningMark: true,
        deadkeyComposedMark: true,
        plainOutput: "́",
        bareMarkAllowed: false,
      },
      arm: "d″",
      destination: { form: "T_", action: "mint-with-rules" },
    },
    {
      name: "arm e: all roles non-producing — T_ frame class, no rules",
      input: { roles: ["frame"] },
      arm: "e",
      destination: { form: "T_", action: "frame" },
    },
    {
      name: "role-set rule: producer + layer-switch + subkey host stays OUT of arm e",
      input: { roles: ["producer", "layer-switch", "subkey-host"], plainOutput: "x" },
      arm: "c",
      destination: { form: "U_", action: "mint", output: "x" },
    },
    {
      name: "role-set rule: producer + layer-switch + host with rule logic — arm a, not e",
      input: { roles: ["producer", "layer-switch", "subkey-host"], ruleLogicRequired: true },
      arm: "a",
      destination: { form: "T_", action: "mint-with-rules" },
    },
    {
      name: "behaviour differs with no other signal for a producer: arm a (rule definition required)",
      input: { roles: ["producer"], behaviourVsPhysical: "differs" },
      arm: "a",
      destination: { form: "T_", action: "mint-with-rules" },
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const decision = decideKeyIdForm(c.input);
      expect(decision.arm).toBe(c.arm);
      expect(decision.destination).toEqual(c.destination);
      expect(decision.reason.length).toBeGreaterThan(0);
    });
  }
});
