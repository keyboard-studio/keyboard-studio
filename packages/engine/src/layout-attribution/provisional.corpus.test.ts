// Spec 117 T113 (SC-006): over the corpus set, every key the keyboard does not handle is provisional
// (it has no rule, so the Layout tab shows the base keyboard's proposal), and no key the author
// assigned is. Attribution alone decides this, so no compile is needed. A key is provisional exactly
// when attribution reports it `unhandled`; marking every rule as author-edited must not change which
// keys are unhandled, and an author-edited key is hand-set with a rule, so it is never unhandled.
import { describe, expect, it } from "vitest";
import { parse } from "../codec/parse.js";
import { DESKTOP_ISO_GEOMETRY } from "../layout-chart/geometry.js";
import { stripAssetStores } from "./__fixtures__/compileCorpus.js";
import { CORPUS_SET, corpusAvailable, loadCorpusKmn } from "./__fixtures__/corpusSet.js";
import { attributeLayer, listLayers } from "./index.js";

const VKEYS = DESKTOP_ISO_GEOMETRY.map((k) => k.id);

describe("SC-006 provenance over the corpus set", () => {
  it("the sibling ../keyboards corpus is present", () => {
    expect(corpusAvailable).toBe(true);
  });

  for (const entry of CORPUS_SET) {
    it(`${entry.id}: unhandled keys are exactly the provisional ones, and an author-edited key never is`, () => {
      const raw = loadCorpusKmn(entry.id);
      expect(raw, `${entry.id} is not in the corpus checkout`).toBeDefined();
      const ir = parse(stripAssetStores(raw!), entry.id).ir;
      const layers = listLayers(ir);
      const baseline = layers.map((l) => attributeLayer(ir, l, VKEYS));

      for (const group of ir.groups) {
        for (const rule of group.rules) {
          if ("context" in rule) rule.authorEdit = "layout-tab";
        }
      }
      layers.forEach((layer, i) => {
        attributeLayer(ir, layer, VKEYS).forEach((cell, j) => {
          if (cell.frame) return;
          const where = `${entry.id} [${[...layer, cell.vkey].join(" ")}]`;
          expect(cell.unhandled, where).toBe(baseline[i]![j]!.unhandled);
          if (cell.plain !== null && cell.plain.authorEdit !== undefined) {
            expect(cell.plain.provenance, where).toBe("hand-set");
            expect(cell.unhandled, where).toBe(false);
          }
        });
      });
    });
  }
});
