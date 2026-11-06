// Spec 113 T027: the attribution corpus harness.
//
// For every corpus-set keyboard: parse, compile, list its layers, attribute
// every DESKTOP_ISO_GEOMETRY key in every layer, simulate the grid with an
// empty context, and verify the cells against it. This phase asserts only that
// nothing throws (the SC-002 precursor) and prints per-keyboard cell counts by
// class; the honesty assertions (SC-001, SC-002, SC-007) are added by T046.
import { beforeAll, describe, expect, it } from "vitest";
import type { LayerCombo } from "@keyboard-studio/contracts";
import { DESKTOP_ISO_GEOMETRY } from "../layout-chart/geometry.js";
import { simulateEach } from "../simulator/node.js";
import { chordToSimKeyInput } from "../validator/layer-a-prime.js";
import { buildCorpusKeyboard } from "./__fixtures__/compileCorpus.js";
import type { CorpusKeyboardBuild } from "./__fixtures__/compileCorpus.js";
import { CORPUS_SET, NO_WEB_TARGET, RELEASE_ROOT, corpusAvailable } from "./__fixtures__/corpusSet.js";
import { attributeLayer, listLayers, verifyCells } from "./index.js";
import type { CellStep, KeyCellAttribution } from "./index.js";

const VKEYS = DESKTOP_ISO_GEOMETRY.map((k) => k.id);

/** Per-class cell counts for the printed summary. */
function tally(cells: readonly KeyCellAttribution[], counts: Map<string, number>): void {
  const bump = (k: string): void => void counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const cell of cells) {
    if (cell.frame) bump("frame");
    else if (cell.unhandled) bump("unhandled");
    else if (cell.plain?.editable) bump("editable");
    else bump(`read-only:${cell.plain?.readOnlyReason ?? "?"}`);
    for (const row of cell.rows) bump(row.editable ? `row:${row.shape}` : `row-read-only:${row.readOnlyReason ?? "?"}`);
  }
}

/** The grid's empty-context steps for one layer, keyed for verifyCells. */
function gridSteps(build: CorpusKeyboardBuild, layer: LayerCombo): CellStep[] {
  const modifiers = layer.filter((m) => m !== "NCAPS");
  const inputs = VKEYS.map((vkey) => chordToSimKeyInput({ vkey, modifiers: [...modifiers] }));
  if (inputs.some((i) => i === null)) return [];
  const steps = simulateEach(build.compiled, inputs as NonNullable<(typeof inputs)[number]>[]);
  return steps.map((step, i) => ({ vkey: VKEYS[i]!, layer, step }));
}

describe("layout attribution corpus: precondition", () => {
  it("the sibling ../keyboards corpus is present", () => {
    expect(corpusAvailable, `${RELEASE_ROOT} is missing: the attribution suite proves nothing without it`).toBe(true);
  });
});

for (const entry of CORPUS_SET) {
  describe(`${entry.id} (${entry.category})`, () => {
    let build: CorpusKeyboardBuild;

    beforeAll(async () => {
      build = await buildCorpusKeyboard(entry.id);
    });

    it("attributes and verifies every key in every layer without throwing", () => {
      const counts = new Map<string, number>();
      const layers = listLayers(build.ir);
      expect(layers.length).toBeGreaterThan(0);
      for (const layer of layers) {
        const cells = attributeLayer(build.ir, layer, VKEYS);
        expect(cells).toHaveLength(VKEYS.length);
        const verified = NO_WEB_TARGET.has(entry.id) ? cells : verifyCells(cells, gridSteps(build, layer));
        tally(verified, counts);
      }
      const summary = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k}=${n}`);
      console.info(`[INFO] ${entry.id}: ${layers.length} layers; ${summary.join(" ")}`);
    });
  });
}
