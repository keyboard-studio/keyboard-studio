// Unit tests for RenameDialog (spec 063 T090; FR-028; key-id-policy.md §4).
// Harness copied from AssignPanel.test.tsx / KeyInspector.test.tsx
// (renderWithI18n + a hand-built TouchLayoutIR fixture — no
// @testing-library/jest-dom, raw DOM assertions, matching this package's
// established test convention).
//
// Two custom layouts, deliberately NOT the shared touch-key-rule-join
// fixture:
//   - FIXTURE A (`makeImpactLayout`) exercises the impact summary: same
//     layer, other layer, other platform, and a rule count, PLUS a flick
//     sub-key sharing the target's id — the regression for key-id-policy.md
//     §4's "handle the flick map as an object" failure mode.
//   - FIXTURE B (`makeScopeLayout`) exercises validation scope: every
//     renamed key has its OWN unique id/address (unlike the shared
//     touch-key-rule-join fixture's T_LAYERDUP, whose two same-id twins are
//     NOT independently addressable — see touchKeyAddress.ts's own doc on
//     that limitation), so the layer-override exemption and the
//     cross-platform case-collision can be asserted deterministically.
//
// Grouped:
//   1. Pre-fill — never blank, computed via proposeKeyId.
//   2. Live, per-keystroke validation and its 8 specific rejection reasons.
//   3. The layer-override uniqueness exemption + the case-only collision.
//   4. The "unchanged id" pseudo-reason.
//   5. The impact summary, including the flick-as-object regression.
//   6. Confirm / cancel / focus management / keyboard operability.
//   7. T092 — the orphan-rule cleanup proposal, reusing planKeyDeletionRuleRemoval.
//   8. T093 / SC-005 — a real three-layer, two-rule rename end to end:
//      nothing orphaned (the join), compiles clean (see the note in that
//      suite's own comment for the WASM-vs-Layer-A substitution), and the
//      character stays reachable (buildReachableProducedSet).

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../../test/renderWithI18n.tsx";
import type {
  IRGroup,
  IRRule,
  KeyboardIR,
  TouchKeyIR,
  TouchKeyRuleBinding,
  TouchKeyRuleIndex,
  TouchLayoutIR,
} from "@keyboard-studio/contracts";
import {
  bindingsForKeyId,
  buildReachableProducedSet,
  buildTouchKeyRuleIndex,
  normalizeTouchKeyId,
} from "@keyboard-studio/contracts";
import { emitKmn, renameTouchKey, runAllChecks, touchKeyAddress } from "@keyboard-studio/engine";
import {
  RenameDialog,
  computeProposedRenameId,
  computeRenameImpact,
  validateRenameCandidate,
  type RenameDialogConfirmResult,
} from "./RenameDialog.tsx";
import type { KeyGridAnnotationCounts, KeyGridCellViewModel } from "./keyGridViewModel.ts";

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMPTY_ANNOTATIONS: KeyGridAnnotationCounts = { longpress: 0, multitap: 0, flick: 0 };
const EMPTY_RULE_INDEX: TouchKeyRuleIndex = {
  byId: new Map(),
  spellings: new Map(),
  producingIds: new Set(),
  opaqueFragmentCount: 0,
};

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

function key(id: string, extra: Partial<Omit<TouchKeyIR, "nodeId" | "id">> = {}): TouchKeyIR {
  return { nodeId: `node-${id}`, id, ...extra };
}

function makeBinding(
  keyId: string,
  role: TouchKeyRuleBinding["role"] = "produces",
  nodeIdOverride?: string,
): TouchKeyRuleBinding {
  return {
    ruleNodeId: nodeIdOverride ?? `rule#${keyId}#${role}`,
    groupName: "Main",
    usingKeys: true,
    keyIdAsWritten: keyId,
    modifiers: [],
    role,
    produced: role === "produces" ? ["x"] : [],
    contextGuarded: false,
  };
}

/**
 * A minimal, structurally valid `KeyboardIR` for the `ir` prop
 * `buildOrphanCleanupPlan`/`planKeyDeletionRuleRemoval` need (T092) — its
 * `.touchLayout` is ALWAYS overridden by `withKeyIdVacatedAtAddress`'s
 * simulation before use, so the header/stores/groups below never need to
 * correspond to any test's `ruleIndex`; they exist only to satisfy the type.
 */
function makeMinimalIr(): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "rename_dialog_fixture",
      name: "RenameDialog Fixture",
      bcp47: ["und"],
      copyright: "",
      version: "1.0",
      targets: ["any"],
      storeDirectives: [],
    },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}

// --- FIXTURE A: impact summary, including the flick-as-object regression ---

const TARGET_ID = "T_TARGET";
const TARGET_ADDRESS = touchKeyAddress("phone", "default", TARGET_ID);

function makeImpactLayout(): TouchLayoutIR {
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
                  key(TARGET_ID, { text: "t" }),
                  key("T_TWIN", { text: "u" }),
                  // A DIFFERENT top-level key whose FLICK sub-key carries the
                  // SAME id as the target — must be found only if `flick` is
                  // walked via `Object.values`, never `.forEach`.
                  key("T_HOST", { text: "h", flick: { n: key(TARGET_ID, { text: "t2" }) } }),
                ],
              },
            ],
          },
          {
            id: "shift",
            rows: [{ keys: [key(TARGET_ID, { text: "T" })] }],
          },
        ],
      },
      {
        id: "tablet",
        layers: [{ id: "default", rows: [{ keys: [key(TARGET_ID, { text: "t" })] }] }],
      },
    ],
    nodeIds: [],
  };
}

function makeImpactRuleIndex(): TouchKeyRuleIndex {
  return {
    byId: new Map([[normalizeTouchKeyId(TARGET_ID), [makeBinding(TARGET_ID, "guard"), makeBinding(TARGET_ID)]]]),
    spellings: new Map(),
    producingIds: new Set([normalizeTouchKeyId(TARGET_ID)]),
    opaqueFragmentCount: 0,
  };
}

function targetCell(overrides: Partial<KeyGridCellViewModel> = {}): KeyGridCellViewModel {
  return makeCell({ id: TARGET_ID, address: TARGET_ADDRESS, ...overrides });
}

// --- FIXTURE B: validation scope (every renamed key has a UNIQUE address) ---

function makeScopeLayout(): TouchLayoutIR {
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
                  key("T_A", { text: "a" }),
                  key("T_RENAME_PLAIN", { text: "r" }),
                  key("T_RENAME_SHIFT", { text: "r2", layer: "shift" }),
                ],
              },
            ],
          },
        ],
      },
      {
        id: "tablet",
        layers: [{ id: "default", rows: [{ keys: [key("T_CASE", { text: "c" })] }] }],
      },
    ],
    nodeIds: [],
  };
}

function renamePlainCell(): KeyGridCellViewModel {
  return makeCell({ id: "T_RENAME_PLAIN", address: touchKeyAddress("phone", "default", "T_RENAME_PLAIN") });
}

function renameShiftCell(): KeyGridCellViewModel {
  return makeCell({ id: "T_RENAME_SHIFT", address: touchKeyAddress("phone", "default", "T_RENAME_SHIFT") });
}

function idField(): HTMLElement {
  return screen.getByTestId("rename-dialog-field");
}

function defaultProps(overrides: {
  open?: boolean;
  selectedCell?: KeyGridCellViewModel | null;
  layout?: TouchLayoutIR;
  ir?: KeyboardIR;
  ruleIndex?: TouchKeyRuleIndex;
  onCancel?: () => void;
  onConfirm?: (result: RenameDialogConfirmResult) => void;
} = {}) {
  return {
    open: overrides.open ?? true,
    selectedCell: overrides.selectedCell === undefined ? targetCell() : overrides.selectedCell,
    layout: overrides.layout ?? makeImpactLayout(),
    ir: overrides.ir ?? makeMinimalIr(),
    ruleIndex: overrides.ruleIndex ?? makeImpactRuleIndex(),
    onCancel: overrides.onCancel ?? vi.fn(),
    onConfirm: overrides.onConfirm ?? vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// 1. Pre-fill — never blank
// ---------------------------------------------------------------------------

describe("RenameDialog — pre-fill (key-id-policy.md §4)", () => {
  it("pre-fills with the naturally minted U_ id when the key already produces one simple codepoint", () => {
    const cell = targetCell({ producedChars: ["a"] });
    expect(computeProposedRenameId(cell)).toBe("U_0061");
  });

  it("falls back to the key's OWN current id when it produces nothing yet — never blank", () => {
    const cell = targetCell({ producedChars: [] });
    expect(computeProposedRenameId(cell)).toBe(TARGET_ID);
  });

  it("renders the field pre-filled, never empty, on open", () => {
    render(<RenameDialog {...defaultProps({ selectedCell: targetCell({ producedChars: [] }) })} />);
    expect((idField() as HTMLInputElement).value).toBe(TARGET_ID);
  });
});

// ---------------------------------------------------------------------------
// 2. Live validation + the 8 specific rejection reasons
// ---------------------------------------------------------------------------

describe("RenameDialog — validation runs on every keystroke", () => {
  it("updates the disabled state and the message as the field changes, with no separate submit step", () => {
    render(<RenameDialog {...defaultProps({ layout: makeScopeLayout(), selectedCell: renamePlainCell() })} />);

    fireEvent.change(idField(), { target: { value: "not a valid id" } });
    expect(screen.getByTestId("rename-dialog-field-error")).toBeTruthy();
    expect((screen.getByTestId("rename-dialog-confirm") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(idField(), { target: { value: "U_0041" } });
    expect(screen.queryByTestId("rename-dialog-field-error")).toBeNull();
    expect((screen.getByTestId("rename-dialog-confirm") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("RenameDialog — one specific message per rejection reason", () => {
  const cases: Array<{ name: string; candidate: string; expectSubstring: string }> = [
    { name: "malformed", candidate: "Q_FOO BAR", expectSubstring: "not a valid key id" },
    { name: "unicode-out-of-range", candidate: "U_0001", expectSubstring: "outside Keyman's valid range" },
    { name: "unicode-unpadded", candidate: "U_41", expectSubstring: "zero-padded" },
    { name: "reserved-prefix", candidate: "T_new_1", expectSubstring: "internal placeholders" },
    { name: "reserved-sentinel", candidate: "T_BLANK", expectSubstring: "deliberately empty key" },
    { name: "reserved-private-use", candidate: "T_*_MT_SHIFT_TO_SHIFT", expectSubstring: "reserved by KeymanWeb" },
  ];

  for (const { name, candidate, expectSubstring } of cases) {
    it(`renders its own message for "${name}" and disables Rename`, () => {
      render(<RenameDialog {...defaultProps({ layout: makeScopeLayout(), selectedCell: renamePlainCell() })} />);
      fireEvent.change(idField(), { target: { value: candidate } });

      const error = screen.getByTestId("rename-dialog-field-error");
      expect(error.textContent?.toLowerCase()).toContain(expectSubstring.toLowerCase());
      expect((screen.getByTestId("rename-dialog-confirm") as HTMLButtonElement).disabled).toBe(true);
    });
  }

  it('renders "duplicate-in-layer" naming the conflicting id, distinctly from case-only-collision', () => {
    render(<RenameDialog {...defaultProps({ layout: makeScopeLayout(), selectedCell: renamePlainCell() })} />);
    // T_RENAME_PLAIN carries no `layer` override; T_A carries none either —
    // overrides match, so this is a real duplicate, not the exemption.
    fireEvent.change(idField(), { target: { value: "T_A" } });

    const error = screen.getByTestId("rename-dialog-field-error");
    expect(error.textContent).toContain("T_A");
    expect(error.textContent?.toLowerCase()).toContain("already uses");
    expect((screen.getByTestId("rename-dialog-confirm") as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders "case-only-collision" naming the conflicting id, checked GLOBALLY (T_CASE lives on a different platform)', () => {
    render(<RenameDialog {...defaultProps({ layout: makeScopeLayout(), selectedCell: renamePlainCell() })} />);
    // "T_" must stay uppercase to satisfy the import-time syntax regex at
    // all (case-sensitive on the prefix); the SUFFIX case is what differs
    // from the existing "T_CASE", which is exactly what the case-collision
    // check is for.
    fireEvent.change(idField(), { target: { value: "T_case" } });

    const error = screen.getByTestId("rename-dialog-field-error");
    expect(error.textContent).toContain("T_CASE");
    expect(error.textContent?.toLowerCase()).toContain("same key");
    expect((screen.getByTestId("rename-dialog-confirm") as HTMLButtonElement).disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. The layer-override uniqueness exemption
// ---------------------------------------------------------------------------

describe("RenameDialog — the per-key layer-override exemption (key-id-policy.md §3.2)", () => {
  it("BLOCKS a same-layer collision when the overrides match (both absent)", () => {
    const result = validateRenameCandidate(
      "T_A",
      makeScopeLayout(),
      touchKeyAddress("phone", "default", "T_RENAME_PLAIN"),
      undefined,
    );
    expect(result).toEqual({ valid: false, reason: "duplicate-in-layer", conflictingId: "T_A" });
  });

  it("EXEMPTS the same collision when the candidate carries a distinct layer override", () => {
    const result = validateRenameCandidate(
      "T_A",
      makeScopeLayout(),
      touchKeyAddress("phone", "default", "T_RENAME_SHIFT"),
      "shift",
    );
    expect(result).toEqual({ valid: true });
  });

  it("renders Rename ENABLED end-to-end for the exempted rename", () => {
    render(<RenameDialog {...defaultProps({ layout: makeScopeLayout(), selectedCell: renameShiftCell() })} />);
    fireEvent.change(idField(), { target: { value: "T_A" } });

    expect(screen.queryByTestId("rename-dialog-field-error")).toBeNull();
    expect((screen.getByTestId("rename-dialog-confirm") as HTMLButtonElement).disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. The "unchanged id" pseudo-reason
// ---------------------------------------------------------------------------

describe("RenameDialog — renaming to the same id", () => {
  it("disables Rename with its own distinct reason, not an engine rejection code", () => {
    render(<RenameDialog {...defaultProps({ selectedCell: targetCell({ producedChars: [] }) })} />);
    // The field is already pre-filled with the key's own id (no output yet).
    expect(screen.getByTestId("rename-dialog-unchanged")).toBeTruthy();
    expect(screen.queryByTestId("rename-dialog-field-error")).toBeNull();
    expect((screen.getByTestId("rename-dialog-confirm") as HTMLButtonElement).disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. The impact summary (key-id-policy.md §4), including the flick regression
// ---------------------------------------------------------------------------

describe("RenameDialog — the impact summary", () => {
  it("computes same-layer (via a flick sub-key), other-layer, other-platform, and rule counts", () => {
    const impact = computeRenameImpact(makeImpactLayout(), makeImpactRuleIndex(), TARGET_ADDRESS, TARGET_ID);
    expect(impact).toEqual({
      sameLayerOccurrences: 1, // T_HOST's flick child — the Object.values regression
      otherLayerOccurrences: 1, // phone:shift
      otherPlatformOccurrences: 1, // tablet:default
      ruleOccurrences: 2, // guard + producing
    });
  });

  it("names other layers, other platforms, and .kmn rules in the rendered summary", () => {
    render(<RenameDialog {...defaultProps()} />);
    const summary = screen.getByTestId("rename-dialog-impact").textContent ?? "";
    expect(summary).toMatch(/this layer/i);
    expect(summary).toMatch(/other layer/i);
    expect(summary).toMatch(/other platform/i);
    expect(summary).toMatch(/rule/i);
  });

  it("says plainly when the id appears nowhere else", () => {
    const isolatedCell = makeCell({ id: "T_LONE", address: touchKeyAddress("phone", "default", "T_LONE") });
    const layout: TouchLayoutIR = {
      platforms: [{ id: "phone", layers: [{ id: "default", rows: [{ keys: [key("T_LONE")] }] }] }],
      nodeIds: [],
    };
    render(<RenameDialog {...defaultProps({ selectedCell: isolatedCell, layout, ruleIndex: EMPTY_RULE_INDEX })} />);
    expect(screen.getByTestId("rename-dialog-impact").textContent?.toLowerCase()).toContain("nowhere else");
  });
});

// ---------------------------------------------------------------------------
// 6. Confirm / cancel / focus management / keyboard operability
// ---------------------------------------------------------------------------

describe("RenameDialog — confirm, cancel, and focus (ARIA APG dialog pattern)", () => {
  it("renders nothing when closed", () => {
    render(<RenameDialog {...defaultProps({ open: false })} />);
    expect(screen.queryByTestId("rename-dialog")).toBeNull();
  });

  it("renders nothing when nothing is selected", () => {
    render(<RenameDialog {...defaultProps({ selectedCell: null })} />);
    expect(screen.queryByTestId("rename-dialog")).toBeNull();
  });

  it("moves focus into the id field on open", () => {
    render(<RenameDialog {...defaultProps()} />);
    expect(document.activeElement).toBe(idField());
  });

  it("is labelled and exposes the modal dialog role", () => {
    render(<RenameDialog {...defaultProps()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBeTruthy();
  });

  it("calls onCancel on Escape", () => {
    const onCancel = vi.fn();
    render(<RenameDialog {...defaultProps({ onCancel })} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when the Cancel button is activated", () => {
    const onCancel = vi.fn();
    render(<RenameDialog {...defaultProps({ onCancel })} />);
    fireEvent.click(screen.getByTestId("rename-dialog-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("fires onConfirm exactly once with the rename op, old/new ids, and the impact summary", () => {
    const onConfirm = vi.fn();
    const isolatedCell = makeCell({ id: "T_LONE", address: touchKeyAddress("phone", "default", "T_LONE") });
    const layout: TouchLayoutIR = {
      platforms: [{ id: "phone", layers: [{ id: "default", rows: [{ keys: [key("T_LONE")] }] }] }],
      nodeIds: [],
    };
    render(<RenameDialog {...defaultProps({ selectedCell: isolatedCell, layout, ruleIndex: EMPTY_RULE_INDEX, onConfirm })} />);

    fireEvent.change(idField(), { target: { value: "U_0041" } });
    fireEvent.submit(screen.getByTestId("rename-dialog"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const result: RenameDialogConfirmResult = onConfirm.mock.calls[0]![0];
    expect(result.op).toEqual({
      address: touchKeyAddress("phone", "default", "T_LONE"),
      kind: "rename",
      toId: "U_0041",
    });
    expect(result.oldId).toBe("T_LONE");
    expect(result.newId).toBe("U_0041");
    expect(result.impact).toEqual({
      sameLayerOccurrences: 0,
      otherLayerOccurrences: 0,
      otherPlatformOccurrences: 0,
      ruleOccurrences: 0,
    });
    // No bindings at all for T_LONE — nothing to propose cleaning up.
    expect(result.orphanCleanup).toBeUndefined();
  });

  it("never calls onConfirm while merely typing — only on submit", () => {
    const onConfirm = vi.fn();
    render(<RenameDialog {...defaultProps({ layout: makeScopeLayout(), selectedCell: renamePlainCell(), onConfirm })} />);
    fireEvent.change(idField(), { target: { value: "U_0041" } });
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 7. T092 — the orphan-rule cleanup proposal (reuses planKeyDeletionRuleRemoval)
// ---------------------------------------------------------------------------

const ORPHAN_ID = "T_ORPHAN";
const ORPHAN_ADDRESS = touchKeyAddress("phone", "default", ORPHAN_ID);

/** A layout where `ORPHAN_ID` has EXACTLY one occurrence anywhere — renaming it away fully vacates the id. */
function makeOrphanLayout(): TouchLayoutIR {
  return {
    platforms: [{ id: "phone", layers: [{ id: "default", rows: [{ keys: [key(ORPHAN_ID, { text: "o" })] }] }] }],
    nodeIds: [],
  };
}

function orphanCell(): KeyGridCellViewModel {
  return makeCell({ id: ORPHAN_ID, address: ORPHAN_ADDRESS });
}

function ruleIndexFor(keyId: string, nodeId: string, role: TouchKeyRuleBinding["role"] = "produces"): TouchKeyRuleIndex {
  return {
    byId: new Map([[normalizeTouchKeyId(keyId), [makeBinding(keyId, role, nodeId)]]]),
    spellings: new Map(),
    producingIds: new Set(role === "produces" ? [normalizeTouchKeyId(keyId)] : []),
    opaqueFragmentCount: 0,
  };
}

describe("RenameDialog — the orphan-rule cleanup proposal (T092)", () => {
  it("proposes removing a studio-generated rule, checked by default, when the rename would fully vacate the old id", () => {
    const ruleIndex = ruleIndexFor(ORPHAN_ID, "gen-touch-produce-orphan-base");
    render(<RenameDialog {...defaultProps({ layout: makeOrphanLayout(), selectedCell: orphanCell(), ruleIndex })} />);

    expect(screen.getByTestId("rename-dialog-orphan-generated").textContent?.toLowerCase()).toMatch(/generated/);
    const checkbox = screen.getByTestId("rename-dialog-orphan-remove-checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(screen.queryByTestId("rename-dialog-orphan-handwritten")).toBeNull();
  });

  it("keeps and reports a hand-written/imported rule instead — never a checkbox to auto-remove it", () => {
    const ruleIndex = ruleIndexFor(ORPHAN_ID, "rule#hand-written-guard");
    render(<RenameDialog {...defaultProps({ layout: makeOrphanLayout(), selectedCell: orphanCell(), ruleIndex })} />);

    expect(screen.getByTestId("rename-dialog-orphan-handwritten").textContent?.toLowerCase()).toMatch(
      /hand-written or imported/,
    );
    expect(screen.queryByTestId("rename-dialog-orphan-remove-checkbox")).toBeNull();
    expect(screen.queryByTestId("rename-dialog-orphan-generated")).toBeNull();
  });

  it("proposes nothing when the old id is still carried elsewhere in the layout", () => {
    // The default fixture (T_TARGET) has other-layer AND other-platform
    // occurrences plus a flick-hosted one — never fully vacated by this rename.
    render(<RenameDialog {...defaultProps()} />);
    expect(screen.queryByTestId("rename-dialog-orphan")).toBeNull();
  });

  it("proposes nothing when the vacated id has no bindings at all", () => {
    render(
      <RenameDialog
        {...defaultProps({ layout: makeOrphanLayout(), selectedCell: orphanCell(), ruleIndex: EMPTY_RULE_INDEX })}
      />,
    );
    expect(screen.queryByTestId("rename-dialog-orphan")).toBeNull();
  });

  it("carries the author's final choice — including an override of the remove default — in the confirm result", () => {
    const onConfirm = vi.fn();
    const ruleIndex = ruleIndexFor(ORPHAN_ID, "gen-touch-produce-orphan-base");
    render(
      <RenameDialog {...defaultProps({ layout: makeOrphanLayout(), selectedCell: orphanCell(), ruleIndex, onConfirm })} />,
    );

    fireEvent.click(screen.getByTestId("rename-dialog-orphan-remove-checkbox")); // author unchecks: keep it instead
    fireEvent.change(idField(), { target: { value: "U_1234" } });
    fireEvent.submit(screen.getByTestId("rename-dialog"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const result: RenameDialogConfirmResult = onConfirm.mock.calls[0]![0];
    expect(result.orphanCleanup).toEqual({
      generatedRuleNodeIds: ["gen-touch-produce-orphan-base"],
      handWrittenRuleNodeIds: [],
      removeGenerated: false,
    });
  });

  it("defaults removeGenerated to true (T083's own policy) when the author does not touch the checkbox", () => {
    const onConfirm = vi.fn();
    const ruleIndex = ruleIndexFor(ORPHAN_ID, "gen-touch-produce-orphan-base");
    render(
      <RenameDialog {...defaultProps({ layout: makeOrphanLayout(), selectedCell: orphanCell(), ruleIndex, onConfirm })} />,
    );

    fireEvent.change(idField(), { target: { value: "U_1234" } });
    fireEvent.submit(screen.getByTestId("rename-dialog"));

    const result: RenameDialogConfirmResult = onConfirm.mock.calls[0]![0];
    expect(result.orphanCleanup?.removeGenerated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. T093 / SC-005 — a real three-layer, two-rule rename, end to end
// ---------------------------------------------------------------------------
//
// This suite calls the REAL engine primitives the confirm callback is
// documented to drive (renameTouchKey — see the module doc's T092 section
// and workingCopyStore.ts's `commitTouchKeyRename`) rather than asserting on
// this dialog's own output shape, because SC-005 is a claim about the
// FEATURE's end-to-end behaviour once a caller acts on this dialog's
// confirm result, not about RenameDialog.tsx's props alone.
//
// "Compiles clean" — SUBSTITUTED, not the real WASM oracle, and this is
// disclosed rather than silently weakened. `compile()` (the real kmcmplib
// pipeline, packages/engine/src/compiler) is exercised in ENGINE's own
// vitest lane (compile.test.ts) but is NOT reachable here: this package's
// OWN `useValidator.test.ts` mocks `@keyboard-studio/engine` wholesale
// specifically to avoid invoking the WASM oracle from the studio's jsdom
// vitest environment, which is the established precedent for what this lane
// can and cannot reach. `runAllChecks` (Layer A/B, the synchronous
// TS-portable checks) is exercised instead — the same "no error/fatal
// diagnostics" assertion compile.test.ts makes against the real oracle,
// substituted at the layer this package's tests are set up to reach.

describe("RenameDialog — SC-005: rename a key on three layers referenced by two rules", () => {
  const OLD_ID = "T_OLD3";
  const NEW_ID = "T_NEW3";
  const MARK_BASE = "́"; // combining acute
  const MARK_SHIFT = "̂"; // combining circumflex

  function makeThreeLayerFixture(): KeyboardIR {
    const baseRule: IRRule = {
      nodeId: "rule#p1",
      context: [{ kind: "vkey", name: OLD_ID, modifiers: [] }],
      output: [{ kind: "char", value: MARK_BASE }],
    };
    const shiftRule: IRRule = {
      nodeId: "rule#p2",
      context: [{ kind: "vkey", name: OLD_ID, modifiers: ["SHIFT"] }],
      output: [{ kind: "char", value: MARK_SHIFT }],
    };
    const group: IRGroup = {
      nodeId: "group#main",
      name: "Main",
      usingKeys: true,
      rules: [baseRule, shiftRule],
      readonly: false,
    };
    const layout: TouchLayoutIR = {
      platforms: [
        {
          id: "phone",
          layers: [
            { id: "default", rows: [{ keys: [key(OLD_ID, { text: "x" })] }] },
            { id: "shift", rows: [{ keys: [key(OLD_ID, { text: "X" })] }] },
            { id: "caps", rows: [{ keys: [key(OLD_ID, { text: "x" })] }] },
          ],
        },
      ],
      nodeIds: [],
    };
    return { ...makeMinimalIr(), groups: [group], touchLayout: layout };
  }

  it("renames a key on three layers referenced by two rules with nothing orphaned, a clean Layer A/B check, and both characters reachable", () => {
    const ir = makeThreeLayerFixture();

    // Sanity on the FIXTURE itself, before the rename: three layers, two rules.
    const layerCount = ir.touchLayout!.platforms[0]!.layers.filter((l) =>
      l.rows.some((r) => r.keys.some((k) => k.id === OLD_ID)),
    ).length;
    expect(layerCount).toBe(3);
    const beforeIndex = buildTouchKeyRuleIndex(ir);
    expect(bindingsForKeyId(beforeIndex, OLD_ID).length).toBe(2);

    // The rename itself — the real T091 primitive, exactly as
    // workingCopyStore.ts's `commitTouchKeyRename` calls it.
    const result = renameTouchKey(ir, OLD_ID, NEW_ID);
    expect(result.changed).toBe(true);
    expect(result.renamedRuleNodeIds.sort()).toEqual(["rule#p1", "rule#p2"]);

    // 1. Nothing is orphaned: the join sees zero bindings left on the OLD id,
    //    and both bindings on the NEW id resolve to a key that carries it.
    const afterIndex = buildTouchKeyRuleIndex(result.ir);
    expect(bindingsForKeyId(afterIndex, OLD_ID)).toEqual([]);
    const newBindings = bindingsForKeyId(afterIndex, NEW_ID);
    expect(newBindings.length).toBe(2);
    const layout = result.ir.touchLayout!;
    for (const layer of layout.platforms[0]!.layers) {
      expect(layer.rows.some((r) => r.keys.some((k) => k.id === NEW_ID))).toBe(true);
      expect(layer.rows.some((r) => r.keys.some((k) => k.id === OLD_ID))).toBe(false);
    }

    // 2. Compiles clean — SUBSTITUTED with the Layer A/B synchronous checks;
    //    see this suite's own header comment for why the real WASM oracle is
    //    not reachable from this package's vitest lane.
    const kmnSource = emitKmn(result.ir);
    const findings = runAllChecks(kmnSource);
    const blocking = findings.filter((f) => f.severity === "error" || f.severity === "fatal");
    expect(blocking).toEqual([]);

    // 3. The character remains reachable — through the reachability view
    //    itself, not a proxy.
    const reachability = buildReachableProducedSet(result.ir);
    expect(reachability.reachable.has(MARK_BASE)).toBe(true);
    expect(reachability.reachable.has(MARK_SHIFT)).toBe(true);
    expect(reachability.orphaned.has(MARK_BASE)).toBe(false);
    expect(reachability.orphaned.has(MARK_SHIFT)).toBe(false);
  });
});
