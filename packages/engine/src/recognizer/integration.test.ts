/**
 * Integration tests for recognizePatterns against real keyboard IR shapes.
 *
 * The KeyboardIR codec (#233) is not yet landed, so these tests construct IR
 * directly from the known structure of the keyboards in the sibling repo.
 * They use it.skipIf for CI safety when the sibling repo is absent.
 *
 * When #233 lands, these can be rewritten to use parseKmn() directly.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { recognizePatterns } from "./index.js";
import type {
  IRGroup,
  IRRule,
  IRStore,
  StoreItem,
} from "@keyboard-studio/contracts";
import { makeTestIR, charItems } from "@keyboard-studio/contracts/fixtures";

const KEYBOARDS_ROOT = path.resolve(
  new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
  "../../../../../keyboards/release/basic",
);

const kbdfrExists = fs.existsSync(
  path.join(KEYBOARDS_ROOT, "basic_kbdfr/source/basic_kbdfr.kmn"),
);
const kbdcaExists = fs.existsSync(
  path.join(KEYBOARDS_ROOT, "basic_kbdca/source/basic_kbdca.kmn"),
);

function uItems(codepoints: string[]): StoreItem[] {
  return codepoints.map((cp) => ({
    kind: "char" as const,
    value: String.fromCodePoint(parseInt(cp, 16)),
  }));
}

function makeStore(nodeId: string, name: string, items: StoreItem[]): IRStore {
  return { nodeId, name, items, isSystem: false };
}

function makeRule(
  nodeId: string,
  ctx: IRGroup["rules"][0]["context"],
  out: IRGroup["rules"][0]["output"],
): IRRule {
  return { nodeId, context: ctx, output: out };
}

const makeIR = (groups: IRGroup[], stores: IRStore[]) => makeTestIR(groups, stores);

/**
 * Builds a KeyboardIR mirroring the structure of basic_kbdfr:
 * - Many S-01 rules in the main group
 * - 4 deadkey families (007e, 0060, 00a8, 005e) with parallel stores
 */
function buildKbdfrIR(): KeyboardIR {
  // S-01 rules: a representative slice of the main group
  const s01Rules: IRRule[] = [
    makeRule("r#k0", [{ kind: "vkey", name: "K_0", modifiers: [] }], [{ kind: "char", value: "à" }]),
    makeRule("r#k0s", [{ kind: "vkey", name: "K_0", modifiers: ["SHIFT"] }], [{ kind: "char", value: "0" }]),
    makeRule("r#k1", [{ kind: "vkey", name: "K_1", modifiers: [] }], [{ kind: "char", value: "&" }]),
    makeRule("r#kq", [{ kind: "vkey", name: "K_Q", modifiers: [] }], [{ kind: "char", value: "a" }]),
    makeRule("r#kqs", [{ kind: "vkey", name: "K_Q", modifiers: ["SHIFT"] }], [{ kind: "char", value: "A" }]),
    // Trigger rules (S-02 triggers — emit deadkey, not char, so excluded from S-01)
    makeRule("r#dk007e", [{ kind: "vkey", name: "K_2", modifiers: ["RALT"] }], [{ kind: "deadkey", id: 0x007e }]),
    makeRule("r#dk0060", [{ kind: "vkey", name: "K_7", modifiers: ["RALT"] }], [{ kind: "deadkey", id: 0x0060 }]),
    makeRule("r#dk00a8", [{ kind: "vkey", name: "K_LBRKT", modifiers: ["SHIFT"] }], [{ kind: "deadkey", id: 0x00a8 }]),
    makeRule("r#dk005e", [{ kind: "vkey", name: "K_LBRKT", modifiers: [] }], [{ kind: "deadkey", id: 0x005e }]),
  ];

  const mainGroup: IRGroup = {
    nodeId: "group#main",
    name: "main",
    usingKeys: true,
    readonly: false,
    rules: s01Rules,
  };

  // 007e family: dkf007e = " aAnNoO", dkt007e = "~ãÃñÑõÕ"
  const dkf007eItems = uItems(["0020","0061","0041","006e","004e","006f","004f"]);
  const dkt007eItems = uItems(["007e","00e3","00c3","00f1","00d1","00f5","00d5"]);

  // 0060 family: dkf0060 = " aAeEiIoOuU", dkt0060 = "`àÀèÈìÌòÒùÙ"
  const dkf0060Items = uItems(["0020","0061","0041","0065","0045","0069","0049","006f","004f","0075","0055"]);
  const dkt0060Items = uItems(["0060","00e0","00c0","00e8","00c8","00ec","00cc","00f2","00d2","00f9","00d9"]);

  // 00a8 family
  const dkf00a8Items = uItems(["0020","0061","0041","0065","0045","0069","0049","006f","004f","0075","0055","0079"]);
  const dkt00a8Items = uItems(["00a8","00e4","00c4","00eb","00cb","00ef","00cf","00f6","00d6","00fc","00dc","00ff"]);

  // 005e family
  const dkf005eItems = uItems(["0020","0061","0041","0065","0045","0069","0049","006f","004f","0075","0055"]);
  const dkt005eItems = uItems(["005e","00e2","00c2","00ea","00ca","00ee","00ce","00f4","00d4","00fb","00db"]);

  const stores: IRStore[] = [
    makeStore("s#dkf007e", "dkf007e", dkf007eItems),
    makeStore("s#dkt007e", "dkt007e", dkt007eItems),
    makeStore("s#dkf0060", "dkf0060", dkf0060Items),
    makeStore("s#dkt0060", "dkt0060", dkt0060Items),
    makeStore("s#dkf00a8", "dkf00a8", dkf00a8Items),
    makeStore("s#dkt00a8", "dkt00a8", dkt00a8Items),
    makeStore("s#dkf005e", "dkf005e", dkf005eItems),
    makeStore("s#dkt005e", "dkt005e", dkt005eItems),
  ];

  const deadkeysGroup: IRGroup = {
    nodeId: "group#deadkeys",
    name: "deadkeys",
    usingKeys: false,
    readonly: false,
    rules: [
      makeRule("r#body007e", [
        { kind: "deadkey", id: 0x007e },
        { kind: "any", storeRef: "dkf007e" },
      ], [{ kind: "index", storeRef: "dkt007e", offset: 2 }]),
      makeRule("r#body0060", [
        { kind: "deadkey", id: 0x0060 },
        { kind: "any", storeRef: "dkf0060" },
      ], [{ kind: "index", storeRef: "dkt0060", offset: 2 }]),
      makeRule("r#body00a8", [
        { kind: "deadkey", id: 0x00a8 },
        { kind: "any", storeRef: "dkf00a8" },
      ], [{ kind: "index", storeRef: "dkt00a8", offset: 2 }]),
      makeRule("r#body005e", [
        { kind: "deadkey", id: 0x005e },
        { kind: "any", storeRef: "dkf005e" },
      ], [{ kind: "index", storeRef: "dkt005e", offset: 2 }]),
    ],
  };

  return makeIR([mainGroup, deadkeysGroup], stores);
}

/**
 * Builds a KeyboardIR mirroring basic_kbdca's multi-trigger grave pattern:
 * K_QUOTE (unshifted) and SHIFT K_QUOTE both emit dk(0060).
 */
function buildKbdcaGraveIR(): KeyboardIR {
  const mainGroup: IRGroup = {
    nodeId: "group#main",
    name: "main",
    usingKeys: true,
    readonly: false,
    rules: [
      makeRule("r#q", [{ kind: "vkey", name: "K_Q", modifiers: [] }], [{ kind: "char", value: "q" }]),
      makeRule("r#trig0060a", [
        { kind: "vkey", name: "K_QUOTE", modifiers: [] },
      ], [{ kind: "deadkey", id: 0x0060 }]),
      makeRule("r#trig0060b", [
        { kind: "vkey", name: "K_QUOTE", modifiers: ["SHIFT"] },
      ], [{ kind: "deadkey", id: 0x0060 }]),
    ],
  };

  const dkf0060Items = uItems(["0020","0061","0041","0065","0045","0069","0049","006f","004f","0075","0055"]);
  const dkt0060Items = uItems(["0060","00e0","00c0","00e8","00c8","00ec","00cc","00f2","00d2","00f9","00d9"]);

  const stores: IRStore[] = [
    makeStore("s#dkf0060", "dkf0060", dkf0060Items),
    makeStore("s#dkt0060", "dkt0060", dkt0060Items),
  ];

  const deadkeysGroup: IRGroup = {
    nodeId: "group#deadkeys",
    name: "deadkeys",
    usingKeys: false,
    readonly: false,
    rules: [
      makeRule("r#body0060", [
        { kind: "deadkey", id: 0x0060 },
        { kind: "any", storeRef: "dkf0060" },
      ], [{ kind: "index", storeRef: "dkt0060", offset: 2 }]),
    ],
  };

  return makeIR([mainGroup, deadkeysGroup], stores);
}

describe("integration: recognizePatterns against basic_kbdfr IR shape", () => {
  it.skipIf(!kbdfrExists)(
    "produces at least 1 S-01 Pattern and 4 S-02 Patterns with recognizedRatio > 0.5",
    () => {
      const ir = buildKbdfrIR();
      const { ir: out, recognizedRatio } = recognizePatterns(ir);

      const s01Patterns = out.recognizedPatterns.filter((p) => p.strategyId === "S-01");
      const s02Patterns = out.recognizedPatterns.filter((p) => p.strategyId === "S-02");

      expect(s01Patterns.length).toBeGreaterThanOrEqual(1);
      // basic_kbdfr has 4 deadkey families
      expect(s02Patterns.length).toBe(4);
      expect(recognizedRatio).toBeGreaterThan(0.5);
    },
  );
});

describe("integration: recognizePatterns against basic_kbdca multi-trigger IR shape", () => {
  it.skipIf(!kbdcaExists)(
    "recognizes multi-trigger S-02 pattern (2 triggers share same dk id)",
    () => {
      const ir = buildKbdcaGraveIR();
      const { ir: out } = recognizePatterns(ir);

      const s02Patterns = out.recognizedPatterns.filter((p) => p.strategyId === "S-02");
      expect(s02Patterns).toHaveLength(1);

      const pattern = s02Patterns[0]!;
      // Both trigger rules plus body plus 2 stores = 5 ownedNodes
      const ruleNodes = (pattern.ownedNodes ?? []).filter((n) => n.kind === "rule");
      expect(ruleNodes).toHaveLength(3); // 2 triggers + 1 body

      // unshifted trigger should be used
      expect(pattern.questions.find((q) => q.id === "triggerKey")?.default).toBe("[K_QUOTE]");
    },
  );
});
