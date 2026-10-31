// Generalised S-02 shapes (#2233): the hand-written s02Recognizer and the
// YAML-generated rule must agree on the shapes the shipped matchers used to
// miss (any-store triggers, codec '+' separators, postfix fan-outs,
// self-triggering families, escape-optional) AND on the non-claims (shapes
// that must stay unclaimed). Fixtures replicate sil_pan_africa_mnemonic and
// sil_euro_latin; the corpus test pins the real files.
import { describe, it, expect } from "vitest";
import { rule as generatedDeadkeySingleTap } from "./deadkey-single-tap.js";
import { s02Recognizer } from "../s02-deadkey-single-tap.js";
import type { IRGroup, KeyboardIR } from "@keyboard-studio/contracts";
import { makeTestIR, makeCharStore } from "@keyboard-studio/contracts/fixtures";
import type { MatchResult } from "../../types.js";
import {
  buildChainStoreIR,
  buildEuroLatinIR,
  buildPanAfricaIR,
} from "../__fixtures__/s02GeneralizedIr.js";

function expectTwinParity(refMatches: MatchResult[], genMatches: MatchResult[]): void {
  expect(genMatches.map((m) => m.patternId).sort()).toEqual(
    refMatches.map((m) => m.patternId).sort(),
  );
  for (const ref of refMatches) {
    const gen = genMatches.find((m) => m.patternId === ref.patternId)!;
    expect(gen.ownedNodes.map((n) => n.nodeId).sort()).toEqual(
      ref.ownedNodes.map((n) => n.nodeId).sort(),
    );
    const { __hasBeep: _beep, ...genSlots } = gen.slotValues;
    expect(genSlots).toEqual(ref.slotValues);
    expect(generatedDeadkeySingleTap.lift(gen).kmnFragment).toBe(
      s02Recognizer.lift(ref).kmnFragment,
    );
  }
}

function bothMatch(ir: KeyboardIR): { ref: MatchResult[]; gen: MatchResult[] } {
  const ref = s02Recognizer.match(ir);
  const gen = generatedDeadkeySingleTap.match(ir);
  expectTwinParity(ref, gen);
  return { ref, gen };
}

describe("generalised S-02 shapes (#2233)", () => {
  it("Pan Africa shape: 5 families, any-store triggers shared and unowned, [index,use] body excluded", () => {
    const { ir } = buildPanAfricaIR();
    const { ref, gen } = bothMatch(ir);
    expect(ref).toHaveLength(5);

    // Shared triggers: dk(1) serves 2 families, dk(2) serves 3 — the trigger
    // rules are owned by NONE of the matches.
    const ownedRuleIds = new Set(ref.flatMap((m) => m.ownedNodes.map((n) => n.nodeId)));
    expect(ownedRuleIds.has("rule#trig-1")).toBe(false);
    expect(ownedRuleIds.has("rule#trig-2")).toBe(false);
    // The [index, use] body and the beep rule are not claimed either.
    expect(ownedRuleIds.has("rule#body-nfc")).toBe(false);
    expect(ownedRuleIds.has("rule#beep-2")).toBe(false);

    // Any-store trigger slots: triggerKey is the store's sole char, and the
    // triggerStore slot rides along; the fragment renders the any() form.
    const dk1 = ref.find((m) => m.patternId.includes("dk_0001"))!;
    expect(dk1.slotValues["triggerKey"]).toBe("[");
    expect(dk1.slotValues["triggerStore"]).toBe("K_1");
    expect(s02Recognizer.lift(dk1).kmnFragment.split("\n")[0]).toBe(
      "+ any({{triggerStore}}) > dk({{deadkeyName}})",
    );
    // No escape anywhere -> no accentChar slot, two-line fragment.
    expect(dk1.slotValues["accentChar"]).toBeUndefined();
    expect(s02Recognizer.lift(dk1).kmnFragment.split("\n")).toHaveLength(2);

    // The beep is recorded (generated matcher's review marker), never evidence:
    // dk(2) families exist despite having no escape, and carry __hasBeep.
    const dk2Gen = gen.filter((m) => m.patternId.includes("dk_0002"));
    expect(dk2Gen).toHaveLength(3);
    expect(dk2Gen.every((m) => m.slotValues["__hasBeep"] === "1")).toBe(true);
  });

  it("EuroLatin shape: postfix families are self-triggering; postfix escapes owned", () => {
    const { ir } = buildEuroLatinIR();
    const { ref } = bothMatch(ir);
    expect(ref).toHaveLength(2);

    const x = ref.find((m) => m.patternId.includes(":x:"))!;
    expect(x.patternId).toBe("deadkey_single_tap#Main:dk_0001:x:Kx>Ox");
    // No trigger rule exists: the prefix char is the trigger identity.
    expect(x.slotValues["triggerKey"]).toBe("x");
    expect(x.slotValues["triggerStore"]).toBeUndefined();
    // Postfix escape owned, accentChar is the prefix char.
    expect(x.slotValues["accentChar"]).toBe("x");
    expect(x.ownedNodes.map((n) => n.nodeId)).toEqual(
      expect.arrayContaining(["rule#body-x", "rule#escape-x", "store#Kx", "store#Ox"]),
    );
    // The digraph rule that merely looks escape-like is NOT the escape
    // (already implied by accentChar correctness, pinned explicitly).
    expect(x.ownedNodes.map((n) => n.nodeId)).not.toContain("rule#not-escape");
  });

  it("chain stores: deadkey items in the base store and nul padding in the output store still claim (D6)", () => {
    const { ir } = buildChainStoreIR();
    const { ref } = bothMatch(ir);
    expect(ref).toHaveLength(1);
    // Slot strings keep only char items — the documented slot-fidelity
    // limitation (carve splice stays positional on the real stores).
    expect(ref[0]!.slotValues["baseLetters"]).toBe(" a");
    expect(ref[0]!.slotValues["accentedForms"]).toBe("^á");
  });

  // --- Pinned non-claims ---

  it("non-claim: postfix fan-out with offset != cleaned any() position", () => {
    const main: IRGroup = {
      nodeId: "group#Main",
      name: "Main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "rule#body",
          context: [
            { kind: "char", value: "x" },
            { kind: "deadkey", id: 1 },
            { kind: "raw", text: "+" },
            { kind: "any", storeRef: "Kx" },
          ],
          // Cleaned any() position is 3; offset 2 is misaligned.
          output: [{ kind: "index", storeRef: "Ox", offset: 2 }],
        },
      ],
    };
    const ir = makeTestIR(
      [main],
      [makeCharStore("store#Kx", "Kx", "aei"), makeCharStore("store#Ox", "Ox", "áéí")],
    );
    expect(s02Recognizer.match(ir)).toHaveLength(0);
    expect(generatedDeadkeySingleTap.match(ir)).toHaveLength(0);
  });

  it("non-claim: multi-item any() store is a set selector, not a trigger", () => {
    const main: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "rule#trig-multi",
          context: [{ kind: "any", storeRef: "Kmulti" }],
          output: [{ kind: "deadkey", id: 9 }],
        },
      ],
    };
    const deadkeys: IRGroup = {
      nodeId: "group#deadkeys",
      name: "deadkeys",
      usingKeys: false,
      readonly: false,
      rules: [
        {
          nodeId: "rule#body",
          context: [
            { kind: "deadkey", id: 9 },
            { kind: "any", storeRef: "dkf" },
          ],
          output: [{ kind: "index", storeRef: "dkt", offset: 2 }],
        },
      ],
    };
    const ir = makeTestIR(
      [main, deadkeys],
      [
        makeCharStore("store#Kmulti", "Kmulti", "ab"),
        makeCharStore("store#dkf", "dkf", "ae"),
        makeCharStore("store#dkt", "dkt", "áé"),
      ],
    );
    // Classic family with no valid trigger stays unclaimed.
    expect(s02Recognizer.match(ir)).toHaveLength(0);
    expect(generatedDeadkeySingleTap.match(ir)).toHaveLength(0);
  });

  it("non-claim: fan-out context with a non-separator raw element is disqualified", () => {
    const main: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "rule#trig",
          context: [{ kind: "vkey", name: "K_X", modifiers: [] }],
          output: [{ kind: "deadkey", id: 5 }],
        },
      ],
    };
    const deadkeys: IRGroup = {
      nodeId: "group#deadkeys",
      name: "deadkeys",
      usingKeys: false,
      readonly: false,
      rules: [
        {
          nodeId: "rule#body",
          context: [
            { kind: "deadkey", id: 5 },
            { kind: "raw", text: "platform('windows')" },
            { kind: "any", storeRef: "dkf" },
          ],
          output: [{ kind: "index", storeRef: "dkt", offset: 2 }],
        },
      ],
    };
    const ir = makeTestIR(
      [main, deadkeys],
      [makeCharStore("store#dkf", "dkf", "ae"), makeCharStore("store#dkt", "dkt", "áé")],
    );
    expect(s02Recognizer.match(ir)).toHaveLength(0);
    expect(generatedDeadkeySingleTap.match(ir)).toHaveLength(0);
  });
});
