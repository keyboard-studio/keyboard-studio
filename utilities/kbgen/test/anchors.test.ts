// Unit checks for the anchor cascade: each special character must resolve to the
// expected base-layout key, via the expected signal.
import { describe, it, expect } from "vitest";
import { getLayout } from "../layout.js";
import { analyzeChar, scoreAnchors, parseName, availability } from "../analyze.js";
import { plan, checkComplete } from "../place.js";

const layout = getLayout("us");

// --- name parser ---
describe("parseName", () => {
  it('parseName "B WITH HOOK" -> base b, mod HOOK', () => {
    const r = parseName("LATIN SMALL LETTER B WITH HOOK");
    expect(r.base).toBe("b");
    expect(r.mods).toContain("HOOK");
  });

  it('parseName "OPEN E" -> base e', () => {
    expect(parseName("LATIN SMALL LETTER OPEN E").base).toBe("e");
  });

  it('parseName "ENG" -> no base letter', () => {
    expect(parseName("LATIN SMALL LETTER ENG").base).toBe(null);
  });
});

// --- anchor expectations: char -> [expectedKey, expectedVia] ---
const EXPECT: Record<string, [string, string]> = {
  "ɓ": ["K_B", "NAME"], "Ɓ": ["K_B", "NAME"],
  "ɗ": ["K_D", "NAME"], "Ɗ": ["K_D", "NAME"],
  "ƙ": ["K_K", "NAME"], "Ƙ": ["K_K", "NAME"],
  "ɛ": ["K_E", "NAME"], "ɔ": ["K_O", "NAME"],
  "ʋ": ["K_V", "NAME"], "ɲ": ["K_N", "NAME"],
  "ŋ": ["K_N", "VISUAL"],              // ENG: no name base, not in confusables -> supplement
  "ʒ": ["K_Z", "VISUAL"],              // EZH: confusable chain has no ASCII base -> supplement
  "ɣ": ["K_Y", "CONFUSABLE"],          // GAMMA -> y via real confusables.txt skeleton
  "ə": ["K_E", "VISUAL"],              // SCHWA: confusable -> turned-e (non-ASCII) -> supplement
};

describe("anchor cascade", () => {
  for (const [ch, [key, via]] of Object.entries(EXPECT)) {
    it(`anchor ${ch} -> ${key} via ${via}`, () => {
      const top = scoreAnchors(analyzeChar(ch), layout)[0];
      expect(top).toBeTruthy();
      expect(top?.key).toBe(key);
      expect(top?.via).toBe(via);
    });
  }

  // --- decomposition signal: precomposed accents anchor on their base letter ---
  it("é (precomposed) -> K_E via DECOMPOSITION", () => {
    const top = scoreAnchors(analyzeChar("é"), layout)[0];
    expect(top?.key).toBe("K_E");
    expect(top?.via).toBe("DECOMPOSITION");
  });
});

// --- placement + completeness (Hausa-style inventory) ---
describe("placement", () => {
  it("Hausa inventory places losslessly", () => {
    const chars = [..."ɓƁɗƊƙƘ"];
    const used = [..."abɓcdɗefghijkƙlmnoprstuwyz"]; // q, v, x free
    const layout2 = getLayout("us");
    const free = availability(layout2, used);
    const pr = plan(chars, layout2, free, {});
    const comp = checkComplete(pr, layout2, chars);
    expect(comp.complete).toBe(true);
    // ɓ anchors on B (occupied) -> RALT, never displaces b.
    const b = pr.placements.find((p) => p.ch === "ɓ");
    expect(b?.anchorKey).toBe("K_B");
    expect(b?.mechanism).toBe("ralt");
  });

  // --- case pairs must share one anchor key (ɣ has a confusables entry, Ɣ does not) ---
  it("case pair ɣ/Ɣ lands on the same key", () => {
    const free = availability(layout, [..."abcdefghijklmnorstuwyz"]);
    const pr = plan([..."ɣƔ"], layout, free, {});
    const lo = pr.placements.find((p) => p.ch === "ɣ");
    const up = pr.placements.find((p) => p.ch === "Ɣ");
    expect(lo).toBeTruthy();
    expect(up).toBeTruthy();
    expect(lo?.anchorKey).toBe(up?.anchorKey);
  });
});
