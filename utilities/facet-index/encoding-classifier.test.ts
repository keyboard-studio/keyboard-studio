/**
 * Encoding classifier unit tests (spec 041 US1, T013). Spelling is read from the
 * `.kmn` source text (the IR normalizes it away), so tests build a ScannedKeyboard
 * carrying `kmnText`.
 */

import { describe, it, expect } from "vitest";

import { parse } from "../../packages/engine/src/codec/index.js";
import { classifyEncoding } from "./encoding-classifier.js";
import type { FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

const DEF = {} as FacetDefinition;
const HEADER = `store(&VERSION) '10.0'
store(&NAME) 'T'
store(&TARGETS) 'any'
store(&COPYRIGHT) '(c) 2026'
store(&KEYBOARDVERSION) '1.0'

begin Unicode > use(main)

group(main) using keys
`;

function build(body: string) {
  const kmnText = HEADER + body;
  const ir = parse(kmnText, "encoding-test").ir;
  const kb = { id: "encoding-test", kmnText } as ScannedKeyboard;
  return { ir, kb };
}

describe("classifyEncoding", () => {
  it("mixed quoted + u-notation output → both tags in value, distribution present", () => {
    const { ir, kb } = build("+ [K_A] > 'a'\n+ [K_S] > U+0073\n+ [K_D] > 'd'\n");
    const cat = classifyEncoding(ir, DEF, kb)!;
    expect(cat.value).toEqual(expect.arrayContaining(["quoted-literal", "u-notation", "bare-vk"]));
    expect(cat.distribution).toBeDefined();
    const sum = Object.values(cat.distribution!).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it("named modifier on the key → named-modifier tag; two modifiers → split-modifier", () => {
    const { ir, kb } = build("+ [SHIFT K_A] > U+0041\n+ [NCAPS SHIFT K_B] > U+0042\n");
    const cat = classifyEncoding(ir, DEF, kb)!;
    expect(cat.value).toEqual(expect.arrayContaining(["named-modifier", "split-modifier"]));
    expect(cat.subProfile!.input).toEqual({ matchKind: "key-ref" });
  });

  it("all distribution keys are within the encoding value set", () => {
    const { ir, kb } = build("+ [K_A] > 'a'\n+ [SHIFT K_B] > U+0042\n");
    const cat = classifyEncoding(ir, DEF, kb)!;
    const allowed = new Set(["bare-vk", "named-modifier", "split-modifier", "quoted-literal", "u-notation"]);
    for (const k of Object.keys(cat.distribution!)) expect(allowed.has(k)).toBe(true);
  });

  it("no kmn text → null", () => {
    const ir = parse(HEADER + "+ [K_A] > 'a'\n", "x").ir;
    expect(classifyEncoding(ir, DEF, { id: "x", kmnText: null } as ScannedKeyboard)).toBeNull();
  });
});
