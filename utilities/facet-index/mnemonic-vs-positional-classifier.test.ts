/**
 * Mnemonic-vs-positional classifier unit tests (spec 041 US1, T015).
 */

import { describe, it, expect } from "vitest";

import { parse } from "../../packages/engine/src/codec/index.js";
import { classifyMnemonicVsPositional } from "./mnemonic-vs-positional-classifier.js";
import type { FacetDefinition } from "./types.js";

const DEF = {} as FacetDefinition;

function ir(mnemonic: boolean) {
  const kmn = `store(&VERSION) '10.0'
store(&NAME) 'T'
${mnemonic ? "store(&MNEMONICLAYOUT) '1'\n" : ""}store(&TARGETS) 'any'
store(&COPYRIGHT) '(c) 2026'
store(&KEYBOARDVERSION) '1.0'

begin Unicode > use(main)

group(main) using keys

+ [K_A] > U+0061
`;
  return parse(kmn, "mvp-test").ir;
}

describe("classifyMnemonicVsPositional", () => {
  it("&MNEMONICLAYOUT '1' → mnemonic, tagged as gate", () => {
    const cat = classifyMnemonicVsPositional(ir(true), DEF)!;
    expect(cat.value).toBe("mnemonic");
    expect(cat.notes).toMatch(/gate/i);
    expect(cat.consistency).toBe(1);
  });

  it("no &MNEMONICLAYOUT → positional, tagged as gate", () => {
    const cat = classifyMnemonicVsPositional(ir(false), DEF)!;
    expect(cat.value).toBe("positional");
    expect(cat.notes).toMatch(/gate/i);
  });
});
