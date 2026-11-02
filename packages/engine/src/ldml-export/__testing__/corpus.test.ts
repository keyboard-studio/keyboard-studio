import { describe, expect, it } from "vitest";
import {
  CORPUS,
  REQUIRED_PICKS,
  corpusAvailable,
  experimentalAvailable,
  loadCorpusKeyboard,
  resolvesFromRelease,
} from "./corpus.js";

/**
 * True when a corpus id cannot resolve in this checkout by construction:
 * the entry lives outside release/ and the checkout has no experimental/
 * tree (CI checks out release/ only). Such entries are skipped, never
 * failed — a release/ entry that fails to resolve is still a hard failure.
 */
function unavailableInThisCheckout(id: string): boolean {
  return !experimentalAvailable && !resolvesFromRelease(id);
}

describe.skipIf(!corpusAvailable)("ldml-export corpus resolver", () => {
  it("resolves every corpus keyboard from release/ or experimental/", () => {
    for (const entry of CORPUS) {
      if (unavailableInThisCheckout(entry.id)) continue;
      expect(loadCorpusKeyboard(entry.id), entry.id).toBeDefined();
    }
  });

  it("loads kmn, touch layout and kvks where a keyboard has them", () => {
    const kb = loadCorpusKeyboard("basic_kbdus");
    expect(kb?.tree).toBe("release");
    expect(kb?.kmn).toContain("begin Unicode");
    expect(kb?.touchLayout).toBeTruthy();
    expect(kb?.kvks).toBeTruthy();
  });

  it("finds the hand-written LDML beside khmer_ldml and ibono_chwerty", () => {
    expect(loadCorpusKeyboard("ibono_chwerty")?.ldmlXml).toContain("<keyboard3");
    if (unavailableInThisCheckout("khmer_ldml")) return;
    expect(loadCorpusKeyboard("khmer_ldml")?.ldmlXml).toContain("<keyboard3");
  });

  it("the three picks have the features they were chosen for", () => {
    const mn = loadCorpusKeyboard(REQUIRED_PICKS.mnemonic);
    if (!unavailableInThisCheckout(REQUIRED_PICKS.mnemonic)) {
      expect(mn?.kmn).toMatch(/^\s*store\(&MnemonicLayout\)\s*['"]1['"]/im);
    }
    const pk = loadCorpusKeyboard(REQUIRED_PICKS.postKeystrokeTouch);
    if (!unavailableInThisCheckout(REQUIRED_PICKS.postKeystrokeTouch)) {
      expect(pk?.kmn).toMatch(/^\s*begin\s+PostKeystroke/im);
      expect(pk?.touchLayout).toBeTruthy();
    }
    const op = loadCorpusKeyboard(REQUIRED_PICKS.optionStores);
    if (!unavailableInThisCheckout(REQUIRED_PICKS.optionStores)) {
      expect(op?.kmn).toMatch(/^\s*if\(\w+\s*=\s*'/m);
      expect(op?.kmn).toMatch(/set\(\w+\s*='/);
    }
  });
});
