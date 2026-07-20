/**
 * Fallback-posture classifier unit tests (spec 041 US1, T014).
 */

import { describe, it, expect } from "vitest";

import { parse } from "../../packages/engine/src/codec/index.js";
import { classifyFallbackPosture } from "./fallback-posture-classifier.js";
import type { FacetDefinition } from "./types.js";

const DEF = {} as FacetDefinition;
const HEADER = `store(&VERSION) '10.0'
store(&NAME) 'T'
store(&TARGETS) 'any'
store(&COPYRIGHT) '(c) 2026'
store(&KEYBOARDVERSION) '1.0'

begin Unicode > use(main)

group(main) using keys
`;
const ir = (body: string) => parse(HEADER + body, "fallback-test").ir;

/** Builder for store-declaring keyboards (the any(store) remap archetypes). */
const irStores = (stores: string, rules: string) =>
  parse(
    `store(&VERSION) '10.0'
store(&NAME) 'T'
store(&TARGETS) 'any'
store(&COPYRIGHT) '(c) 2026'
store(&KEYBOARDVERSION) '1.0'

begin Unicode > use(main)

${stores}
group(main) using keys
${rules}`,
    "fallback-test",
  ).ir;

/** A vkey store listing every letter + digit key — a comprehensive any(store) universe. */
const ALL_LETTER_DIGIT_KEYS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    .split("")
    .map((c) => `[K_${c}]`)
    .join(" ");

/** Rule every letter + digit (36 of the 47 standard keys) → comprehensive. */
function comprehensiveBody(): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const digits = "0123456789".split("");
  const lines = [
    ...letters.map((c, i) => `+ [K_${c}] > U+${(0x61 + i).toString(16).padStart(4, "0")}`),
    ...digits.map((d) => `+ [K_${d}] > U+00${(0x30 + Number(d)).toString(16)}`),
  ];
  return lines.join("\n") + "\n";
}

describe("classifyFallbackPosture", () => {
  it("few ruled keys → relies-on (most keys leak to the OS layout)", () => {
    const cat = classifyFallbackPosture(ir("+ [K_A] > U+0061\n+ [K_S] > U+0073\n"), DEF)!;
    expect(cat.value).toBe("relies-on");
    expect(cat.consistency).toBeGreaterThan(0.6);
    expect(cat.notes).toMatch(/defaulted/);
  });

  it("comprehensive key coverage → blocks-comprehensively, leaked keys are exceptions", () => {
    const cat = classifyFallbackPosture(ir(comprehensiveBody()), DEF)!;
    expect(cat.value).toBe("blocks-comprehensively");
    expect(cat.consistency).toBeLessThan(1); // a few standard keys still unruled
    expect(cat.causeTagCounts).toBeDefined();
  });

  it("no keystroke rules → null", () => {
    expect(classifyFallbackPosture(ir(""), DEF)).toBeNull();
  });

  // Regression: store-driven remaps + context-prefixed overlays used to drop to
  // undetermined (ruleVkeys saw no positional vkeys). Now they classify.

  it("context-prefixed overlay (adiga_danef) → relies-on, not undetermined", () => {
    // The bare keystroke still falls through to the base; only ";" + key remaps.
    const cat = classifyFallbackPosture(
      irStores(`store(basekey) "abcdefghij"`, `";" + any(basekey) > U+0041\n`),
      DEF,
    )!;
    expect(cat).not.toBeNull();
    expect(cat.value).toBe("relies-on");
  });

  it("unconditional any(vkey-store) covering all letter+digit keys → blocks-comprehensively", () => {
    const cat = classifyFallbackPosture(
      irStores(`store(k) ${ALL_LETTER_DIGIT_KEYS}`, `+ any(k) > U+0041\n`),
      DEF,
    )!;
    expect(cat.value).toBe("blocks-comprehensively");
  });
});
