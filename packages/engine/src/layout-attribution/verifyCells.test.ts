import { describe, expect, it } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { LayerCombo, SimulationStep } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { compile } from "../compiler/index.js";
import { simulateEach } from "../simulator/node.js";
import { attributeLayer } from "./attributeLayer.js";
import type { KeyCellAttribution, RowAttribution } from "./types.js";
import { verifyCells } from "./verifyCells.js";
import type { CellStep } from "./verifyCells.js";

function step(outputAfter: string, pendingDeadkeys = 0): SimulationStep {
  return {
    input: { vkey: "K_A", modifiers: [] },
    outputAfter,
    pendingDeadkeys: Array.from({ length: pendingDeadkeys }, (_, i) => ({ id: i + 1, position: 0 })),
    beep: false,
  };
}

function plainRow(output: RowAttribution["output"], extra: Partial<RowAttribution> = {}): RowAttribution {
  return { ruleNodeId: "rule#0", shape: "context-free", context: [], output, editable: true, provenance: "starting-point", ...extra };
}

function cellOf(plain: RowAttribution | null, rows: RowAttribution[] = [], vkey = "K_A"): KeyCellAttribution {
  return { vkey, layer: [], plain, rows, unhandled: plain === null, frame: false };
}

const at = (s: SimulationStep, extra: Partial<CellStep> = {}): CellStep => ({ vkey: "K_A", layer: [], step: s, ...extra });

describe("verifyCells (pure)", () => {
  it("keeps an editable plain whose simulated output equals its own", () => {
    const [c] = verifyCells([cellOf(plainRow({ kind: "text", text: "x" }))], [at(step("x"))]);
    expect(c!.plain).toMatchObject({ editable: true });
  });

  it("demotes a plain whose simulated output differs to later-group-change", () => {
    const [c] = verifyCells([cellOf(plainRow({ kind: "text", text: "x" }))], [at(step("y"))]);
    expect(c!.plain).toMatchObject({ editable: false, readOnlyReason: "later-group-change" });
  });

  it("checks nul (nothing, no deadkey) and deadkey (nothing typed, one pending) outputs", () => {
    const nul = verifyCells([cellOf(plainRow({ kind: "nul" }))], [at(step("q"))])[0]!;
    expect(nul.plain?.editable).toBe(false);
    const nulOk = verifyCells([cellOf(plainRow({ kind: "nul" }))], [at(step(""))])[0]!;
    expect(nulOk.plain?.editable).toBe(true);
    const dk = plainRow({ kind: "deadkey", deadkeyId: "acute" });
    expect(verifyCells([cellOf(dk)], [at(step("", 1))])[0]!.plain?.editable).toBe(true);
    expect(verifyCells([cellOf(dk)], [at(step(""))])[0]!.plain?.editable).toBe(false);
  });

  it("verifies a row against the step seeded with its own context, not the plain step", () => {
    const row = plainRow([{ kind: "text", text: "ñ" }], {
      ruleNodeId: "rule#1",
      shape: "literal-context",
      context: [{ kind: "text", text: "n" }],
    });
    const cell = cellOf(plainRow({ kind: "text", text: "x" }), [row]);
    const steps = [at(step("x")), at(step("n"), { context: [{ kind: "text", text: "n" }] })];
    const [c] = verifyCells([cell], steps);
    expect(c!.plain?.editable).toBe(true);
    expect(c!.rows[0]).toMatchObject({ editable: false, readOnlyReason: "later-group-change" });
  });

  it("leaves rows and cells without a step, read-only rows, and frame cells unchanged", () => {
    const ro = plainRow(null, { editable: false, readOnlyReason: "store-based" });
    const noStep = cellOf(plainRow({ kind: "text", text: "x" }), [ro]);
    const frame: KeyCellAttribution = { vkey: "K_TAB", layer: [], plain: null, rows: [], unhandled: false, frame: true };
    const out = verifyCells([noStep, frame], [at(step("zzz"), { vkey: "K_B" })]);
    expect(out[0]).toEqual(noStep);
    expect(out[1]).toEqual(frame);
  });

  it("does not mutate its input", () => {
    const cell = cellOf(plainRow({ kind: "text", text: "x" }));
    verifyCells([cell], [at(step("y"))]);
    expect(cell.plain?.editable).toBe(true);
  });

  it("demotes when the fired-rule check says another rule fired", () => {
    const cell = cellOf(plainRow({ kind: "text", text: "x" }));
    expect(verifyCells([cell], [at(step("x"))], () => true)[0]!.plain?.editable).toBe(true);
    expect(verifyCells([cell], [at(step("x"))], () => false)[0]!.plain).toMatchObject({
      editable: false,
      readOnlyReason: "later-group-change",
    });
  });

  it("matches a step's layer as a set", () => {
    const cell: KeyCellAttribution = { ...cellOf(plainRow({ kind: "text", text: "x" })), layer: ["SHIFT", "RALT"] };
    const layer: LayerCombo = ["RALT", "SHIFT"];
    expect(verifyCells([cell], [at(step("y"), { layer })])[0]!.plain?.editable).toBe(false);
  });
});

describe("verifyCells with a normalisation group (compiled keyboard)", () => {
  const KMN = `store(&VERSION) '10.0'
store(&NAME) 'Norm'
store(&TARGETS) 'any'
begin Unicode > use(main)
group(main) using keys
+ [K_A] > 'a'
+ [K_B] > 'b'
match > use(norm)
group(norm)
'a' > 'z'
`;

  it("demotes the key whose output a later group rewrites and keeps the others", async () => {
    const compiled = await compile(createVirtualFS([{ path: "source/norm.kmn", content: KMN, isBinary: false }]), "norm");
    expect(compiled.success, "fixture must compile").toBe(true);
    const ir = parse(KMN, "norm").ir;
    const cells = attributeLayer(ir, [], ["K_A", "K_B"]);
    expect(cells.map((c) => c.plain?.editable)).toEqual([true, true]);

    const inputs = cells.map((c) => ({ vkey: c.vkey, modifiers: [] as never[] }));
    const steps = simulateEach(compiled, inputs);
    const cellSteps: CellStep[] = cells.map((c, i) => ({ vkey: c.vkey, layer: c.layer, step: steps[i]! }));
    const out = verifyCells(cells, cellSteps);
    expect(out[0]!.plain).toMatchObject({ editable: false, readOnlyReason: "later-group-change" });
    expect(out[1]!.plain).toMatchObject({ editable: true });
  }, 60_000);
});
