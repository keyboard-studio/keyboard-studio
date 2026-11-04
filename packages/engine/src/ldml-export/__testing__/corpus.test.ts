import { describe, expect, it } from "vitest";
import {
  CORPUS,
  corpusAvailable,
  experimentalAvailable,
  loadCorpusKeyboard,
  REQUIRED_PICKS,
  resolvableCorpusEntries,
} from "./corpus.js";

describe.skipIf(!corpusAvailable)("ldml-export corpus resolver", () => {
  it("resolves every corpus keyboard from release/ or experimental/", () => {
    // resolvableCorpusEntries() drops experimental-only entries (khmer_ldml)
    // in CI's release-only sparse checkout; the seam test below proves the
    // drop is real, not vacuous.
    for (const entry of resolvableCorpusEntries()) {
      expect(loadCorpusKeyboard(entry.id), entry.id).toBeDefined();
    }
  });

  it("the release/experimental seam annotations match the checkout", () => {
    // Regression guard for the seam that broke CI on main (run 41480613430):
    // khmer_ldml lives in experimental/, which CI's pinned corpus does not
    // check out. In a release-only checkout the experimental-only entries
    // must genuinely be unresolvable (otherwise the skip above is vacuous);
    // in a full checkout every entry must resolve from an annotated tree.
    for (const entry of CORPUS) {
      if (!experimentalAvailable) {
        if (!entry.trees.includes("release")) {
          expect(loadCorpusKeyboard(entry.id), entry.id).toBeUndefined();
        }
      } else {
        const kb = loadCorpusKeyboard(entry.id);
        expect(kb, entry.id).toBeDefined();
        expect(entry.trees, entry.id).toContain(kb?.tree);
      }
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
    const khmer = loadCorpusKeyboard("khmer_ldml");
    if (!experimentalAvailable) {
      // CI's pinned corpus is release-only sparse; khmer_ldml is experimental-only.
      expect(khmer).toBeUndefined();
    } else {
      expect(khmer?.ldmlXml).toContain("<keyboard3");
    }
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
