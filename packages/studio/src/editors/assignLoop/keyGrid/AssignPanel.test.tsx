// Unit tests for AssignPanel (spec 063 T085, T086, T087; FR-024, FR-025,
// FR-026). Harness copied from KeyInspector.test.tsx / FindPanel.test.tsx
// (renderWithI18n + the shared touch-key-rule-join fixture). No
// @testing-library/jest-dom — raw DOM assertions, matching this package's
// established test convention (see Field.test.tsx / KeyInspector.test.tsx).
//
// Grouped:
//   1. The `U_` default pre-selected with the `T_` alternative shown
//      (key-id-policy.md §2.1).
//   2. The character/U+ field accepting both a literal character and `U+xxxx`
//      notation.
//   3. The combining-mark path rendering the contiguous guard-then-producing
//      pair (US2 AS4), including the honest "no repertoire" failure.
//   4. Propose-then-confirm: nothing is written before an explicit submit,
//      and exactly one `onCommit` call happens per confirmed edit (never per
//      keystroke) — the property `commitKeyEdit`'s "one undo entry per call"
//      depends on once this is wired to the store.
//   5. The opaque-fragments carve-out: warn-and-confirm before a rule is
//      written when the working copy has raw fragments the codec could not
//      parse.
//   6. The case-triple path (follow-up cycle): the NCAPS/SHIFT+NCAPS/CAPS
//      trio rendered before writing, committed via `applyCaseTripleSynthesis`
//      into `nextIr`, and the honest "caps-not-handled" stated reason when
//      this key's group doesn't handle CAPS yet.

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../../test/renderWithI18n.tsx";
import type { IRRule, KeyboardIR, TouchKeyRuleIndex, TouchLayoutIR } from "@keyboard-studio/contracts";
import { buildTouchKeyRuleIndex } from "@keyboard-studio/contracts";
import { makeTouchKeyRuleJoinFixture, TOUCH_JOIN_IDS, TOUCH_JOIN_STORES } from "@keyboard-studio/contracts/fixtures";
import { touchKeyAddress } from "@keyboard-studio/engine";
import { AssignPanel, resolveCharacterFieldInput, type AssignPanelCommitResult } from "./AssignPanel.tsx";
import type { KeyGridAnnotationCounts, KeyGridCellViewModel } from "./keyGridViewModel.ts";

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMPTY_ANNOTATIONS: KeyGridAnnotationCounts = { longpress: 0, multitap: 0, flick: 0 };

function makeCell(overrides: Partial<KeyGridCellViewModel> & { id: string; address: string }): KeyGridCellViewModel {
  return {
    address: overrides.address,
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

/** The one genuinely dead key in the shared fixture — a ready-made "assign to me" target on phone:default. */
const DEAD_KEY_ADDRESS = touchKeyAddress("phone", "default", TOUCH_JOIN_IDS.dead);

function deadKeyCell(): KeyGridCellViewModel {
  return makeCell({ id: TOUCH_JOIN_IDS.dead, address: DEAD_KEY_ADDRESS });
}

/** Drop the reusable guard-shaped store, forcing the "mint" branch — mirrors touchRuleSynthesis.test.ts's own helper. */
function withoutGuardStore(ir: KeyboardIR): KeyboardIR {
  return { ...ir, stores: ir.stores.filter((s) => s.name !== TOUCH_JOIN_STORES.guard) };
}

/**
 * Give `keyId` existing CAPS handling in the fixture's "Main" (entry) group —
 * satisfies `keyHasCapsHandling`, the same predicate `planCaseTripleSynthesis`
 * (and `planGuardSynthesis`) gate on. Mirrors touchRuleSynthesis.test.ts's own
 * `capsFlag` fixture rule exactly, including its `["CAPS", "SHIFT"]` combo
 * choice — that combo canonicalizes to something distinct from all three of
 * the triple's own combos (NCAPS alone, SHIFT+NCAPS, CAPS alone), so it
 * satisfies the predicate WITHOUT `applyCaseTripleSynthesis` mistaking this
 * flag rule for one of the triple's own producing bindings and reusing it in
 * place of a fresh `gen-touch-*` rule (see that test file's own comment,
 * "exercises the fully-fresh insertion path").
 */
function withCapsHandlingFor(ir: KeyboardIR, keyId: string): KeyboardIR {
  const capsFlag: IRRule = {
    nodeId: `capsflag-${keyId}`,
    context: [{ kind: "vkey", name: keyId, modifiers: ["CAPS", "SHIFT"] }],
    output: [{ kind: "char", value: "Z" }],
  };
  return {
    ...ir,
    groups: ir.groups.map((g) => (g.name === "Main" ? { ...g, rules: [...g.rules, capsFlag] } : g)),
  };
}

function defaultProps(overrides: {
  ir?: KeyboardIR;
  ruleIndex?: TouchKeyRuleIndex;
  layout?: TouchLayoutIR;
  selectedCell?: KeyGridCellViewModel | null;
  repertoire?: readonly string[];
  capsHandled?: boolean;
  onCommit?: (result: AssignPanelCommitResult) => void;
} = {}) {
  const ir = overrides.ir ?? makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true });
  const ruleIndex = overrides.ruleIndex ?? buildTouchKeyRuleIndex(ir);
  const layout = overrides.layout ?? ir.touchLayout!;
  return {
    selectedCell: overrides.selectedCell === undefined ? deadKeyCell() : overrides.selectedCell,
    layout,
    ir,
    ruleIndex,
    inventoryChars: [],
    capsHandled: overrides.capsHandled ?? false,
    repertoire: overrides.repertoire ?? [" ", ".", ","],
    onCommit: overrides.onCommit ?? vi.fn(),
  };
}

function charField(): HTMLElement {
  return screen.getByLabelText("Character or code point");
}

// ---------------------------------------------------------------------------
// 1. U_ default pre-selected, T_ alternative shown (key-id-policy.md §2.1)
// ---------------------------------------------------------------------------

describe("AssignPanel — the U_ default vs the T_ alternative", () => {
  it("pre-selects the ruleless U_ id and shows the T_ alternative with its literal rule text", () => {
    const props = defaultProps();
    render(<AssignPanel {...props} />);

    fireEvent.change(charField(), { target: { value: "e" } });

    const proposal = screen.getByTestId("assign-panel-proposal");
    expect(proposal.textContent).toContain("U_0065");
    expect(proposal.textContent).toContain("no rule required");
    expect(proposal.textContent).toContain("+ [T_0065] > U+0065");

    const defaultRadio = screen.getByRole("radio", { name: /U_0065/ }) as HTMLInputElement;
    const altRadio = screen.getByRole("radio", { name: /T_0065/ }) as HTMLInputElement;
    expect(defaultRadio.checked).toBe(true);
    expect(altRadio.checked).toBe(false);
  });

  it("never presents the T_ alternative as merely advanced — it renders alongside the default, not hidden", () => {
    const props = defaultProps();
    render(<AssignPanel {...props} />);
    fireEvent.change(charField(), { target: { value: "e" } });

    // Both options are simultaneously present in the DOM (a radiogroup, not a
    // collapsed "advanced" disclosure) — this is the assertion that matters,
    // not any particular wording.
    expect(screen.getByRole("radio", { name: /U_0065/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /T_0065/ })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 2. The character/U+ field's dual form
// ---------------------------------------------------------------------------

describe("resolveCharacterFieldInput", () => {
  it("accepts explicit U+ notation", () => {
    expect(resolveCharacterFieldInput("U+025B")).toBe("ɛ");
    expect(resolveCharacterFieldInput("u+025b")).toBe("ɛ");
  });

  it("accepts a literal character typed directly", () => {
    expect(resolveCharacterFieldInput("ɛ")).toBe("ɛ");
  });

  it("does not reinterpret a bare hex-shaped literal string as notation", () => {
    // "FCFA" is valid hex digits but is meant as literal text here (see the
    // module doc's "field's dual role" section) — only an explicit U+ prefix
    // is read as codepoint notation.
    expect(resolveCharacterFieldInput("FCFA")).toBe("FCFA");
  });

  it("returns null for empty input", () => {
    expect(resolveCharacterFieldInput("   ")).toBeNull();
  });
});

describe("AssignPanel — the field accepts either form", () => {
  it("resolves U+025B notation to the same preview as typing ɛ directly", () => {
    const props1 = defaultProps();
    const { unmount } = render(<AssignPanel {...props1} />);
    fireEvent.change(charField(), { target: { value: "U+025B" } });
    expect(screen.getByTestId("assign-panel-field-preview").textContent).toContain("U+025B");
    unmount();

    const props2 = defaultProps();
    render(<AssignPanel {...props2} />);
    fireEvent.change(charField(), { target: { value: "ɛ" } });
    expect(screen.getByTestId("assign-panel-field-preview").textContent).toContain("U+025B");
  });

  it("shows an inline error for text that resolves to nothing", () => {
    const props = defaultProps();
    render(<AssignPanel {...props} />);
    fireEvent.change(charField(), { target: { value: "U+ZZZZ" } });
    expect(screen.getByTestId("assign-panel-field-error")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 3. The combining-mark path — the contiguous guard-then-producing pair
// ---------------------------------------------------------------------------

describe("AssignPanel — the combining-mark guard path (US2 AS4)", () => {
  it("renders the guard rule immediately before the producing rule, reusing the existing guard store", () => {
    const props = defaultProps();
    render(<AssignPanel {...props} />);

    fireEvent.change(charField(), { target: { value: "U+0300" } });

    const pair = screen.getByTestId("assign-panel-guard-pair");
    const lines = pair.querySelectorAll("code");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[0]?.textContent).toContain("any(diablock)");
    expect(lines[0]?.textContent).toContain("context");
    expect(lines[1]?.textContent).toContain("U+0300");
    expect(pair.textContent).toContain("diablock");
  });

  it("says plainly when no guard store can be minted, rather than offering a write that will fail", () => {
    const ir = withoutGuardStore(makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true }));
    const props = defaultProps({ ir, ruleIndex: buildTouchKeyRuleIndex(ir), layout: ir.touchLayout, repertoire: [] });
    render(<AssignPanel {...props} />);

    fireEvent.change(charField(), { target: { value: "U+0300" } });

    expect(screen.getByTestId("assign-panel-guard-pair").textContent?.toLowerCase()).toMatch(/repertoire/);
    expect((screen.getByTestId("assign-panel-confirm") as HTMLButtonElement).disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Propose-then-confirm
// ---------------------------------------------------------------------------

describe("AssignPanel — propose-then-confirm", () => {
  it("does not fire onCommit while typing or selecting — only on submit", () => {
    const onCommit = vi.fn();
    const props = defaultProps({ onCommit });
    render(<AssignPanel {...props} />);

    fireEvent.change(charField(), { target: { value: "e" } });
    fireEvent.click(screen.getByRole("radio", { name: /T_0065/ }));

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("fires onCommit exactly once per confirmed submit, carrying the set op and the promoted layout", () => {
    const onCommit = vi.fn();
    const props = defaultProps({ onCommit });
    render(<AssignPanel {...props} />);

    fireEvent.change(charField(), { target: { value: "e" } });
    fireEvent.submit(screen.getByTestId("assign-panel"));

    expect(onCommit).toHaveBeenCalledTimes(1);
    const result: AssignPanelCommitResult = onCommit.mock.calls[0]![0];
    expect(result.op).toEqual({
      address: DEAD_KEY_ADDRESS,
      kind: "set",
      fields: { id: "U_0065", text: "e" },
    });
    expect(result.nextIr).toBeUndefined();
    // Provenance promotion (T059, address-matched) landed on the assigned key.
    const promotedKey = result.promotedLayout.platforms
      .find((p) => p.id === "phone")!
      .layers.find((l) => l.id === "default")!
      .rows.flatMap((r) => r.keys)
      .find((k) => k.id === TOUCH_JOIN_IDS.dead)!;
    expect(promotedKey.provenance).toBe("hand-set");

    // The field resets after a successful commit, and no further onCommit
    // fires just from typing again.
    fireEvent.change(charField(), { target: { value: "z" } });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("commits the T_ rule-bearing alternative with the rule applied to nextIr when chosen", () => {
    const onCommit = vi.fn();
    const props = defaultProps({ onCommit });
    render(<AssignPanel {...props} />);

    fireEvent.change(charField(), { target: { value: "e" } });
    fireEvent.click(screen.getByRole("radio", { name: /T_0065/ }));
    fireEvent.submit(screen.getByTestId("assign-panel"));

    expect(onCommit).toHaveBeenCalledTimes(1);
    const result: AssignPanelCommitResult = onCommit.mock.calls[0]![0];
    expect(result.op.fields.id).toBe("T_0065");
    expect(result.nextIr).toBeDefined();
    const entryGroup = result.nextIr!.groups.find((g) => g.usingKeys && !g.readonly)!;
    expect(entryGroup.rules.some((r) => r.nodeId.startsWith("gen-touch-"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. The opaque carve-out — warn-and-confirm before writing a rule
// ---------------------------------------------------------------------------

describe("AssignPanel — the opaque-fragments carve-out", () => {
  it("blocks confirm and shows a warning when a rule would be written over opaque fragments", () => {
    const ir = makeTouchKeyRuleJoinFixture(); // opaque fragments present by default
    const props = defaultProps({ ir, ruleIndex: buildTouchKeyRuleIndex(ir), layout: ir.touchLayout });
    render(<AssignPanel {...props} />);

    fireEvent.change(charField(), { target: { value: "e" } });
    fireEvent.click(screen.getByRole("radio", { name: /T_0065/ }));

    expect(screen.getByTestId("assign-panel-opaque-warning")).toBeTruthy();
    expect((screen.getByTestId("assign-panel-confirm") as HTMLButtonElement).disabled).toBe(true);
  });

  it("allows confirm once the opaque gate is explicitly acknowledged", () => {
    const onCommit = vi.fn();
    const ir = makeTouchKeyRuleJoinFixture();
    const props = defaultProps({ ir, ruleIndex: buildTouchKeyRuleIndex(ir), layout: ir.touchLayout, onCommit });
    render(<AssignPanel {...props} />);

    fireEvent.change(charField(), { target: { value: "e" } });
    fireEvent.click(screen.getByRole("radio", { name: /T_0065/ }));
    expect((screen.getByTestId("assign-panel-confirm") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId("assign-panel-opaque-acknowledge"));
    expect((screen.getByTestId("assign-panel-confirm") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.submit(screen.getByTestId("assign-panel"));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("never gates the ruleless U_ default — no rule, no opaque risk", () => {
    const ir = makeTouchKeyRuleJoinFixture(); // opaque fragments present
    const props = defaultProps({ ir, ruleIndex: buildTouchKeyRuleIndex(ir), layout: ir.touchLayout });
    render(<AssignPanel {...props} />);

    fireEvent.change(charField(), { target: { value: "e" } });
    expect(screen.queryByTestId("assign-panel-opaque-warning")).toBeNull();
    expect((screen.getByTestId("assign-panel-confirm") as HTMLButtonElement).disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. The case-triple path — propose-then-confirm, then a real commit
// ---------------------------------------------------------------------------

describe("AssignPanel — the case-triple path", () => {
  it("renders the NCAPS / SHIFT+NCAPS / CAPS trio before writing, then commits it into nextIr", () => {
    const onCommit = vi.fn();
    const base = makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true });
    // keyHasCapsHandling is checked against the id the triple WILL be minted
    // under ("T_0073", from character "s") — not the target key's existing
    // id — mirroring planGuardSynthesis's own gate (touchRuleSynthesis.test.ts
    // "CAPS/NCAPS triple gated on existing CAPS handling").
    const ir = withCapsHandlingFor(base, "T_0073");
    const props = defaultProps({ ir, ruleIndex: buildTouchKeyRuleIndex(ir), layout: ir.touchLayout, capsHandled: true, onCommit });
    render(<AssignPanel {...props} />);

    fireEvent.change(charField(), { target: { value: "s" } });
    fireEvent.click(screen.getByTestId("assign-panel-case-triple-checkbox"));

    const rules = screen.getByTestId("assign-panel-case-triple-rules");
    const lines = rules.querySelectorAll("code");
    expect(lines.length).toBe(3);
    expect(lines[0]?.textContent).toContain("NCAPS");
    expect(lines[0]?.textContent).toContain("U+0073"); // lowercase "s"
    expect(lines[1]?.textContent).toContain("SHIFT");
    expect(lines[1]?.textContent).toContain("U+0053"); // uppercase "S"
    expect(lines[2]?.textContent).toContain("CAPS");
    expect(lines[2]?.textContent).toContain("U+0053");

    // Propose-then-confirm: nothing written yet.
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.submit(screen.getByTestId("assign-panel"));

    expect(onCommit).toHaveBeenCalledTimes(1);
    const result: AssignPanelCommitResult = onCommit.mock.calls[0]![0];
    expect(result.op.fields.id).toBe("T_0073");
    expect(result.nextIr).toBeDefined();
    const entryGroup = result.nextIr!.groups.find((g) => g.name === "Main")!;
    const generated = entryGroup.rules.filter((r) => r.nodeId.startsWith("gen-touch-"));
    expect(generated.length).toBe(3);
  });

  it("says plainly when this key's group doesn't handle CAPS yet, and blocks confirm", () => {
    const ir = makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true }); // no CAPS handling anywhere
    const props = defaultProps({ ir, ruleIndex: buildTouchKeyRuleIndex(ir), layout: ir.touchLayout, capsHandled: true });
    render(<AssignPanel {...props} />);

    fireEvent.change(charField(), { target: { value: "s" } });
    fireEvent.click(screen.getByTestId("assign-panel-case-triple-checkbox"));

    const unavailable = screen.getByTestId("assign-panel-case-triple-unavailable");
    expect(unavailable.textContent?.toLowerCase()).toMatch(/caps/);
    expect((screen.getByTestId("assign-panel-confirm") as HTMLButtonElement).disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe("AssignPanel — empty state", () => {
  it("renders a select-a-key prompt when nothing is selected", () => {
    const props = defaultProps({ selectedCell: null });
    render(<AssignPanel {...props} />);
    expect(screen.getByTestId("assign-panel-empty")).toBeTruthy();
    expect(screen.queryByTestId("assign-panel-confirm")).toBeNull();
  });
});
