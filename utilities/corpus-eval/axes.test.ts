/**
 * Axis extractor unit tests — synthetic .kmn sources parsed through the
 * real codec, so the derivations are exercised against genuine IR shapes.
 */

import { describe, expect, it } from "vitest";

import { parse } from "../../packages/engine/src/codec/index.js";
import { recognizePatterns } from "../../packages/engine/src/recognizer/index.js";
import {
  a1Band,
  deadkeyFamilies,
  deriveAxes,
  detectReplacingCycling,
  dominantScript,
  scriptClassOfScript,
} from "./axes.js";

function irOf(kmn: string) {
  const { ir } = parse(kmn, "test");
  recognizePatterns(ir);
  return ir;
}

const HEADER = `store(&VERSION) '10.0'
store(&NAME) 'Test'
store(&TARGETS) 'any'
begin Unicode > use(main)
`;

describe("a1Band", () => {
  it("bands counts at the §7.1 boundaries (contiguous at 300)", () => {
    expect(a1Band(0)).toBe("tiny");
    expect(a1Band(4)).toBe("tiny");
    expect(a1Band(5)).toBe("small");
    expect(a1Band(19)).toBe("small");
    expect(a1Band(20)).toBe("medium");
    expect(a1Band(99)).toBe("medium");
    expect(a1Band(100)).toBe("large");
    expect(a1Band(299)).toBe("large");
    expect(a1Band(300)).toBe("massive");
    expect(a1Band(5000)).toBe("massive");
  });
});

describe("scriptClassOfScript", () => {
  it("classifies the §7.1 classes and defaults unlisted scripts to alphabetic", () => {
    expect(scriptClassOfScript("Deva")).toBe("abugida");
    expect(scriptClassOfScript("Arab")).toBe("abjad");
    expect(scriptClassOfScript("Cans")).toBe("syllabary");
    expect(scriptClassOfScript("Hani")).toBe("logographic");
    expect(scriptClassOfScript("Latn")).toBe("alphabetic");
    expect(scriptClassOfScript("Grek")).toBe("alphabetic");
  });
});

const SWAP_KMN = `${HEADER}
group(main) using keys
+ [K_E] > U+025B
+ [K_O] > U+0254
+ [K_A] > 'a'
`;

const DEADKEY_KMN = `${HEADER}
store(dkf0300) U+0061 U+0065
store(dkt0300) U+0300 U+0300
store(dkf0301) U+0061 U+0065
store(dkt0301) U+0301 U+0301
group(main) using keys
+ [K_A] > dk(0300)
+ [K_E] > dk(0301)
group(deadkeys)
dk(0300) + any(dkf0300) > index(dkt0300,2)
dk(0301) + any(dkf0301) > index(dkt0301,2)
`;

describe("dominantScript", () => {
  it("reads Greek content as Grek", () => {
    const ir = irOf(`${HEADER}
group(main) using keys
+ [K_A] > U+03B1
+ [K_B] > U+03B2
+ [K_G] > U+03B3
`);
    expect(dominantScript(ir)).toBe("Grek");
  });
});

describe("deadkeyFamilies + A4 derivation", () => {
  it("counts distinct deadkeys consumed in rule contexts", () => {
    const ir = irOf(DEADKEY_KMN);
    expect(deadkeyFamilies(ir).size).toBe(2);
  });

  it("two deadkey families derive multi-family", () => {
    const derived = deriveAxes(irOf(DEADKEY_KMN));
    expect(derived.axes.diacriticBehavior).toBe("multi-family");
  });

  it("a swap-only keyboard derives A4 none and addition posture", () => {
    const derived = deriveAxes(irOf(SWAP_KMN));
    expect(derived.axes.diacriticBehavior).toBe("none");
    expect(derived.axes.scriptClass).toBe("alphabetic");
    // 2 added chars (ɛ, ɔ) beyond the stock layout.
    expect(derived.addedChars).toBe(2);
    expect(derived.axes.scale).toBe("tiny");
  });
});

describe("detectReplacingCycling", () => {
  it("fires on the tone-key replacement shape", () => {
    // 's' after 'a' → á ; 's' after 'á' → a different (replaced) form.
    const ir = irOf(`${HEADER}
group(main) using keys
'a' + 's' > U+00E1
U+00E1 + 's' > U+1EA5
`);
    expect(detectReplacingCycling(ir)).toBe(true);
  });

  it("does not fire on deadkey composition", () => {
    expect(detectReplacingCycling(irOf(DEADKEY_KMN))).toBe(false);
  });

  it("does not fire on a punctuation doubling/escape rule (sil_euro_latin shape)", () => {
    const ir = irOf(`${HEADER}
group(main) using keys
+ [SHIFT K_COMMA] > U+00AB
U+00AB + '<' > '<<'
`);
    expect(detectReplacingCycling(ir)).toBe(false);
  });

  it("does not fire on a bare-mark picker (sil_ipa '*' shape)", () => {
    // Pressing * swaps one bare combining mark for the next — a mark
    // picker over standalone marks, not base-mark cycling.
    const ir = irOf(`${HEADER}
group(main) using keys
+ '*' > U+033D
U+033D + '*' > U+0306
U+0306 + '*' > U+0307
`);
    expect(detectReplacingCycling(ir)).toBe(false);
  });

  it("does not fire on plain swaps", () => {
    expect(detectReplacingCycling(irOf(SWAP_KMN))).toBe(false);
  });
});

describe("deriveAxes completeness", () => {
  it("always returns a complete vector (prior fills the underived axes)", () => {
    const derived = deriveAxes(irOf(SWAP_KMN));
    expect(derived.axes.multiMode).toBe("single");
    // multiMode was prior-filled, and the fill is on record.
    expect(derived.axisFills.map((f) => f.axis)).toContain("multiMode");
    // Derived axes are never prior fills.
    expect(derived.axisFills.map((f) => f.axis)).not.toContain("diacriticBehavior");
  });
});
