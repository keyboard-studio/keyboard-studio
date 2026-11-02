// deriveCarvedIr under each keyboard-wide fallback policy. Only the SOURCE of
// the suppression decision moved (per-combo records -> one policy); the
// FR-020..FR-022 mechanics are pinned by carveSuppression.test.ts.

import { describe, it, expect } from "vitest";
import { charRule, charStore, irGroup, makeTestIR, vkeyRule } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { deriveCarvedIr } from "./carvePipeline.js";
import { uniformFallbackPolicy, type FallbackPolicy } from "@keyboard-studio/contracts";
import type { Leak } from "./fallbackPolicy.js";
import { SWALLOW_UNDEFINED_OWNER } from "./swallowUndefined.js";

const ir = (): KeyboardIR =>
  makeTestIR({
    stores: [
      charStore({ nodeId: "store#dkf003b", name: "dkf003b", chars: ["e", "E"] }),
      charStore({ nodeId: "store#dkt003b", name: "dkt003b", chars: ["é", "É"] }),
    ],
    groups: [
      irGroup({
        nodeId: "group#main",
        rules: [
          vkeyRule({ nodeId: "bare", vkey: "K_A", output: "a" }),
          charRule({
            nodeId: "dk",
            context: [{ kind: "deadkey", id: 3 }, { kind: "raw", text: "+" }, { kind: "any", storeRef: "dkf003b" }],
            output: [{ kind: "index", storeRef: "dkt003b", offset: 2 }],
          }),
        ],
      }),
    ],
  });

const rules = (out: KeyboardIR) => out.groups[0]!.rules;

describe("deriveCarvedIr fallbackPolicy", () => {
  it("swallow: a carved bare-key rule becomes an owned suppression rule", () => {
    const { ir: out } = deriveCarvedIr(ir(), {
      deletedNodeIds: new Set(["bare"]),
      deletedItemIds: new Set(),
      fallbackPolicy: "swallow",
    });
    const r = rules(out).find((x) => x.nodeId === "bare");
    expect(r?.ownedByBehaviour).toBe("carve-suppression");
    expect(r?.output).toEqual([{ kind: "nul" }]);
  });

  it("pass-through: a carved bare-key rule is removed outright", () => {
    const { ir: out } = deriveCarvedIr(ir(), {
      deletedNodeIds: new Set(["bare"]),
      deletedItemIds: new Set(),
      fallbackPolicy: "pass-through",
    });
    expect(rules(out).some((x) => x.nodeId === "bare")).toBe(false);
  });

  it("omitted policy is the legacy removal path (same as pass-through for a bare rule)", () => {
    const { ir: out } = deriveCarvedIr(ir(), {
      deletedNodeIds: new Set(["bare"]),
      deletedItemIds: new Set(),
    });
    expect(rules(out).some((x) => x.nodeId === "bare")).toBe(false);
  });

  it("deadkey backstop: pass-through still suppresses a deadkey-context carve", () => {
    const { ir: out } = deriveCarvedIr(ir(), {
      deletedNodeIds: new Set(["dk"]),
      deletedItemIds: new Set(),
      fallbackPolicy: "pass-through",
    });
    const r = rules(out).find((x) => x.nodeId === "dk");
    expect(r?.ownedByBehaviour).toBe("carve-suppression");
  });

  it("suppressionExemptIds are removed, never rewritten, even under swallow", () => {
    const { ir: out } = deriveCarvedIr(ir(), {
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(["bare"]),
      fallbackPolicy: "swallow",
      suppressionExemptIds: new Set(["bare"]),
    });
    expect(rules(out).some((x) => x.nodeId === "bare")).toBe(false);
  });

  it("swallow: a carved store slot gets a guard; pass-through does not", () => {
    const run = (fallbackPolicy: "swallow" | "pass-through") =>
      deriveCarvedIr(ir(), {
        deletedNodeIds: new Set(),
        deletedItemIds: new Set(["store#dkt003b#1"]),
        fallbackPolicy,
      }).ir;
    expect(rules(run("swallow")).some((r) => r.nodeId.startsWith("gen-carve-guard-"))).toBe(true);
    expect(rules(run("pass-through")).some((r) => r.nodeId.startsWith("gen-carve-guard-"))).toBe(false);
  });

  // Camqwerty-like: composed / comp-dia are positionally tied by a rule whose
  // composed side sits in the CONTEXT (left of `+`).
  const camIr = (): KeyboardIR =>
    makeTestIR({
      stores: [
        charStore({ nodeId: "store#composed", name: "composed", chars: ["a", "e", "o"] }),
        charStore({ nodeId: "store#compdia", name: "comp-dia", chars: ["à", "è", "ò"] }),
      ],
      groups: [
        irGroup({
          nodeId: "group#main",
          rules: [
            charRule({
              nodeId: "bksp",
              context: [
                { kind: "any", storeRef: "composed" },
                { kind: "raw", text: "+" },
                { kind: "vkey", name: "K_BKSP", modifiers: [] },
              ],
              output: [{ kind: "index", storeRef: "comp-dia", offset: 1 }],
            }),
          ],
        }),
      ],
    });

  it("swallow: carving a slot in only one paired store keeps alignment and emits no carved char", () => {
    // Carve only comp-dia#1 (the real walk did this for some slots).
    const { ir: out } = deriveCarvedIr(camIr(), {
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(["store#compdia#1"]),
      fallbackPolicy: "swallow",
    });
    const chars = (name: string) =>
      out.stores.find((s) => s.name === name)!.items.map((i) => (i.kind === "char" ? i.value : "?"));
    // Coordinated drop: same index removed from both stores; still aligned.
    expect(chars("composed")).toEqual(["a", "o"]);
    expect(chars("comp-dia")).toEqual(["à", "ò"]);
    // No rule references any carved character (composed "e" / comp-dia "è").
    const carved = ["e", "è"];
    const text = JSON.stringify(rules(out));
    for (const c of carved) expect(text).not.toContain(`"value":"${c}"`);
    expect(rules(out).map((r) => r.nodeId)).toEqual(["bksp"]);
  });
});

// ---------------------------------------------------------------------------
// Per-class policy and the confirmed gate (spec 109 FR-015, FR-021, SC-006).
// ---------------------------------------------------------------------------


const classIr = (): KeyboardIR =>
  makeTestIR({
    groups: [
      irGroup({
        nodeId: "group#main",
        rules: [
          vkeyRule({ nodeId: "letter", vkey: "K_A", output: "a" }),
          vkeyRule({ nodeId: "digit", vkey: "K_1", output: "x" }),
        ],
      }),
    ],
  });

const classLeaks: Leak[] = [
  { position: { key: "K_A", modifiers: "" }, baseKeyboard: "us", outcome: { kind: "char", char: "a", leakClass: "letters" } },
  { position: { key: "K_1", modifiers: "" }, baseKeyboard: "us", outcome: { kind: "char", char: "1", leakClass: "digits" } },
];
const LETTERS_ONLY: FallbackPolicy = { letters: "swallow", digits: "pass-through", punctuation: "pass-through" };
const hasSwallow = (out: KeyboardIR) =>
  out.stores.some((s) => s.ownedByBehaviour === SWALLOW_UNDEFINED_OWNER);

describe("deriveCarvedIr per-class policy", () => {
  it("confirmed: each carved combination follows its leak class", () => {
    const { ir: out } = deriveCarvedIr(classIr(), {
      deletedNodeIds: new Set(["letter", "digit"]),
      deletedItemIds: new Set(),
      fallbackPolicy: LETTERS_ONLY,
      fallbackPolicyConfirmed: true,
      leaks: classLeaks,
    });
    expect(rules(out).find((x) => x.nodeId === "letter")?.ownedByBehaviour).toBe("carve-suppression");
    expect(rules(out).some((x) => x.nodeId === "digit")).toBe(false);
  });

  it("confirmed with a Do nothing class adds one swallow store, even with no carve", () => {
    const { ir: out } = deriveCarvedIr(classIr(), {
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(),
      fallbackPolicy: LETTERS_ONLY,
      fallbackPolicyConfirmed: true,
      leaks: classLeaks,
    });
    expect(hasSwallow(out)).toBe(true);
    // The carved-and-suppressed position is not emitted twice.
    const store = out.stores.find((s) => s.ownedByBehaviour === SWALLOW_UNDEFINED_OWNER);
    expect(JSON.stringify(store?.items)).not.toContain("\"K_A\"");
  });

  it("unconfirmed: output equals the collapsed single-value output, byte for byte", () => {
    for (const policy of [uniformFallbackPolicy("swallow"), LETTERS_ONLY, uniformFallbackPolicy("pass-through")]) {
      const collapsed = policy.letters === "pass-through" && policy.digits === "pass-through" && policy.punctuation === "pass-through"
        ? "pass-through"
        : "swallow";
      const input = { deletedNodeIds: new Set(["letter"]), deletedItemIds: new Set<string>() };
      const per = deriveCarvedIr(classIr(), { ...input, fallbackPolicy: policy, leaks: classLeaks });
      const flat = deriveCarvedIr(classIr(), { ...input, fallbackPolicy: collapsed });
      expect(per.ir).toEqual(flat.ir);
      expect(hasSwallow(per.ir)).toBe(false);
    }
  });

  it("confirmed with every class passing through adds nothing", () => {
    const { ir: out } = deriveCarvedIr(classIr(), {
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(),
      fallbackPolicy: uniformFallbackPolicy("pass-through"),
      fallbackPolicyConfirmed: true,
      leaks: classLeaks,
    });
    expect(out).toEqual(classIr());
  });
});
