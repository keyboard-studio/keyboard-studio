// Spec 117 T027 / T046: the attribution corpus harness.
//
// For every corpus-set keyboard: parse, compile, list its layers, attribute
// every DESKTOP_ISO_GEOMETRY key in every layer, simulate the grid with an
// empty context, and verify the cells against it. Asserts the honesty rule
// (SC-001, SC-002) and prints per-keyboard cell counts by class.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isPlusSeparator } from "@keyboard-studio/contracts";
import type { KeyboardIR, LayerCombo, LayoutContext, SimulationStep, SimulatorContextSeed } from "@keyboard-studio/contracts";
import { DESKTOP_ISO_GEOMETRY, isFrameKey } from "../layout-chart/geometry.js";
import { simulateEach } from "../simulator/node.js";
import { chordToSimKeyInput } from "../validator/layer-a-prime.js";
import { buildCorpusKeyboard } from "./__fixtures__/compileCorpus.js";
import type { CorpusKeyboardBuild } from "./__fixtures__/compileCorpus.js";
import { CORPUS_SET, NO_WEB_TARGET, RELEASE_ROOT, corpusAvailable } from "./__fixtures__/corpusSet.js";
import { classifyEntryRules } from "./entryRules.js";
import { attributeLayer, findShadowedRules, isMnemonic, listLayers, verifyCells } from "./index.js";
import type { CellStep, KeyCellAttribution, RowAttribution } from "./index.js";

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

/**
 * The simulator seed for a context. A named deadkey has no number until the compiler assigns
 * one, so `ids` carries the numbers observed by simulating the keys that produce each deadkey;
 * a numbered one falls back to its own hex id. Null when a deadkey cannot be placed.
 */
function seedFor(context: LayoutContext, ids: ReadonlyMap<string, number>): SimulatorContextSeed | null {
  let text = "";
  const pendingDeadkeys: Array<{ id: number; position: number }> = [];
  for (const el of context) {
    if (el.kind === "text") {
      text += el.text;
      continue;
    }
    const id = ids.get(el.deadkeyId.toLowerCase()) ?? (/^[0-9a-f]+$/i.test(el.deadkeyId) ? parseInt(el.deadkeyId, 16) : undefined);
    if (id === undefined) return null;
    pendingDeadkeys.push({ id, position: Array.from(text).length });
  }
  return pendingDeadkeys.length > 0 ? { text, pendingDeadkeys } : { text };
}

/** What a row says its context plus keystroke become, as text and a pending-deadkey count. */
function rowWants(row: RowAttribution): { text: string; deadkeys: number } | null {
  const out = row.output;
  if (out === null) return null;
  if (!Array.isArray(out)) {
    const o = out as { kind: string; text?: string };
    return o.kind === "text" ? { text: o.text ?? "", deadkeys: 0 } : o.kind === "nul" ? { text: "", deadkeys: 0 } : { text: "", deadkeys: 1 };
  }
  let text = "";
  let deadkeys = 0;
  for (const el of out as LayoutContext) {
    if (el.kind === "text") text += el.text;
    else deadkeys += 1;
  }
  return { text, deadkeys };
}

describe("layout attribution corpus: precondition", () => {
  it("the sibling ../keyboards corpus is present", () => {
    expect(corpusAvailable, `${RELEASE_ROOT} is missing: the attribution suite proves nothing without it`).toBe(true);
  });
});

/** The editable share of one keyboard's entry-group rules (SC-009), for the printed baseline. */
interface ShareRow {
  id: string;
  category: string;
  rules: number;
  editable: number;
  /** True when no rule is in an FR-013 read-only shape (so 100% is required). */
  noReadOnlyShapes: boolean;
}
const shares: ShareRow[] = [];

/**
 * True when the entry group has a rule in an FR-013 read-only shape, found from the IR's element
 * kinds rather than from the classifier: a store (`any`, `notany`, `index`, `outs`), `context()`,
 * `beep`, `use()`, a condition or other raw element, a match/nomatch rule, an opaque fragment in
 * the group, a readonly group, or a rule that can never fire (a second rule for one keystroke).
 */
function hasReadOnlyShapes(ir: KeyboardIR): boolean {
  const group = classifyEntryRules(ir)[0]?.group;
  if (group === undefined) return true;
  if (group.readonly) return true;
  // A rule on a frame key (Tab, Enter, ...) is outside the editable layout block.
  const frame = new Set(DESKTOP_ISO_GEOMETRY.filter((k) => k.frame).map((k) => k.id));
  if (group.rules.some((r) => r.context.some((el) => el.kind === "vkey" && (frame.has(el.name) || isFrameKey(el.name))))) return true;
  if (ir.raw.some((f) => f.groupNodeId === group.nodeId && f.sourceText.includes(">"))) return true;
  if (findShadowedRules(ir).some((sh) => group.rules.some((r) => r.nodeId === sh.ruleNodeId))) return true;
  const plain = new Set(["char", "vkey", "deadkey", "namedDeadkey", "nul"]);
  return group.rules.some(
    (r) =>
      r.matchKind !== undefined ||
      [...r.context, ...r.output].some((el) => !plain.has(el.kind) && !isPlusSeparator(el as { kind: string; text?: string })),
  );
}

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

    // SC-007 (deadkey half): every editable row whose context holds a deadkey, after the
    // verification pass, types exactly what the row says when the simulator is seeded with that
    // deadkey (and any text before it) and the row's keystroke is pressed. Checked here against
    // the simulator directly, not through verifyCells, so a demotion bug cannot hide a mismatch.
    it("every editable deadkey-context row matches the simulator seeded with its context (SC-007)", () => {
      if (NO_WEB_TARGET.has(entry.id)) return;
      const layers = listLayers(build.ir);
      const ids = new Map<string, number>();
      for (const layer of layers) {
        const cells = attributeLayer(build.ir, layer, VKEYS);
        const steps = gridSteps(build, layer);
        for (const cell of cells) {
          const out = cell.plain?.output;
          if (out === null || out === undefined || Array.isArray(out) || !("kind" in out) || out.kind !== "deadkey") continue;
          const step = steps.find((s) => s.vkey === cell.vkey)?.step;
          const first = step?.pendingDeadkeys[0];
          if (first !== undefined) ids.set(out.deadkeyId.toLowerCase(), first.id);
        }
      }
      // kmcmplib numbers named deadkeys 0, 1, ... in order of first mention in the source; use that for the ones no key produces directly,
      // and assert it agrees with every observed id.
      const order = new Map<string, number>();
      for (const m of build.kmn.replace(/^[ \t]*c([ \t].*)?$/gim, "").matchAll(/\b(?:dk|deadkey)\(\s*([^)\s]+)\s*\)/gi)) {
        const name = m[1]!.toLowerCase();
        if (!order.has(name)) order.set(name, order.size);
      }
      const disagree = [...ids].filter(([name, id]) => order.has(name) && order.get(name) !== id).map(([name, id]) => `${name}: observed ${id}, order ${order.get(name)}`);
      expect(disagree, "source-order numbering must agree with the observed compiler numbering").toEqual([]);
      for (const [name, id] of order) if (!ids.has(name)) ids.set(name, id);
      let checked = 0;
      let unseedable = 0;
      let hasDeadkeyRows = false;
      const mismatches: string[] = [];
      for (const layer of layers) {
        const cells = attributeLayer(build.ir, layer, VKEYS);
        const seeded: Array<{ ci: number; ri: number; seed: SimulatorContextSeed }> = [];
        cells.forEach((cell, ci) => {
          cell.rows.forEach((row, ri) => {
            if (!row.context.some((el) => el.kind === "deadkey")) return;
            hasDeadkeyRows = true;
            if (!row.editable) return;
            const seed = seedFor(row.context, ids);
            if (seed === null) unseedable += 1;
            else seeded.push({ ci, ri, seed });
          });
        });
        const modifiers = layer.filter((m) => m !== "NCAPS");
        const flat: CellStep[] = [];
        const typed = new Map<string, SimulationStep>();
        for (const { ci, ri, seed } of seeded) {
          const cell = cells[ci]!;
          const row = cell.rows[ri]!;
          const input = chordToSimKeyInput({ vkey: cell.vkey, modifiers: [...modifiers] });
          if (input === null) continue;
          const step = simulateEach(build.compiled, [input], seed)[0]!;
          typed.set(`${ci}:${ri}`, step);
          flat.push({ vkey: cell.vkey, layer, context: row.context, step });
        }
        // Rows the verification pass keeps editable must match the simulator on their own terms.
        const verified = verifyCells(cells, flat);
        for (const { ci, ri } of seeded) {
          const cell = verified[ci]!;
          const row = cell.rows[ri]!;
          const step = typed.get(`${ci}:${ri}`);
          const want = rowWants(row);
          if (!row.editable || step === undefined || want === null) continue;
          checked += 1;
          if (step.outputAfter !== want.text || step.pendingDeadkeys.length !== want.deadkeys) {
            mismatches.push(`[${[...layer, cell.vkey].join(" ")}] ${JSON.stringify(row.context)}: row ${JSON.stringify(want)}, typed ${JSON.stringify(step.outputAfter)}+${step.pendingDeadkeys.length}dk`);
          }
        }
      }
      console.info(`[INFO] ${entry.id}: SC-007 deadkey rows checked=${checked} unseedable=${unseedable}`);
      expect(mismatches).toEqual([]);
      if (entry.category === "deadkey-fanout" || entry.category === "deadkey-keystroke") {
        expect(hasDeadkeyRows, `${entry.id} has no deadkey-context rows`).toBe(true);
        expect(checked, `${entry.id}: no deadkey row was actually simulated`).toBeGreaterThan(0);
      }
    });

    // SC-007 (context half): every editable row whose context is literal text (no deadkey) types
    // exactly what the row says when the simulator is seeded with that text and the row's
    // keystroke is pressed. Checked against the simulator directly, not through verifyCells.
    it("every editable literal-context row matches the simulator seeded with its context (SC-007)", () => {
      if (NO_WEB_TARGET.has(entry.id)) return;
      const layers = listLayers(build.ir);
      let checked = 0;
      let demoted = 0;
      let hasLiteralRows = false;
      const mismatches: string[] = [];
      for (const layer of layers) {
        const cells = attributeLayer(build.ir, layer, VKEYS);
        const seeded: Array<{ ci: number; ri: number; seed: SimulatorContextSeed }> = [];
        cells.forEach((cell, ci) => {
          cell.rows.forEach((row, ri) => {
            if (row.shape !== "literal-context" || row.context.some((el) => el.kind === "deadkey")) return;
            hasLiteralRows = true;
            if (!row.editable) return;
            const seed = seedFor(row.context, new Map());
            if (seed !== null) seeded.push({ ci, ri, seed });
          });
        });
        const modifiers = layer.filter((m) => m !== "NCAPS");
        const flat: CellStep[] = [];
        const typed = new Map<string, SimulationStep>();
        for (const { ci, ri, seed } of seeded) {
          const cell = cells[ci]!;
          const row = cell.rows[ri]!;
          const input = chordToSimKeyInput({ vkey: cell.vkey, modifiers: [...modifiers] });
          if (input === null) continue;
          const step = simulateEach(build.compiled, [input], seed)[0]!;
          typed.set(`${ci}:${ri}`, step);
          flat.push({ vkey: cell.vkey, layer, context: row.context, step });
        }
        const verified = verifyCells(cells, flat);
        for (const { ci, ri } of seeded) {
          const cell = verified[ci]!;
          const row = cell.rows[ri]!;
          const step = typed.get(`${ci}:${ri}`);
          const want = rowWants(row);
          if (!row.editable) demoted += 1;
          if (!row.editable || step === undefined || want === null) continue;
          checked += 1;
          if (step.outputAfter !== want.text || step.pendingDeadkeys.length !== want.deadkeys) {
            mismatches.push(`[${[...layer, cell.vkey].join(" ")}] ${JSON.stringify(row.context)}: row ${JSON.stringify(want)}, typed ${JSON.stringify(step.outputAfter)}+${step.pendingDeadkeys.length}dk`);
          }
        }
      }
      console.info(`[INFO] ${entry.id}: SC-007 literal-context rows checked=${checked} demoted-by-verification=${demoted}`);
      expect(mismatches).toEqual([]);
      if (entry.category === "literal-context" && hasLiteralRows) {
        expect(checked + demoted, `${entry.id}: no literal-context row was actually simulated`).toBeGreaterThan(0);
      }
    });

    // SC-009: for a positional keyboard with no FR-013 read-only shape, 100% of its rules are
    // editable (after the verification pass); the share is recorded for every other keyboard as
    // the store-based next-frontier baseline.
    it("every rule of a keyboard with no read-only shapes is editable (SC-009)", () => {
      const ir = build.ir;
      const rules = classifyEntryRules(ir);
      const editable = new Set<string>();
      if (!isMnemonic(ir)) {
        for (const layer of listLayers(ir)) {
          const cells = attributeLayer(ir, layer, VKEYS);
          const steps = NO_WEB_TARGET.has(entry.id) ? [] : gridSteps(build, layer);
          const verified = steps.length === 0 ? cells : verifyCells(cells, steps);
          for (const cell of verified) for (const row of [cell.plain, ...cell.rows]) if (row?.editable === true) editable.add(row.ruleNodeId);
        }
      }
      const noReadOnlyShapes = !isMnemonic(ir) && !hasReadOnlyShapes(ir);
      shares.push({ id: entry.id, category: entry.category, rules: rules.length, editable: editable.size, noReadOnlyShapes });
      if (noReadOnlyShapes) {
        const missed = rules.filter((r) => !editable.has(r.nodeId)).map((r) => r.nodeId);
        expect(missed, `${entry.id} has no read-only shapes but these rules are not editable`).toEqual([]);
      }
    });
  });
}

// The printed SC-009 baseline: the editable share of each non-mnemonic keyboard's rules.
afterAll(() => {
  if (shares.length === 0) return;
  const lines = [
    "| Keyboard | Category | Rules | Editable | Share | No read-only shapes |",
    "|---|---|---:|---:|---:|---|",
    ...shares
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((r) => {
        const pct = r.rules === 0 ? "n/a" : `${((100 * r.editable) / r.rules).toFixed(1)}%`;
        return `| ${r.id} | ${r.category} | ${r.rules} | ${r.editable} | ${pct} | ${r.noReadOnlyShapes ? "yes" : "no"} |`;
      }),
  ];
  console.info(`[INFO] SC-009 editable share per keyboard\n${lines.join("\n")}`);
});
