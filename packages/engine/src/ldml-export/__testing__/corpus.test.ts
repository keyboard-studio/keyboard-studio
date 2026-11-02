import { describe, expect, it } from "vitest";
import { CORPUS, REQUIRED_PICKS, corpusAvailable, loadCorpusKeyboard } from "./corpus.js";

describe.skipIf(!corpusAvailable)("ldml-export corpus resolver", () => {
  it("resolves every corpus keyboard from release/ or experimental/", () => {
    for (const entry of CORPUS) {
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
    expect(loadCorpusKeyboard("khmer_ldml")?.ldmlXml).toContain("<keyboard3");
    expect(loadCorpusKeyboard("ibono_chwerty")?.ldmlXml).toContain("<keyboard3");
  });

  it("the three picks have the features they were chosen for", () => {
    const mn = loadCorpusKeyboard(REQUIRED_PICKS.mnemonic);
    expect(mn?.kmn).toMatch(/^\s*store\(&MnemonicLayout\)\s*['"]1['"]/im);
    const pk = loadCorpusKeyboard(REQUIRED_PICKS.postKeystrokeTouch);
    expect(pk?.kmn).toMatch(/^\s*begin\s+PostKeystroke/im);
    expect(pk?.touchLayout).toBeTruthy();
    const op = loadCorpusKeyboard(REQUIRED_PICKS.optionStores);
    expect(op?.kmn).toMatch(/^\s*if\(\w+\s*=\s*'/m);
    expect(op?.kmn).toMatch(/set\(\w+\s*=\s*'/);
  });
});
