// desktopGridViewModel — the provenance x output matrix of FR-012, built over fixtures.

import { describe, expect, it } from "vitest";
import type { LayerCombo } from "@keyboard-studio/contracts";
import type { CellStep, KeyCellAttribution, RowAttribution } from "@keyboard-studio/engine";
import type { WindowsLayout } from "../../lib/windowsLayouts.ts";
import { baseFallbackFor } from "./baseFallbackCells.ts";
import {
  buildDesktopGridViewModel,
  type DesktopCellViewModel,
  type DesktopGridViewModelInput,
} from "./desktopGridViewModel.ts";
import type { LayoutAttributionState } from "./useLayoutAttribution.ts";

const LAYER: LayerCombo = [];
const US: WindowsLayout = { id: "00000409", name: "US", languages: [], family: "qwerty", host: "us" };

function row(over: Partial<RowAttribution> = {}): RowAttribution {
  return {
    ruleNodeId: "r1",
    shape: "context-free",
    context: [],
    output: { kind: "text", text: "x" },
    editable: true,
    provenance: "starting-point",
    ...over,
  };
}

function cell(vkey: string, over: Partial<KeyCellAttribution> = {}): KeyCellAttribution {
  return { vkey, layer: LAYER, plain: row(), rows: [], unhandled: false, frame: false, ...over };
}

function vm(
  cells: KeyCellAttribution[],
  extra: Partial<DesktopGridViewModelInput> = {},
  state: LayoutAttributionState = "ready",
): DesktopCellViewModel[] {
  return buildDesktopGridViewModel({ layer: LAYER, cells, state, ...extra }).cells;
}

function one(c: KeyCellAttribution, extra: Partial<DesktopGridViewModelInput> = {}, state: LayoutAttributionState = "ready") {
  return vm([c], extra, state)[0]!;
}

describe("provenance x output matrix (FR-012)", () => {
  it("starting point x text", () => {
    expect(one(cell("K_A"))).toMatchObject({
      provenance: "starting-point",
      kind: "text",
      display: "x",
      editable: true,
      state: "ready",
    });
  });

  it("hand-set x text, with the editor that wrote it", () => {
    const c = one(cell("K_A", { plain: row({ provenance: "hand-set", authorEdit: "layout-tab" }) }));
    expect(c).toMatchObject({ provenance: "hand-set", authorEdit: "layout-tab", kind: "text", editable: true });
  });

  it("deadkey with its id, display and combination count", () => {
    const c = one(
      cell("K_BKQUOTE", { plain: row({ output: { kind: "deadkey", deadkeyId: "acute" } }) }),
      {
        contexts: [
          { context: [{ kind: "deadkey", deadkeyId: "Acute" }], keyCount: 5 },
          { context: [{ kind: "text", text: "n" }], keyCount: 1 },
        ],
      },
    );
    expect(c).toMatchObject({ kind: "deadkey", editable: true, display: null });
    expect(c.deadkey).toEqual({ id: "acute", display: "acute", combinationCount: 5 });
  });

  it("types nothing (nul) is editable", () => {
    expect(one(cell("K_A", { plain: row({ output: { kind: "nul" } }) }))).toMatchObject({
      kind: "nothing",
      display: null,
      editable: true,
    });
  });

  it("complex output is read-only with its reason and shows nothing", () => {
    const c = one(
      cell("K_A", { plain: row({ output: null, editable: false, readOnlyReason: "store-based", shape: "store-based" }) }),
    );
    expect(c).toMatchObject({ kind: "complex", display: null, editable: false, readOnlyReason: "store-based" });
  });

  it("changed by a later group: complex, showing what the compiled keyboard typed", () => {
    const steps: CellStep[] = [
      { vkey: "K_A", layer: LAYER, step: { input: { vkey: "K_A", modifiers: [] }, outputAfter: "Z", pendingDeadkeys: [], beep: false } },
    ];
    const c = one(
      cell("K_A", { plain: row({ editable: false, readOnlyReason: "later-group-change" }) }),
      { steps },
    );
    expect(c).toMatchObject({ kind: "complex", display: "Z", editable: false, readOnlyReason: "later-group-change" });
  });

  it("code the studio cannot show: opaque, read-only", () => {
    const c = one(
      cell("K_A", { plain: row({ shape: "opaque", output: null, editable: false, readOnlyReason: "opaque" }) }),
    );
    expect(c).toMatchObject({ kind: "opaque", display: null, editable: false, readOnlyReason: "opaque" });
  });

  it("frame keys show no provenance and are never editable", () => {
    const c = one(cell("K_ENTER", { plain: null, frame: true }));
    expect(c).toMatchObject({
      frame: true,
      kind: "frame",
      provenance: null,
      editable: false,
      readOnlyReason: "frame-key",
      display: null,
    });
  });

  it("base fallback x character: primary base keyboard, with the detail", () => {
    const detail = baseFallbackFor("K_B", LAYER, [US]);
    const c = one(cell("K_B", { plain: null, unhandled: true }), { baseFallback: new Map([["K_B", detail]]) });
    expect(c).toMatchObject({ provenance: "base-fallback", kind: "text", display: "b", editable: true });
    expect(c.baseFallback).toBe(detail);
  });

  it("base fallback with no reference data is unknown, still editable", () => {
    const detail = baseFallbackFor("K_B", LAYER, []);
    const c = one(cell("K_B", { plain: null, unhandled: true }), { baseFallback: new Map([["K_B", detail]]) });
    expect(c).toMatchObject({ provenance: "base-fallback", kind: "unknown", display: null, editable: true });
  });

  it("base fallback for a system shortcut", () => {
    const detail = baseFallbackFor("K_B", ["CTRL"], [US]);
    const c = one(cell("K_B", { plain: null, unhandled: true }), { baseFallback: new Map([["K_B", detail]]) });
    expect(c).toMatchObject({ kind: "system-shortcut", display: null });
  });

  it("a Do-nothing policy keeps the base character and carries the not-in-effect flag", () => {
    const detail = baseFallbackFor("K_B", LAYER, [US], { policyDoNothing: () => true });
    const c = one(cell("K_B", { plain: null, unhandled: true }), { baseFallback: new Map([["K_B", detail]]) });
    expect(c.display).toBe("b");
    expect(c.kind).not.toBe("nothing");
    expect(c.baseFallback?.policyNotInEffect).toBe(true);
  });

  it("K_oE2 is labelled by name, with no US character, when the primary base keyboard lacks it", () => {
    const detail = baseFallbackFor("K_oE2", ["CAPS"], [US]);
    const c = one(cell("K_oE2", { plain: null, unhandled: true }), { baseFallback: new Map([["K_oE2", detail]]) });
    expect(c.keyLabel).toBe("K_oE2");
    expect(c.display).toBeNull();
    expect(one(cell("K_A")).keyLabel).toBe("A");
  });
});

describe("an unhandled key the compiled keyboard has a rule for", () => {
  const unhandled = cell("K_B", { plain: null, unhandled: true });
  const detail = baseFallbackFor("K_B", LAYER, [US]);
  const stepFor = (over: Partial<CellStep["step"]>): CellStep[] => [
    {
      vkey: "K_B",
      layer: LAYER,
      step: { input: { vkey: "K_B", modifiers: [] }, outputAfter: "z", pendingDeadkeys: [], beep: false, ...over },
    },
  ];
  const fired = { group: "main", ruleIndex: 3 };

  it("shows the compiled text as hand-set, with no base fallback, still editable", () => {
    const c = one(unhandled, { steps: stepFor({ firedRule: fired }), baseFallback: new Map([["K_B", detail]]) });
    expect(c).toMatchObject({ provenance: "hand-set", kind: "text", display: "z", editable: true });
    expect(c.baseFallback).toBeUndefined();
    expect(c.readOnlyReason).toBeUndefined();
  });

  it("a rule that types nothing is kind nothing", () => {
    const c = one(unhandled, { steps: stepFor({ firedRule: fired, outputAfter: "" }) });
    expect(c).toMatchObject({ provenance: "hand-set", kind: "nothing", display: null });
  });

  it("a rule that arms one deadkey is kind deadkey", () => {
    const c = one(unhandled, {
      steps: stepFor({ firedRule: fired, outputAfter: "", pendingDeadkeys: [{ id: 1, position: 0 }] }),
    });
    expect(c).toMatchObject({ provenance: "hand-set", kind: "deadkey" });
    expect(c.deadkey).toMatchObject({ id: "0001" });
  });

  it("keeps base fallback when the step fired no rule (the simulator default is never shown)", () => {
    const c = one(unhandled, { steps: stepFor({}), baseFallback: new Map([["K_B", detail]]) });
    expect(c).toMatchObject({ provenance: "base-fallback", display: "b" });
    expect(c.baseFallback).toBe(detail);
  });

  it("ignores a contextual step, uses the frozen steps when stale, and stays read-only when mnemonic", () => {
    const ctx = stepFor({ firedRule: fired });
    ctx[0] = { ...ctx[0]!, context: [{ kind: "text", text: "n" }] };
    expect(one(unhandled, { steps: ctx }).provenance).toBe("base-fallback");
    expect(one(unhandled, { steps: stepFor({ firedRule: fired }) }, "stale")).toMatchObject({ display: "z", state: "stale" });
    expect(one(unhandled, { steps: stepFor({ firedRule: fired }), mnemonic: true })).toMatchObject({
      editable: false,
      readOnlyReason: "mnemonic",
    });
  });

  it("is not shown before anything compiles", () => {
    const c = one(unhandled, { steps: stepFor({ firedRule: fired }) }, "not-compiled");
    expect(c).toMatchObject({ display: null, editable: false, readOnlyReason: "not-compiled" });
  });
});

describe("contextual rows", () => {
  const ctxRow = row({ ruleNodeId: "r2", shape: "deadkey-keystroke", context: [{ kind: "deadkey", deadkeyId: "acute" }] });

  it("sets hasContextualRows and never makes an editable cell read-only", () => {
    const c = one(cell("K_E", { rows: [ctxRow] }));
    expect(c.hasContextualRows).toBe(true);
    expect(c.editable).toBe(true);
    expect(c.readOnlyReason).toBeUndefined();
    expect(c.ruleCount).toBe(2);
  });

  it("a read-only contextual row does not change the cell", () => {
    const c = one(cell("K_E", { rows: [{ ...ctxRow, editable: false, readOnlyReason: "store-based" }] }));
    expect(c).toMatchObject({ hasContextualRows: true, editable: true });
  });

  it("context-free extra rows (never-fires) are not contextual", () => {
    const c = one(cell("K_E", { rows: [row({ ruleNodeId: "r3", editable: false, readOnlyReason: "never-fires" })] }));
    expect(c.hasContextualRows).toBe(false);
  });
});

describe("states", () => {
  it("not-compiled: no display, not editable, never a guess, frame untouched", () => {
    const cells = [
      cell("K_A", { plain: row({ editable: false, readOnlyReason: "not-compiled" }) }),
      cell("K_B", { plain: null, unhandled: true }),
      cell("K_ENTER", { plain: null, frame: true }),
    ];
    const out = vm(cells, { baseFallback: new Map([["K_B", baseFallbackFor("K_B", LAYER, [US])]]) }, "not-compiled");
    const [a, b, enter] = ["K_A", "K_B", "K_ENTER"].map((k) => out.find((c) => c.vkey === k));
    expect(a).toMatchObject({ state: "not-compiled", display: null, editable: false, readOnlyReason: "not-compiled" });
    expect(b).toMatchObject({ state: "not-compiled", display: null, editable: false, readOnlyReason: "not-compiled" });
    expect(b?.baseFallback).toBeUndefined();
    expect(enter).toMatchObject({ kind: "frame", provenance: null, readOnlyReason: "frame-key" });
  });

  it("stale keeps the last good display and editability, flagged", () => {
    expect(one(cell("K_A"), {}, "stale")).toMatchObject({ state: "stale", display: "x", editable: true });
  });

  it("a mnemonic keyboard is read-only throughout, including unhandled keys", () => {
    const c = vm(
      [
        cell("K_A", { plain: row({ editable: false, readOnlyReason: "mnemonic" }) }),
        cell("K_B", { plain: null, unhandled: true }),
      ],
      { mnemonic: true },
    );
    expect(c.map((x) => [x.editable, x.readOnlyReason])).toEqual([
      [false, "mnemonic"],
      [false, "mnemonic"],
    ]);
    expect(c[0]?.display).toBe("x");
  });
});

describe("geometry", () => {
  it("carries each key's grid position, in geometry order, skipping keys without attribution", () => {
    const g = buildDesktopGridViewModel({
      layer: LAYER,
      state: "ready",
      cells: [cell("K_Q"), cell("K_A")],
    });
    expect(g.cells.map((c) => c.vkey)).toEqual(["K_Q", "K_A"]);
    expect(g.cells[0]).toMatchObject({ row: 1, width: 1 });
    expect(g.cells[1]?.row).toBe(2);
    expect(g.rowCount).toBe(5);
  });
});
