// Spec 113 T011: simulateEach parity over the fixed corpus set.
//
// For every corpus-set keyboard, every key of DESKTOP_ISO_GEOMETRY in every
// layer listLayers returns: simulateEach's step equals the single trace step of
// a per-key simulate() (output text and fired rule). Nothing in the Layout tab
// consumes simulateEach until this suite is green (plan risk). Also pins the
// plan's performance goal: a full grid over 8 layers in under 200 ms.
import { beforeAll, describe, expect, it } from "vitest";
import type { LayerCombo, SimKeyInput } from "@keyboard-studio/contracts";
import { DESKTOP_ISO_GEOMETRY } from "../layout-chart/geometry.js";
import { listLayers } from "../layout-attribution/index.js";
import { buildCorpusKeyboard } from "../layout-attribution/__fixtures__/compileCorpus.js";
import type { CorpusKeyboardBuild } from "../layout-attribution/__fixtures__/compileCorpus.js";
import { CORPUS_SET, NO_WEB_TARGET, RELEASE_ROOT, corpusAvailable } from "../layout-attribution/__fixtures__/corpusSet.js";
import { chordToSimKeyInput } from "../validator/layer-a-prime.js";
import { simulate, simulateEach } from "./node.js";

/** Every grid key in `layer` as a simulator input. CAPS maps to `caps`; NCAPS is the default state. */
function gridInputs(layer: LayerCombo): SimKeyInput[] {
  const modifiers = layer.filter((m) => m !== "NCAPS");
  return DESKTOP_ISO_GEOMETRY.map((k) => {
    const input = chordToSimKeyInput({ vkey: k.id, modifiers: [...modifiers] });
    if (input === null) throw new Error(`no simulator mapping for [${modifiers.join(" ")} ${k.id}]`);
    return input;
  });
}

describe("simulateEach corpus parity: precondition", () => {
  it("the sibling ../keyboards corpus is present", () => {
    expect(corpusAvailable, `${RELEASE_ROOT} is missing: the parity suite proves nothing without it`).toBe(true);
  });
});

for (const entry of CORPUS_SET) {
  describe(`${entry.id} (${entry.category})`, () => {
    let build: CorpusKeyboardBuild;

    beforeAll(async () => {
      build = await buildCorpusKeyboard(entry.id);
    });

    it("compiles, with a .js exactly when it has a web target", () => {
      expect(build.compiled.success, `${entry.id} must compile`).toBe(true);
      const hasJs = build.compiled.artifacts.some((a) => a.filename.endsWith(".js"));
      expect(hasJs, `${entry.id}: NO_WEB_TARGET is stale`).toBe(!NO_WEB_TARGET.has(entry.id));
    });

    it.skipIf(NO_WEB_TARGET.has(entry.id))("every grid key in every layer matches per-key simulate()", () => {
      const mismatches: string[] = [];
      for (const layer of listLayers(build.ir)) {
        const inputs = gridInputs(layer);
        const steps = simulateEach(build.compiled, inputs);
        inputs.forEach((input, i) => {
          const expected = simulate(build.compiled, [input]).trace[0]!;
          const got = steps[i]!;
          if (got.outputAfter !== expected.outputAfter || JSON.stringify(got.firedRule) !== JSON.stringify(expected.firedRule)) {
            mismatches.push(`[${[...layer, input.vkey].join(" ")}]: ${JSON.stringify(got.outputAfter)} vs ${JSON.stringify(expected.outputAfter)}`);
          }
        });
      }
      expect(mismatches).toEqual([]);
    });
  });
}

describe("simulateEach performance goal", () => {
  it("a full ISO grid over 8 layers completes under 200 ms", async () => {
    const build = await buildCorpusKeyboard("sil_cameroon_qwerty");
    const layers: LayerCombo[] = [[], ["SHIFT"], ["RALT"], ["SHIFT", "RALT"], ["CAPS"], ["SHIFT", "CAPS"], ["CTRL"], ["LALT"]];
    const inputs = layers.flatMap((layer) => gridInputs(layer));
    simulateEach(build.compiled, inputs.slice(0, 1)); // warm the instrumented-script cache
    const start = performance.now();
    const steps = simulateEach(build.compiled, inputs);
    const elapsed = performance.now() - start;
    expect(steps).toHaveLength(inputs.length);
    expect(elapsed, `${inputs.length} keystrokes took ${elapsed.toFixed(0)} ms`).toBeLessThan(200);
  });
});
