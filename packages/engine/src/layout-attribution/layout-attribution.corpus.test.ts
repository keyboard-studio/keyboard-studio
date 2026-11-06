// Spec 113 T027 / T046: the attribution corpus harness.
//
// For every corpus-set keyboard: parse, compile, list its layers, attribute
// every DESKTOP_ISO_GEOMETRY key in every layer, simulate the grid with an
// empty context, and verify the cells against it. Asserts the honesty rule
// (SC-001, SC-002) and prints per-keyboard cell counts by class.
import { beforeAll, describe, expect, it } from "vitest";
import type { LayerCombo } from "@keyboard-studio/contracts";
import { DESKTOP_ISO_GEOMETRY } from "../layout-chart/geometry.js";
import { simulateEach } from "../simulator/node.js";
import { chordToSimKeyInput } from "../validator/layer-a-prime.js";
import { buildCorpusKeyboard } from "./__fixtures__/compileCorpus.js";
import type { CorpusKeyboardBuild } from "./__fixtures__/compileCorpus.js";
import { CORPUS_SET, NO_WEB_TARGET, RELEASE_ROOT, corpusAvailable } from "./__fixtures__/corpusSet.js";
import { attributeLayer, isMnemonic, listLayers, verifyCells } from "./index.js";
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

    // SC-002: every keyboard opens. SC-001: no editable cell, in any listed layer, shows
    // anything but what the compiled keyboard types with an empty context; every cell
    // that does not match is read-only with a reason. Mnemonic keyboards are read-only.
    it("opens, and every editable cell matches the compiled keyboard (SC-001, SC-002)", () => {
      const counts = new Map<string, number>();
      const dishonest: string[] = [];
      const unexplained: string[] = [];
      const layers = listLayers(build.ir);
      expect(layers.length).toBeGreaterThan(0);
      const mnemonic = isMnemonic(build.ir);
      for (const layer of layers) {
        const cells = attributeLayer(build.ir, layer, VKEYS);
        expect(cells).toHaveLength(VKEYS.length);
        // A keyboard with no web build has nothing to verify against: the studio shows it
        // not-compiled (research R2, owner ruling), so the honesty check needs the steps.
        const steps = NO_WEB_TARGET.has(entry.id) ? [] : gridSteps(build, layer);
        const verified = steps.length === 0 ? cells : verifyCells(cells, steps);
        tally(verified, counts);
        for (const cell of verified) {
          const where = `[${[...layer, cell.vkey].join(" ")}]`;
          for (const row of [cell.plain, ...cell.rows]) {
            if (row === null) continue;
            if (mnemonic && row.editable) dishonest.push(`${where}: editable on a mnemonic keyboard`);
            if (!row.editable && row.readOnlyReason === undefined) unexplained.push(`${where} ${row.ruleNodeId}`);
          }
          const step = steps.find((s) => s.vkey === cell.vkey)?.step;
          const plain = cell.plain;
          if (step === undefined || plain === null || !plain.editable) continue;
          const shown = plain.output;
          const matches =
            shown !== null && !Array.isArray(shown) && "kind" in shown
              ? shown.kind === "text"
                ? step.outputAfter === shown.text
                : shown.kind === "nul"
                  ? step.outputAfter === ""
                  : step.outputAfter === "" && step.pendingDeadkeys.length === 1
              : false;
          if (!matches) dishonest.push(`${where}: shows ${JSON.stringify(shown)}, types ${JSON.stringify(step.outputAfter)}`);
        }
      }
      const summary = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k}=${n}`);
      console.info(`[INFO] ${entry.id}: ${layers.length} layers; ${summary.join(" ")}`);
      expect(dishonest).toEqual([]);
      expect(unexplained).toEqual([]);
    });
  });
}
