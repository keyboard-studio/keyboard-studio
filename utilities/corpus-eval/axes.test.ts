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

describe("A3 phonetic-intuition derivation (#2278)", () => {
  it("a Latin-content keyboard derives A3 weak — Latin content alone is not phonetic intuition", () => {
    // Before #2278 this derived "strong" from the Latin dominant script,
    // routing Latin keyboards to S-05 via rule 5; the recognizer reads S-02.
    const derived = deriveAxes(irOf(SWAP_KMN));
    expect(derived.dominantScript).toBe("Latn");
    expect(derived.axes.phoneticIntuition).toBe("weak");
  });

  it("a Latin deadkey keyboard derives A3 weak", () => {
    // The deadkey fixture's produced set carries no script evidence at all
    // (deadkey/index outputs only), so this also pins weak-by-default.
    expect(deriveAxes(irOf(DEADKEY_KMN)).axes.phoneticIntuition).toBe("weak");
  });

  it("a &MNEMONICLAYOUT declaration derives A3 strong", () => {
    const mnemonicKmn = `store(&VERSION) '10.0'
store(&NAME) 'Test'
store(&TARGETS) 'any'
store(&MNEMONICLAYOUT) '1'
begin Unicode > use(main)
group(main) using keys
+ [K_E] > U+025B
+ [K_O] > U+0254
+ [K_A] > 'a'
`;
    expect(deriveAxes(irOf(mnemonicKmn)).axes.phoneticIntuition).toBe("strong");
  });

  it("a postfix shape on a NON-alphabetic keyboard does NOT derive A3 strong (#2278)", () => {
    // The bj_cree family carries the postfix index shape over Canadian
    // Aboriginal syllabics; that is syllabic sequencing, not Latin
    // mark-input order, and must not imply phonetic intuition. The
    // detection itself is still recorded (markInputOrder postfix) — only
    // its promotion to A3 is gated on the alphabetic script class.
    const cansPostfixKmn = `store(&VERSION) '10.0'
store(&NAME) 'Test'
store(&TARGETS) 'any'
store(base) U+1401 U+1402 U+1403
store(marked) U+1404 U+1405 U+1406
begin Unicode > use(Unicode)
group(Unicode) using keys
if(option_key = '') any(base) + "x" > index(marked,2)
`;
    const derived = deriveAxes(irOf(cansPostfixKmn));
    expect(derived.axes.markInputOrder).toBe("postfix");
    expect(derived.axes.scriptClass).toBe("syllabary");
    expect(derived.axes.phoneticIntuition).toBe("weak");
  });

  it("a detected postfix mark-input shape derives A3 strong (with markInputOrder postfix)", () => {
    // Trimmed sil_ipa shape: any(base) + trigger > index(marked, 1).
    // A3a is gated on A3=strong in §7.1, so a detected postfix shape
    // presupposes strong — without it rule 3a could never fire here.
    const postfixKmn = `store(&VERSION) '10.0'
store(&NAME) 'Test'
store(&TARGETS) 'any'
store(equalD) "b" "d" "g"
store(equalU) U+0253 U+0257 U+0260
begin Unicode > use(Unicode)
group(Unicode) using keys
any(equalD) + "=" > index(equalU,1)
`;
    const derived = deriveAxes(irOf(postfixKmn));
    expect(derived.axes.phoneticIntuition).toBe("strong");
    expect(derived.axes.markInputOrder).toBe("postfix");
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
