// Unit tests for KeyInspector (spec 063 T070; FR-020b, FR-030).
//
// Grouped:
//   1. Selection-vs-editing focus contract: Enter/F2 into the inspector,
//      Escape back to the cell it came from, and arrow/click updating the
//      DISPLAY without moving focus (useKeyInspectorFocusBridge).
//   2. The "Sends:" derivation (FR-030): key.layer superseding the
//      containing layer — the discriminating case is a key where the two
//      differ.
//   3. Display fields: produced characters, provenance, annotations,
//      findings, the empty state.
//   4. The `sp` (key type) control.
//   5. SC-007 (T121): every diagnostic reachable in the UI with a working fix.

import { describe, it, expect, afterEach, vi } from "vitest";
import { useRef } from "react";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { render } from "../../../test/renderWithI18n.tsx";
import type {
  KeyboardIR,
  TouchKeyIR,
  TouchKeyRuleBinding,
  TouchKeyRuleIndex,
  TouchLayoutIR,
} from "@keyboard-studio/contracts";
import {
  computeAllTouchKeyDiagnostics,
  touchKeyAddress,
  type KeyEditOverlay,
  type TouchKeyFindingCode,
} from "@keyboard-studio/engine";
import {
  KeyInspector,
  proposeSpValue,
  resolveSendsLayer,
  useKeyInspectorFocusBridge,
  type TouchKeySpValue,
} from "./KeyInspector.tsx";
import type { KeyGridAnnotationCounts, KeyGridCellViewModel, TouchKeyFinding } from "./keyGridViewModel.ts";

afterEach(() => {
  cleanup();
});

const EMPTY_ANNOTATIONS: KeyGridAnnotationCounts = { longpress: 0, multitap: 0, flick: 0 };

/**
 * `onSpChange` and `onApplyFix` are required props as of spec 065's D1
 * (`packages/studio/src/editors/assignLoop/keyGrid/KeyInspector.tsx`) — every
 * mount in this file must now supply both, even where a test asserts on
 * neither. Spread this at a mount site to satisfy the type without pasting
 * two `vi.fn()`s per call; a test that asserts a specific call supplies its
 * own handler for that prop instead (and can still spread this for the
 * other one).
 */
function defaultInspectorHandlers() {
  return { onSpChange: vi.fn(), onApplyFix: vi.fn() };
}

function makeCell(overrides: Partial<KeyGridCellViewModel> & { id: string }): KeyGridCellViewModel {
  const address = overrides.address ?? touchKeyAddress("phone", "default", overrides.id);
  return {
    address,
    id: overrides.id,
    keycap: overrides.keycap ?? overrides.id,
    sp: overrides.sp,
    padPct: overrides.padPct ?? 15,
    widthPct: overrides.widthPct ?? 100,
    producedChars: overrides.producedChars ?? [],
    annotations: overrides.annotations ?? EMPTY_ANNOTATIONS,
    findings: overrides.findings ?? [],
    ...(overrides.nextlayer !== undefined ? { nextlayer: overrides.nextlayer } : {}),
    ...(overrides.provenance !== undefined ? { provenance: overrides.provenance } : {}),
  };
}

// ---------------------------------------------------------------------------
// 1. The focus contract
// ---------------------------------------------------------------------------

/**
 * Minimal harness standing in for the future TouchGallery composition: a
 * fake grid cell (real `role="gridcell"`/`aria-selected` — the same
 * attributes KeyGridCell.tsx renders) plus `KeyInspector`, wired through
 * `useKeyInspectorFocusBridge` exactly as a real composing caller would.
 */
function FocusHarness({ cell }: { cell: KeyGridCellViewModel }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bridge = useKeyInspectorFocusBridge({
    selectedAddress: cell.address,
    containerRef,
  });

  return (
    <div ref={containerRef} data-testid="container">
      <button
        type="button"
        role="gridcell"
        aria-selected="true"
        data-testid="fake-cell"
        onKeyDown={bridge.handleGridKeyDown}
      >
        {cell.keycap}
      </button>
      <KeyInspector
        panelRef={bridge.inspectorRef}
        selectedCell={cell}
        onEscape={bridge.handleEscape}
        {...defaultInspectorHandlers()}
      />
    </div>
  );
}

describe("KeyInspector — selection is separate from editing (FR-020b)", () => {
  it("Enter on a focused gridcell moves DOM focus into the inspector panel", () => {
    render(<FocusHarness cell={makeCell({ id: "T_A" })} />);
    const cellBtn = screen.getByTestId("fake-cell");
    cellBtn.focus();
    expect(document.activeElement).toBe(cellBtn);

    fireEvent.keyDown(cellBtn, { key: "Enter" });

    expect(document.activeElement).toBe(screen.getByTestId("key-inspector"));
  });

  it("F2 on a focused gridcell moves DOM focus into the inspector panel", () => {
    render(<FocusHarness cell={makeCell({ id: "T_A" })} />);
    const cellBtn = screen.getByTestId("fake-cell");
    cellBtn.focus();

    fireEvent.keyDown(cellBtn, { key: "F2" });

    expect(document.activeElement).toBe(screen.getByTestId("key-inspector"));
  });

  it("does not move focus for an ordinary key (e.g. a letter) pressed on the gridcell", () => {
    render(<FocusHarness cell={makeCell({ id: "T_A" })} />);
    const cellBtn = screen.getByTestId("fake-cell");
    cellBtn.focus();

    fireEvent.keyDown(cellBtn, { key: "a" });

    expect(document.activeElement).toBe(cellBtn);
  });

  it("Escape from the focused inspector returns focus to the cell it came from", () => {
    render(<FocusHarness cell={makeCell({ id: "T_A" })} />);
    const cellBtn = screen.getByTestId("fake-cell");
    cellBtn.focus();
    fireEvent.keyDown(cellBtn, { key: "Enter" });
    const inspector = screen.getByTestId("key-inspector");
    expect(document.activeElement).toBe(inspector);

    fireEvent.keyDown(inspector, { key: "Escape" });

    expect(document.activeElement).toBe(cellBtn);
  });

  it("arrow/click-driven selection changes update the panel's DISPLAY without moving focus out of the grid", () => {
    const { rerender } = render(
      <FocusHarness cell={makeCell({ id: "T_A", keycap: "a" })} />,
    );
    const cellBtn = screen.getByTestId("fake-cell");
    cellBtn.focus();
    expect(document.activeElement).toBe(cellBtn);
    expect(screen.getByTestId("key-inspector-header").textContent).toContain("a");

    // Simulate an arrow-key-driven selection change: the SAME focus stays on
    // the (conceptually different, in a real grid) cell button while the
    // inspector's props update to reflect the newly-selected cell.
    rerender(<FocusHarness cell={makeCell({ id: "T_B", keycap: "b" })} />);

    expect(document.activeElement).toBe(screen.getByTestId("fake-cell"));
    expect(screen.getByTestId("key-inspector-header").textContent).toContain("b");
  });

  it("Escape is a no-op when nothing is selected", () => {
    render(<NoSelectionHarness />);
    const inspector = screen.getByTestId("key-inspector");
    inspector.focus();

    expect(() => fireEvent.keyDown(inspector, { key: "Escape" })).not.toThrow();
  });
});

/** Dedicated top-level harness (not a nested closure) so `useKeyInspectorFocusBridge`'s hook calls run inside a properly-named component, matching react-hooks lint's own component-name recognition. */
function NoSelectionHarness() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bridge = useKeyInspectorFocusBridge({ selectedAddress: null, containerRef });
  return (
    <div ref={containerRef}>
      <KeyInspector
        panelRef={bridge.inspectorRef}
        selectedCell={null}
        onEscape={bridge.handleEscape}
        {...defaultInspectorHandlers()}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. "Sends:" derivation (FR-030) — key.layer supersedes the containing layer
// ---------------------------------------------------------------------------

/** A tiny, purpose-built layout — NOT the shared touch-join fixture, because
 * that fixture's own `layer`-disambiguated pair (`T_LAYERDUP`) is a
 * DUPLICATE id within its layer, and `resolveKeyAddress` resolves to the
 * FIRST match by design (see touchKeyAddress.ts's own doc comment on
 * addressing limits) — the first `T_LAYERDUP` in that fixture has NO
 * `layer` override, so it cannot exercise the supersede case cleanly. This
 * fixture's single, unambiguous key is built specifically so the
 * discriminating case (a key where `layer` differs from the containing
 * layer) is unambiguous to resolve. */
function makeSendsLayout(keyOverrides: { id: string; layer?: string }): TouchLayoutIR {
  return {
    platforms: [
      {
        id: "phone",
        layers: [
          {
            id: "default",
            rows: [
              {
                keys: [
                  {
                    nodeId: "n1",
                    id: keyOverrides.id,
                    text: "x",
                    ...(keyOverrides.layer !== undefined ? { layer: keyOverrides.layer } : {}),
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("resolveSendsLayer — key.layer supersedes the containing layer (FR-030)", () => {
  it("uses the containing layer when the key carries no layer override", () => {
    const layout = makeSendsLayout({ id: "T_PLAIN" });
    const cell = makeCell({ id: "T_PLAIN" });

    const info = resolveSendsLayer(cell, layout);

    expect(info?.effectiveLayerId).toBe("default");
    expect(info?.containingLayerId).toBe("default");
    expect(info?.superseded).toBe(false);
  });

  it("lets key.layer supersede the containing layer when the two differ — the discriminating case", () => {
    const layout = makeSendsLayout({ id: "T_OVERRIDE", layer: "shift" });
    const cell = makeCell({ id: "T_OVERRIDE" });

    const info = resolveSendsLayer(cell, layout);

    expect(info?.effectiveLayerId).toBe("shift");
    expect(info?.containingLayerId).toBe("default");
    expect(info?.superseded).toBe(true);
  });

  it("degrades to the containing layer alone (no supersede) when layout is omitted", () => {
    const cell = makeCell({ id: "T_OVERRIDE" });

    const info = resolveSendsLayer(cell);

    expect(info?.effectiveLayerId).toBe("default");
    expect(info?.superseded).toBe(false);
  });

  it("renders the override note in the panel only for the superseding key", () => {
    const layout = makeSendsLayout({ id: "T_OVERRIDE", layer: "shift" });
    render(
      <KeyInspector
        selectedCell={makeCell({ id: "T_OVERRIDE" })}
        layout={layout}
        {...defaultInspectorHandlers()}
      />,
    );

    expect(screen.getByTestId("key-inspector-sends").textContent).toContain("shift");
    expect(screen.getByTestId("key-inspector-sends-override-note")).toBeTruthy();
  });

  it("renders no override note for a key with no layer override", () => {
    const layout = makeSendsLayout({ id: "T_PLAIN" });
    render(
      <KeyInspector
        selectedCell={makeCell({ id: "T_PLAIN" })}
        layout={layout}
        {...defaultInspectorHandlers()}
      />,
    );

    expect(screen.getByTestId("key-inspector-sends").textContent).toContain("default");
    expect(screen.queryByTestId("key-inspector-sends-override-note")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Display fields
// ---------------------------------------------------------------------------

describe("KeyInspector — display fields", () => {
  it("shows the empty state when nothing is selected", () => {
    render(<KeyInspector selectedCell={null} {...defaultInspectorHandlers()} />);
    expect(screen.getByTestId("key-inspector-empty")).toBeTruthy();
  });

  it("shows 'no output' when producedChars is empty", () => {
    render(
      <KeyInspector
        selectedCell={makeCell({ id: "T_A", producedChars: [] })}
        {...defaultInspectorHandlers()}
      />,
    );
    expect(screen.getByTestId("key-inspector-produces").textContent?.toLowerCase()).toContain(
      "no output",
    );
  });

  it("lists every produced character with its codepoint label", () => {
    render(
      <KeyInspector
        selectedCell={makeCell({ id: "T_A", producedChars: ["ɛ"] })}
        {...defaultInspectorHandlers()}
      />,
    );
    const produces = screen.getByTestId("key-inspector-produces");
    expect(produces.textContent).toContain("ɛ");
    expect(produces.textContent).toContain("U+025B");
  });

  it("shows a provenance note for an auto-placed key, and none for a hand-set one", () => {
    const { rerender } = render(
      <KeyInspector
        selectedCell={makeCell({ id: "T_A", provenance: "base-derived" })}
        {...defaultInspectorHandlers()}
      />,
    );
    expect(screen.getByTestId("key-inspector-provenance")).toBeTruthy();

    rerender(
      <KeyInspector
        selectedCell={makeCell({ id: "T_A", provenance: "hand-set" })}
        {...defaultInspectorHandlers()}
      />,
    );
    expect(screen.queryByTestId("key-inspector-provenance")).toBeNull();
  });

  it("shows sub-key annotation counts only when at least one is non-zero", () => {
    render(
      <KeyInspector
        selectedCell={makeCell({
          id: "T_A",
          annotations: { longpress: 2, multitap: 0, flick: 1 },
        })}
        {...defaultInspectorHandlers()}
      />,
    );
    const annotations = screen.getByTestId("key-inspector-annotations");
    expect(annotations.textContent).toContain("2");
    expect(annotations.textContent).toContain("1");
  });

  it("renders every finding with its severity badge", () => {
    const findings: TouchKeyFinding[] = [
      {
        code: "TOUCH_KEY_NO_RULE",
        severity: "warning",
        address: "phone:default:T_A",
        fields: { keyId: "T_A" },
        fixes: [{ kind: "reviewKey", address: "phone:default:T_A" }],
      },
      {
        code: "TOUCH_KEY_LAYER_SWITCH_ACTIVE_MISMATCH",
        severity: "warning",
        address: "phone:default:T_A",
        fields: { keyId: "T_A" },
        fixes: [{ kind: "setSp", address: "phone:default:T_A", sp: 2 }],
      },
    ];
    render(
      <KeyInspector
        selectedCell={makeCell({ id: "T_A", findings })}
        {...defaultInspectorHandlers()}
      />,
    );

    expect(
      screen.getByTestId("key-inspector-finding-0-severity").textContent,
    ).toBeTruthy();
    expect(
      screen.getByTestId("key-inspector-finding-1-severity").textContent,
    ).toBeTruthy();
    // Two distinct findings, each with its own title — not one collapsed row.
    expect(screen.getByTestId("key-inspector-finding-0-title").textContent).not.toBe(
      screen.getByTestId("key-inspector-finding-1-title").textContent,
    );
  });
});

// ---------------------------------------------------------------------------
// 5. SC-007 (spec 063 T121) — EVERY edit-time diagnostic is reachable in the
//    UI with a working fix, and none of them needs a compile to discover.
//
// Three claims, kept apart on purpose:
//
//   a. DISCOVERABILITY WITHOUT A COMPILE. The findings are produced by
//      `computeAllTouchKeyDiagnostics` — a pure, synchronous join over a
//      layout/rule index/overlay (FR-042, Decision D3). No compiler, no WASM
//      oracle, no await. Asserted by driving the table below from that
//      function's real output rather than from hand-written finding literals.
//   b. REACHABILITY IN THE UI. Each code renders in the inspector as localized
//      prose — never the raw `TOUCH_KEY_*` constant, which is the exact failure
//      `findingCopy.ts` (T116) exists to prevent and which a "does it render at
//      all" assertion would happily pass.
//   c. A WORKING FIX. Each code offers at least one fix button, and pressing it
//      hands the caller that same descriptor (T115, FR-041). "Working" here is
//      the seam this component owns — it commits nothing by design (see its own
//      module doc), so the assertion is that the descriptor arrives intact.
//
// The table is keyed by a `Record<TouchKeyFindingCode, …>`, so a new
// diagnostic with no fixture is a type error in any editor or bare `tsc` run.
// Note what that does NOT cover: `packages/studio/tsconfig.json` EXCLUDES
// `src/**/*.test.tsx`, so `pnpm typecheck` will not catch it — which is why
// `SC007_EXPECTED_CODE_COUNT` below is pinned as the runtime tripwire as well.
// Belt and braces, because an unreachable diagnostic is invisible by nature.
//
// tasks.md calls these "the eight"; the contract's own union carries eleven
// (FR-040's nine plus the two documented riders), and covering all eleven is
// strictly stronger than eight — the count in the task line is under-stated,
// not contradicted.
// ---------------------------------------------------------------------------

/** A layout+overlay pair that earns `code`, and where in the resulting layout its finding is anchored. */
interface DiagnosticCase {
  /** Built so `computeAllTouchKeyDiagnostics` emits `code`. */
  readonly inputs: () => { layout: TouchLayoutIR; ruleIndex: TouchKeyRuleIndex; ir: KeyboardIR };
  /** Committed key edits, for the one code derived from the overlay rather than the layout. */
  readonly overlay?: KeyEditOverlay;
}

/** The three keys every layer needs, so a fixture testing something else does not also earn 0x093. */
function requiredKeys(): TouchKeyIR[] {
  return [
    { nodeId: "n-lopt", id: "K_LOPT", sp: 1 },
    { nodeId: "n-bksp", id: "K_BKSP", sp: 1 },
    { nodeId: "n-enter", id: "K_ENTER", sp: 1 },
  ];
}

function diagLayout(layers: Array<{ id: string; keys: TouchKeyIR[] }>): TouchLayoutIR {
  return {
    platforms: [
      {
        id: "phone",
        layers: layers.map((l) => ({ id: l.id, rows: [{ keys: l.keys }] })),
      },
    ],
    nodeIds: [],
  };
}

/** One layer named `default`, with the required keys already present. */
function diagOneLayer(...keys: TouchKeyIR[]): TouchLayoutIR {
  return diagLayout([{ id: "default", keys: [...requiredKeys(), ...keys] }]);
}

function diagIr(layout: TouchLayoutIR, raw: KeyboardIR["raw"] = []): KeyboardIR {
  return { store: [], group: [], raw, touchLayout: layout } as unknown as KeyboardIR;
}

/**
 * A rule index built structurally rather than through
 * `buildTouchKeyRuleIndex` — the same shape the contracts detector suite uses
 * for its own fixtures. The detectors read only these four fields, and
 * hand-writing them keeps each case's defect legible instead of hiding it in a
 * synthetic `.kmn`.
 */
function diagRuleIndex(
  bindings: ReadonlyArray<{ normalizedId: string; asWritten: string; produces: string[] }> = [],
): TouchKeyRuleIndex {
  const byId = new Map<string, TouchKeyRuleBinding[]>();
  const spellings = new Map<string, string[]>();
  const producingIds = new Set<string>();

  for (const b of bindings) {
    const binding: TouchKeyRuleBinding = {
      ruleNodeId: `rule-${b.asWritten}`,
      groupName: "main",
      usingKeys: true,
      keyIdAsWritten: b.asWritten,
      modifiers: [],
      role: b.produces.length > 0 ? "produces" : "guard",
      produced: b.produces,
      contextGuarded: false,
    };
    byId.set(b.normalizedId, [...(byId.get(b.normalizedId) ?? []), binding]);
    spellings.set(b.normalizedId, [...(spellings.get(b.normalizedId) ?? []), b.asWritten]);
    if (b.produces.length > 0) producingIds.add(b.normalizedId);
  }

  return { byId, spellings, producingIds, opaqueFragmentCount: 0 };
}

function emptyDiagRuleIndex(): TouchKeyRuleIndex {
  return diagRuleIndex();
}

/** A rule keyed on `T_ORPHAN`, which no fixture layout carries. */
function orphanRuleIndex(): TouchKeyRuleIndex {
  return diagRuleIndex([
    { normalizedId: "T_ORPHAN", asWritten: "T_ORPHAN", produces: ["ɑ"] },
  ]);
}

/** A rule that spells the layout's `T_mark` as `T_MARK` — the latent case asymmetry. */
function caseMismatchRuleIndex(): TouchKeyRuleIndex {
  return diagRuleIndex([
    { normalizedId: "T_MARK", asWritten: "T_MARK", produces: ["́"] },
  ]);
}

const SC007_CASES: Record<TouchKeyFindingCode, DiagnosticCase> = {
  // 0x092 — a custom key nothing types.
  TOUCH_KEY_NO_RULE: {
    inputs: () => {
      const layout = diagOneLayer({ nodeId: "n1", id: "T_DEAD", sp: 0 });
      return { layout, ir: diagIr(layout), ruleIndex: emptyDiagRuleIndex() };
    },
  },
  // 0x091 — a nextlayer naming a layer the platform does not declare.
  TOUCH_KEY_MISSING_LAYER: {
    inputs: () => {
      const layout = diagOneLayer({ nodeId: "n1", id: "K_SW", sp: 1, nextlayer: "nowhere" });
      return { layout, ir: diagIr(layout), ruleIndex: emptyDiagRuleIndex() };
    },
  },
  // 0x099 — an id outside K_ / T_ / U_.
  TOUCH_KEY_UNIDENTIFIED: {
    inputs: () => {
      const layout = diagOneLayer({ nodeId: "n1", id: "MYKEY", sp: 0 });
      return { layout, ir: diagIr(layout), ruleIndex: emptyDiagRuleIndex() };
    },
  },
  // 0x093 — a layer missing upstream's CRequiredKeys. The ONLY fixture here
  // that deliberately omits them.
  TOUCH_KEY_MISSING_REQUIRED_KEYS: {
    inputs: () => {
      const layout = diagLayout([
        { id: "default", keys: [{ nodeId: "n1", id: "U_0061", sp: 0 }] },
      ]);
      return { layout, ir: diagIr(layout), ruleIndex: emptyDiagRuleIndex() };
    },
  },
  // 0x0A9 — a *…* frame label on an ordinary character key.
  TOUCH_KEY_SPECIAL_LABEL_ON_NORMAL: {
    inputs: () => {
      const layout = diagOneLayer({ nodeId: "n1", id: "U_0061", sp: 0, text: "*Shift*" });
      return { layout, ir: diagIr(layout), ruleIndex: emptyDiagRuleIndex() };
    },
  },
  // Two keys sharing one id within a layer.
  TOUCH_KEY_DUPLICATE_ID: {
    inputs: () => {
      const layout = diagOneLayer(
        { nodeId: "n1", id: "U_0061", sp: 0 },
        { nodeId: "n2", id: "U_0061", sp: 0 },
      );
      return { layout, ir: diagIr(layout), ruleIndex: emptyDiagRuleIndex() };
    },
  },
  // A rule keyed on an id no reachable key carries — the Cameroon AZERTY defect.
  TOUCH_KEY_RULE_ORPHAN: {
    inputs: () => {
      const layout = diagOneLayer({ nodeId: "n1", id: "U_0061", sp: 0 });
      // The rule index is built from an IR whose rules mention T_ORPHAN while
      // the layout above carries no such key.
      return { layout, ir: diagIr(layout), ruleIndex: orphanRuleIndex() };
    },
  },
  // FR-029d — a layer-switch key not marked active on the layer it switches
  // to. The `shift` occurrence is the defect: `nextlayer` names its OWN layer,
  // so R3b's rule requires sp:2 (active) there, and it is sp:1. The `default`
  // occurrence is correct by the same rule, which is what makes this fixture
  // discriminating rather than uniformly wrong.
  TOUCH_KEY_LAYER_SWITCH_ACTIVE_MISMATCH: {
    inputs: () => {
      const layout = diagLayout([
        { id: "default", keys: [...requiredKeys(), { nodeId: "n1", id: "K_SHIFT", sp: 1, nextlayer: "shift" }] },
        { id: "shift", keys: [...requiredKeys(), { nodeId: "n2", id: "K_SHIFT", sp: 1, nextlayer: "shift" }] },
      ]);
      return { layout, ir: diagIr(layout), ruleIndex: emptyDiagRuleIndex() };
    },
  },
  // FR-029c — suppression applied to only one of its two halves. This is the
  // "invisible dead key" branch: the id WAS neutralized to a sentinel, but the
  // rendering class never caught up, so an interactive key sits there typing
  // nothing.
  TOUCH_KEY_HALF_DONE_SUPPRESSION: {
    inputs: () => {
      const layout = diagOneLayer({ nodeId: "n1", id: "T_BLANK", sp: 0 });
      return { layout, ir: diagIr(layout), ruleIndex: emptyDiagRuleIndex() };
    },
  },
  // Edge Cases — layout and rule spell one id with different case (a hint).
  TOUCH_KEY_ID_CASE: {
    inputs: () => {
      const layout = diagOneLayer({ nodeId: "n1", id: "T_mark", sp: 0 });
      return { layout, ir: diagIr(layout), ruleIndex: caseMismatchRuleIndex() };
    },
  },
  // FR-029h / US4 AS8 — the one code derived from the OVERLAY, not the layout.
  TOUCH_KEY_MIXED_SUPPRESS_REMOVE: {
    inputs: () => {
      const layout = diagOneLayer(
        { nodeId: "n1", id: "U_0061", sp: 0 },
        { nodeId: "n2", id: "U_0062", sp: 0 },
      );
      return { layout, ir: diagIr(layout), ruleIndex: emptyDiagRuleIndex() };
    },
    overlay: {
      ops: [
        {
          seq: 1,
          kind: "suppress",
          address: touchKeyAddress("phone", "default", "U_0061"),
          spClass: 9,
          sentinelId: "T_BLANK",
        },
        {
          seq: 2,
          kind: "remove",
          address: touchKeyAddress("phone", "default", "U_0062"),
          outcome: "reflow",
        },
      ],
    },
  },
};

const SC007_CODES = Object.keys(SC007_CASES) as TouchKeyFindingCode[];

/**
 * Every member of `TouchKeyFindingCode` today: FR-040's nine findings plus the
 * two riders (`TOUCH_KEY_ID_CASE`, `TOUCH_KEY_MIXED_SUPPRESS_REMOVE`).
 *
 * Pinned deliberately. Adding a diagnostic must be a decision that reaches this
 * file, and since `pnpm typecheck` skips test files (see the section comment
 * above), the `Record` key check alone would not stop an unreachable finding
 * shipping. Bumping this number is the moment to add its fixture.
 */
const SC007_EXPECTED_CODE_COUNT = 11;

describe("SC-007 — every diagnostic is reachable in the UI with a working fix (T121)", () => {
  it.each(SC007_CODES)(
    "%s: a pure detector pass produces it, the inspector renders localized prose for it, and its fix round-trips",
    (code) => {
      const testCase = SC007_CASES[code];
      const { layout, ir, ruleIndex } = testCase.inputs();

      // (a) No compile needed: one synchronous call, no await, no oracle.
      const findings = computeAllTouchKeyDiagnostics(
        { ir, layout, ruleIndex },
        testCase.overlay,
      );
      const finding = findings.find((f) => f.code === code);
      expect(finding, `no detector produced ${code}`).toBeDefined();

      // (c) FR-041: a concrete fix exists on the finding itself.
      expect(finding!.fixes.length, `${code} has no fix`).toBeGreaterThan(0);

      // (b) Reachable in the UI as localized prose.
      const applied: Array<{ fixKind: string; findingCode: string }> = [];
      render(
        <KeyInspector
          selectedCell={makeCell({ id: "T_A", findings: [finding!] })}
          onSpChange={vi.fn()}
          onApplyFix={(fix, f) => applied.push({ fixKind: fix.kind, findingCode: f.code })}
        />,
      );

      const title = screen.getByTestId("key-inspector-finding-0-title").textContent ?? "";
      expect(title.length).toBeGreaterThan(0);
      // The raw constant must never be what the author reads.
      expect(title).not.toContain(code);
      expect(
        screen.getByTestId("key-inspector-finding-0-severity").textContent,
      ).toBeTruthy();

      // (c) The fix button works: pressing it hands back that same descriptor.
      const fixBtn = screen.getByTestId("key-inspector-finding-0-fix-0") as HTMLButtonElement;
      expect(fixBtn.disabled).toBe(false);
      const fixLabelText = fixBtn.textContent ?? "";
      expect(fixLabelText.length).toBeGreaterThan(0);
      expect(fixLabelText).not.toContain(finding!.fixes[0]!.kind);

      fireEvent.click(fixBtn);
      expect(applied).toEqual([
        { fixKind: finding!.fixes[0]!.kind, findingCode: code },
      ]);
    },
  );

  it("covers every code in the union — a new diagnostic cannot ship unreachable", () => {
    for (const code of SC007_CODES) {
      expect(SC007_CASES[code], `${code} has no fixture`).toBeDefined();
    }
    // The runtime half of the guard (the Record key check is the compile-time
    // half, which `pnpm typecheck` does not run over test files). A new
    // diagnostic bumps this and adds its fixture in the same change.
    expect(SC007_CODES).toHaveLength(SC007_EXPECTED_CODE_COUNT);
    // SC-007's own floor, stated so the relationship to tasks.md is explicit.
    expect(SC007_CODES.length).toBeGreaterThanOrEqual(8);
  });

  // Formerly "renders no fix button as actionable when the caller cannot act
  // — honest, not hidden": that title described the pre-D1 world, where
  // `onApplyFix` was optional and an unwired mount rendered every fix button
  // `disabled` rather than hiding it. FR-003 forecloses that middle ground —
  // "an affordance that does not apply MUST be absent" — and D1 forecloses it
  // a second, stronger way: `onApplyFix` is now a required prop, so there is
  // no unwired mount left to render honestly-disabled. What survives from the
  // old test is the substance FR-003 actually cares about here: a fix button
  // must never render in a state where activating it has no effect.
  it("never renders a fix button disabled — onApplyFix being required means every mount can act", () => {
    const { layout, ir, ruleIndex } = SC007_CASES.TOUCH_KEY_NO_RULE.inputs();
    const finding = computeAllTouchKeyDiagnostics({ ir, layout, ruleIndex }).find(
      (f) => f.code === "TOUCH_KEY_NO_RULE",
    );

    render(
      <KeyInspector
        selectedCell={makeCell({ id: "T_A", findings: [finding!] })}
        {...defaultInspectorHandlers()}
      />,
    );

    const fixBtn = screen.getByTestId("key-inspector-finding-0-fix-0") as HTMLButtonElement;
    expect(fixBtn.disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. `sp` (key type) control — full legal set, a proposal, never removed
//    (spec 063 T096; FR-029a, FR-029d)
// ---------------------------------------------------------------------------

describe("proposeSpValue — the derivable half of FR-029d, everything else is 'keep current'", () => {
  it("proposes active (sp:2) for a layer-switch key placed on the layer it switches to", () => {
    const cell = makeCell({ id: "T_LOWER", nextlayer: "default" });
    expect(proposeSpValue(cell, "default")).toBe(2);
  });

  it("proposes inactive (sp:1) for a layer-switch key placed elsewhere than its target", () => {
    const cell = makeCell({ id: "T_SHIFT", nextlayer: "shift" });
    expect(proposeSpValue(cell, "default")).toBe(1);
  });

  it("proposes the key's own current value when there is no nextlayer signal to derive from", () => {
    expect(proposeSpValue(makeCell({ id: "T_A", sp: 9 }), "default")).toBe(9);
    expect(proposeSpValue(makeCell({ id: "T_A", sp: 10 }), "default")).toBe(10);
    expect(proposeSpValue(makeCell({ id: "T_A", sp: 8 }), "default")).toBe(8);
  });

  it("proposes character (sp:0) for an ordinary key with no sp set at all", () => {
    expect(proposeSpValue(makeCell({ id: "T_A" }), "default")).toBe(0);
  });

  it("never treats non-empty producedChars as a reason to override an explicit blank/spacer choice", () => {
    // A half-done suppression (FR-029c) is a DIAGNOSTIC concern (T101), not
    // something this proposal silently "fixes" by proposing character back.
    const cell = makeCell({ id: "T_BLANK", sp: 9, producedChars: ["a"] });
    expect(proposeSpValue(cell, "default")).toBe(9);
  });
});

describe("KeyInspector — the `sp` control (FR-029a)", () => {
  // The control is a `SelectMenu` (see KeyInspector.tsx's own module doc, "The
  // key-type control is a DROPDOWN, not six radios"): a collapsed trigger
  // carrying the current value, and a listbox of options once opened. These
  // helpers are the same idiom ui/SelectMenu.test.tsx uses.

  /** The collapsed trigger inside the `sp` control. */
  function spTrigger(): HTMLButtonElement {
    return within(screen.getByTestId("key-inspector-sp")).getByRole("button") as HTMLButtonElement;
  }

  /** Every option, after opening the list. Portalled to `document.body`, so queried from `screen`, not from within the control. */
  function openSpOptions(): HTMLElement[] {
    fireEvent.click(spTrigger());
    return screen.getAllByRole("option");
  }

  it("exposes the full legal set of six values, none of them disabled", () => {
    render(<KeyInspector selectedCell={makeCell({ id: "T_A" })} {...defaultInspectorHandlers()} />);

    const options = openSpOptions();
    expect(options).toHaveLength(6);
    expect(options.map((o) => o.getAttribute("data-value")).sort()).toEqual(
      ["0", "1", "10", "2", "8", "9"].sort(),
    );
    for (const option of options) {
      expect(option.getAttribute("aria-disabled")).not.toBe("true");
    }
  });

  it("shows the key's current sp on the trigger, defaulting undefined to character (0)", () => {
    render(<KeyInspector selectedCell={makeCell({ id: "T_A" })} {...defaultInspectorHandlers()} />);
    expect(spTrigger().getAttribute("data-value")).toBe("0");
    expect(spTrigger().textContent).toContain("Character");
  });

  it("shows an explicitly-set non-default sp (spacer) on the trigger", () => {
    render(
      <KeyInspector
        selectedCell={makeCell({ id: "T_A", sp: 10 })}
        {...defaultInspectorHandlers()}
      />,
    );
    expect(spTrigger().getAttribute("data-value")).toBe("10");
    expect(spTrigger().textContent).toContain("Spacer");
  });

  it("marks the PROPOSED value even when it differs from the current one, without disabling either", () => {
    // T_SHIFT sits on "default" (touchKeyAddress default in makeCell) with
    // nextlayer "shift" — FR-029d proposes inactive (sp:1) here — while the
    // key is currently (wrongly) set to active (sp:2), the exact disagreement
    // T102's diagnostic (not this component) will one day report.
    render(
      <KeyInspector
        selectedCell={makeCell({ id: "T_SHIFT", sp: 2, nextlayer: "shift" })}
        {...defaultInspectorHandlers()}
      />,
    );

    // Collapsed, the trigger shows the CURRENT value and no proposal badge:
    // sp:2 is not what the studio would propose.
    expect(spTrigger().getAttribute("data-value")).toBe("2");
    expect(screen.queryByTestId("key-inspector-sp-proposed")).toBeNull();

    const options = openSpOptions();
    const badge = screen.getByTestId("key-inspector-sp-proposed");
    expect(badge.closest('[role="option"]')?.getAttribute("data-value")).toBe("1");
    for (const option of options) {
      expect(option.getAttribute("aria-disabled")).not.toBe("true");
    }
  });

  it("states that key type governs rendering/interactivity, not rule matching", () => {
    render(<KeyInspector selectedCell={makeCell({ id: "T_A" })} {...defaultInspectorHandlers()} />);
    const note = screen.getByTestId("key-inspector-sp-note").textContent ?? "";
    expect(note.toLowerCase()).toContain("does not stop a rule from matching");
  });

  it("explains the SELECTED type, not all six at once", () => {
    render(
      <KeyInspector
        selectedCell={makeCell({ id: "T_BLANK", sp: 9 })}
        {...defaultInspectorHandlers()}
      />,
    );
    const note = screen.getByTestId("key-inspector-sp-note").textContent ?? "";
    // Blank's own note, and NOT spacer's — the five types the author did not
    // choose are not being explained at them.
    expect(note).toContain("Fills a keycap-shaped hole");
    expect(note).not.toContain("no visible keycap");
  });

  it("fires onSpChange with the numeric value the author picked, even when it is not the proposed one", () => {
    const picks: TouchKeySpValue[] = [];
    render(
      <KeyInspector
        selectedCell={makeCell({ id: "T_A" })}
        onSpChange={(sp) => picks.push(sp)}
        onApplyFix={vi.fn()}
      />,
    );

    const spacer = openSpOptions().find((o) => o.getAttribute("data-value") === "10");
    expect(spacer).toBeTruthy();
    fireEvent.click(spacer!);

    expect(picks).toEqual([10]);
  });

  // Formerly "does nothing (and does not throw) when onSpChange is omitted".
  // `onSpChange` is now a required prop (D1) — there is no omitted-handler
  // mount left to exercise, and the reverting-radio defect that test guarded
  // against is now a `tsc` error rather than a runtime path. The substance
  // that survives — picking a value fires the handler with that value — is
  // already the assertion directly above; nothing here needs a second test.
});
