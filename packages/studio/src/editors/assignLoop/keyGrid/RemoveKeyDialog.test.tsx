// Unit tests for RemoveKeyDialog (spec 063 T097/T098/T099;
// FR-029f/FR-029g, US4 AS2).
// Harness copied from RenameDialog.test.tsx (renderWithI18n + a hand-built
// KeyGridCellViewModel fixture — no @testing-library/jest-dom, raw DOM
// assertions, matching this package's established test convention).
//
// Grouped:
//   1. The core mapping — three outcomes onto two operation kinds
//      (buildRemoveKeyDialogConfirmResult, pure, no rendering).
//   2. Rendering the three co-equal options with their trade-off notes.
//   3. The proposedOutcome seam (T098) — pre-selection, badge, no forced
//      default when absent.
//   4. The suppress shape sub-choice — proposeSuppressFields is the ONLY
//      source of spClass/sentinelId, never a hardcoded literal here.
//   5. The collateral warning seam (T104/T105) — pure display, absent by
//      default.
//   6. Confirm / cancel / focus management / keyboard operability (ARIA APG
//      dialog pattern).
//   7. computeProposedRemoveOutcome (T098) — the three FR-029g proposal
//      rules, including the precedence case (crowding beats layer kind).
//   8. The last-key-in-row default (T099) — keep-row checkbox, its default,
//      its confirm-result mapping, and its absence when not relevant.

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../../test/renderWithI18n.tsx";
import {
  RemoveKeyDialog,
  buildRemoveKeyDialogConfirmResult,
  computeProposedRemoveOutcome,
  classifyLayerKind,
  PLATFORM_ROW_KEY_LIMIT,
  type RemoveKeyDialogConfirmResult,
  type RemoveKeyDialogCollateralWarning,
  type RemoveKeyDialogProps,
} from "./RemoveKeyDialog.tsx";
import type { KeyGridAnnotationCounts, KeyGridCellViewModel } from "./keyGridViewModel.ts";

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMPTY_ANNOTATIONS: KeyGridAnnotationCounts = { longpress: 0, multitap: 0, flick: 0 };

const TARGET_ADDRESS = "touch:phone:default:T_TARGET";

function targetCell(overrides: Partial<KeyGridCellViewModel> = {}): KeyGridCellViewModel {
  return {
    address: TARGET_ADDRESS,
    id: "T_TARGET",
    keycap: "t",
    sp: 0,
    padPct: 15,
    widthPct: 100,
    producedChars: [],
    annotations: EMPTY_ANNOTATIONS,
    findings: [],
    ...overrides,
  };
}

function defaultProps(overrides: Partial<RemoveKeyDialogProps> = {}): RemoveKeyDialogProps {
  return {
    open: true,
    selectedCell: targetCell(),
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. The core mapping (module doc's "The three author-facing outcomes")
// ---------------------------------------------------------------------------

describe("buildRemoveKeyDialogConfirmResult — three outcomes, two operation kinds", () => {
  it("maps 'suppress' to a SuppressKeyOp via proposeSuppressFields, never a hand-rolled literal", () => {
    const holeResult = buildRemoveKeyDialogConfirmResult(TARGET_ADDRESS, "suppress", "keycap-hole");
    expect(holeResult).toEqual({
      outcome: "suppress",
      op: { address: TARGET_ADDRESS, kind: "suppress", spClass: 9, sentinelId: "T_BLANK" },
    });

    const spacerResult = buildRemoveKeyDialogConfirmResult(TARGET_ADDRESS, "suppress", "spacer");
    expect(spacerResult).toEqual({
      outcome: "suppress",
      op: { address: TARGET_ADDRESS, kind: "suppress", spClass: 10, sentinelId: "T_SPACER" },
    });
  });

  it("maps 'reflow' to a RemoveKeyOp carrying outcome 'reflow'", () => {
    const result = buildRemoveKeyDialogConfirmResult(TARGET_ADDRESS, "reflow", "spacer");
    expect(result).toEqual({
      outcome: "reflow",
      op: { address: TARGET_ADDRESS, kind: "remove", outcome: "reflow" },
    });
  });

  it("maps 'redistribute' to a RemoveKeyOp carrying outcome 'redistribute'", () => {
    const result = buildRemoveKeyDialogConfirmResult(TARGET_ADDRESS, "redistribute", "spacer");
    expect(result).toEqual({
      outcome: "redistribute",
      op: { address: TARGET_ADDRESS, kind: "remove", outcome: "redistribute" },
    });
  });

  it("'reflow' and 'redistribute' are the SAME operation kind, differing only in RemoveKeyOp.outcome", () => {
    const reflow = buildRemoveKeyDialogConfirmResult(TARGET_ADDRESS, "reflow", "spacer");
    const redistribute = buildRemoveKeyDialogConfirmResult(TARGET_ADDRESS, "redistribute", "spacer");
    expect(reflow.op.kind).toBe("remove");
    expect(redistribute.op.kind).toBe("remove");
    expect(reflow.op).not.toEqual(redistribute.op);
  });
});

// ---------------------------------------------------------------------------
// 2. Rendering the three co-equal options
// ---------------------------------------------------------------------------

describe("RemoveKeyDialog — the three co-equal options", () => {
  it("renders all three outcomes as a single radiogroup, each with its own trade-off note", () => {
    render(<RemoveKeyDialog {...defaultProps()} />);
    const group = screen.getByRole("radiogroup", { name: /what should happen/i });
    expect(group).toBeTruthy();

    expect(screen.getByText(/suppress in place/i)).toBeTruthy();
    expect(screen.getByText(/remove and reflow/i)).toBeTruthy();
    expect(screen.getByText(/remove and redistribute/i)).toBeTruthy();

    // Each option's OWN trade-off, in its own words (FR-029f "Each option
    // MUST state its trade-off") — not a shared, generic caption.
    expect(screen.getByText(/positions stay identical/i)).toBeTruthy();
    expect(screen.getByText(/absorbs the freed width unevenly/i)).toBeTruthy();
    expect(screen.getByText(/genuinely larger touch target/i)).toBeTruthy();
  });

  it("renders the options in the spec's fixed 1/2/3 order regardless of which is proposed", () => {
    render(<RemoveKeyDialog {...defaultProps({ proposedOutcome: "redistribute" })} />);
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    // The first three radios are the outcome group (the shape sub-group only
    // appears once "suppress" is selected, which it is not here).
    expect(radios.map((r) => r.value)).toEqual(["suppress", "reflow", "redistribute"]);
  });

  it("disables Remove until an explicit choice is made", () => {
    render(<RemoveKeyDialog {...defaultProps()} />);
    expect((screen.getByTestId("remove-key-dialog-confirm") as HTMLButtonElement).disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. The proposedOutcome seam (T098)
// ---------------------------------------------------------------------------

describe("RemoveKeyDialog — the proposedOutcome seam (T098)", () => {
  it("pre-selects nothing and leaves Remove disabled when no proposal is supplied", () => {
    render(<RemoveKeyDialog {...defaultProps()} />);
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios.some((r) => r.checked)).toBe(false);
    expect((screen.getByTestId("remove-key-dialog-confirm") as HTMLButtonElement).disabled).toBe(true);
  });

  it("pre-selects exactly the proposed outcome, badges only that option, and stays fully overridable", () => {
    render(
      <RemoveKeyDialog
        {...defaultProps({ proposedOutcome: "suppress", proposedReason: "This layer has a casing twin." })}
      />,
    );
    const suppressRadio = screen.getByRole("radio", { name: /suppress in place/i }) as HTMLInputElement;
    expect(suppressRadio.checked).toBe(true);

    expect(screen.getByTestId("remove-key-dialog-proposed-suppress")).toBeTruthy();
    expect(screen.queryByTestId("remove-key-dialog-proposed-reflow")).toBeNull();
    expect(screen.getByText(/casing twin/i)).toBeTruthy();

    // Overridable: choosing a different outcome un-checks the proposed one.
    const redistributeRadio = screen.getByRole("radio", { name: /remove and redistribute/i }) as HTMLInputElement;
    fireEvent.click(redistributeRadio);
    expect(redistributeRadio.checked).toBe(true);
    expect(suppressRadio.checked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. The suppress shape sub-choice
// ---------------------------------------------------------------------------

describe("RemoveKeyDialog — the suppress shape sub-choice", () => {
  it("shows the shape choice only once 'Suppress in place' is selected", () => {
    render(<RemoveKeyDialog {...defaultProps()} />);
    expect(screen.queryByTestId("remove-key-dialog-shape")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: /suppress in place/i }));
    expect(screen.getByTestId("remove-key-dialog-shape")).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: /remove and reflow/i }));
    expect(screen.queryByTestId("remove-key-dialog-shape")).toBeNull();
  });

  it("confirms with the spClass/sentinelId that matches the chosen shape, via proposeSuppressFields", () => {
    const onConfirm = vi.fn<(result: RemoveKeyDialogConfirmResult) => void>();
    render(<RemoveKeyDialog {...defaultProps({ onConfirm })} />);

    fireEvent.click(screen.getByRole("radio", { name: /suppress in place/i }));
    fireEvent.click(screen.getByRole("radio", { name: /keycap-shaped hole/i }));
    fireEvent.submit(screen.getByTestId("remove-key-dialog"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const result = onConfirm.mock.calls[0]![0];
    expect(result).toEqual({
      outcome: "suppress",
      op: { address: TARGET_ADDRESS, kind: "suppress", spClass: 9, sentinelId: "T_BLANK" },
    });
  });
});

// ---------------------------------------------------------------------------
// 5. The collateral warning seam (T104/T105)
// ---------------------------------------------------------------------------

describe("RemoveKeyDialog — the collateral warning seam (T104/T105)", () => {
  it("renders nothing collateral-related when no warning is supplied", () => {
    render(<RemoveKeyDialog {...defaultProps()} />);
    expect(screen.queryByTestId("remove-key-dialog-collateral")).toBeNull();
  });

  it("renders lost outputs and still-available-elsewhere as two distinct, already-composed lists", () => {
    const collateralWarning: RemoveKeyDialogCollateralWarning = {
      lostOutputs: ["U+00A1 INVERTED EXCLAMATION MARK (longpress)"],
      stillAvailableElsewhere: ["U+002C COMMA — still reachable on the symbol layer"],
    };
    render(<RemoveKeyDialog {...defaultProps({ collateralWarning })} />);

    const section = screen.getByTestId("remove-key-dialog-collateral");
    expect(section.textContent).toContain("INVERTED EXCLAMATION MARK");
    expect(section.textContent).toContain("still reachable on the symbol layer");
  });

  it("appears before the Confirm button is ever activatable, not after", () => {
    // The dialog itself IS the pre-commit gate (FR-060/FR-061 "before the
    // edit commits") — this asserts the warning is present in the SAME
    // render pass that also shows the disabled Confirm button, never
    // revealed only after a first failed submit.
    const collateralWarning: RemoveKeyDialogCollateralWarning = {
      lostOutputs: ["U+00A1 INVERTED EXCLAMATION MARK (longpress)"],
      stillAvailableElsewhere: [],
    };
    render(<RemoveKeyDialog {...defaultProps({ collateralWarning })} />);
    expect(screen.getByTestId("remove-key-dialog-collateral")).toBeTruthy();
    expect((screen.getByTestId("remove-key-dialog-confirm") as HTMLButtonElement).disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Confirm / cancel / focus management / keyboard operability
// ---------------------------------------------------------------------------

describe("RemoveKeyDialog — confirm, cancel, and focus (ARIA APG dialog pattern)", () => {
  it("renders nothing when closed", () => {
    render(<RemoveKeyDialog {...defaultProps({ open: false })} />);
    expect(screen.queryByTestId("remove-key-dialog")).toBeNull();
  });

  it("renders nothing when nothing is selected", () => {
    render(<RemoveKeyDialog {...defaultProps({ selectedCell: null })} />);
    expect(screen.queryByTestId("remove-key-dialog")).toBeNull();
  });

  it("moves focus into the first radio on open", () => {
    render(<RemoveKeyDialog {...defaultProps()} />);
    const radios = screen.getAllByRole("radio");
    expect(document.activeElement).toBe(radios[0]);
  });

  it("is labelled and exposes the modal dialog role", () => {
    render(<RemoveKeyDialog {...defaultProps()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBeTruthy();
  });

  it("calls onCancel on Escape", () => {
    const onCancel = vi.fn();
    render(<RemoveKeyDialog {...defaultProps({ onCancel })} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when the Cancel button is activated", () => {
    const onCancel = vi.fn();
    render(<RemoveKeyDialog {...defaultProps({ onCancel })} />);
    fireEvent.click(screen.getByTestId("remove-key-dialog-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("fires onConfirm exactly once, with the outcome the author actually picked", () => {
    const onConfirm = vi.fn();
    render(<RemoveKeyDialog {...defaultProps({ onConfirm })} />);

    fireEvent.click(screen.getByRole("radio", { name: /remove and redistribute/i }));
    fireEvent.submit(screen.getByTestId("remove-key-dialog"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({
      outcome: "redistribute",
      op: { address: TARGET_ADDRESS, kind: "remove", outcome: "redistribute" },
    });
  });
});

// ---------------------------------------------------------------------------
// 7. computeProposedRemoveOutcome (T098) — the three FR-029g rules
// ---------------------------------------------------------------------------

function rowOf(sps: ReadonlyArray<number | undefined>): KeyGridCellViewModel[] {
  return sps.map((sp, i) => targetCell({ address: `${TARGET_ADDRESS}_${i}`, id: `K_${i}`, sp }));
}

describe("classifyLayerKind — twin vs. standalone via layerFamilies, never string matching", () => {
  it("classifies the base alphabetic plane and its modifier variants as 'twin'", () => {
    expect(classifyLayerKind("default")).toBe("twin");
    expect(classifyLayerKind("shift")).toBe("twin");
    expect(classifyLayerKind("caps")).toBe("twin");
    expect(classifyLayerKind("rightalt-shift")).toBe("twin");
  });

  it("classifies a named plane (symbol/numeric/alt-script) as 'standalone', per FR-029g's own examples", () => {
    expect(classifyLayerKind("symbol")).toBe("standalone");
    expect(classifyLayerKind("symbol-caps")).toBe("standalone");
  });

  it("classifies a freeform (unparseable) layer id as 'standalone' (FR-067: never a family member)", () => {
    expect(classifyLayerKind("punctuation")).toBe("standalone");
    expect(classifyLayerKind("vowels")).toBe("standalone");
  });
});

describe("PLATFORM_ROW_KEY_LIMIT — the single named constant (FR-029g third bullet)", () => {
  it("carries exactly the check-18-3-keys-per-row.ts limits", () => {
    expect(PLATFORM_ROW_KEY_LIMIT["phone"]).toBe(10);
    expect(PLATFORM_ROW_KEY_LIMIT["tablet"]).toBe(13);
    expect(PLATFORM_ROW_KEY_LIMIT["desktop"]).toBeUndefined();
  });
});

describe("computeProposedRemoveOutcome — the three FR-029g rules, in FR-029g's own precedence", () => {
  it("rule 2: proposes 'suppress' for a twin layer, with a reason naming the mirrored positions", () => {
    const proposal = computeProposedRemoveOutcome({
      platform: "phone",
      layerId: "shift",
      rowKeys: rowOf([0, 0, 0]),
    });
    expect(proposal.outcome).toBe("suppress");
    expect(proposal.reason).toMatch(/mirrors another layer/i);
  });

  it("rule 3: proposes 'redistribute' for a standalone layer, with a reason naming the lack of correspondence", () => {
    const proposal = computeProposedRemoveOutcome({
      platform: "phone",
      layerId: "symbol",
      rowKeys: rowOf([0, 0, 0]),
    });
    expect(proposal.outcome).toBe("redistribute");
    expect(proposal.reason).toMatch(/no positional counterpart/i);
  });

  it("rule 1: proposes 'redistribute' when the row is over the platform limit, with a reason naming the limit", () => {
    const proposal = computeProposedRemoveOutcome({
      platform: "phone",
      layerId: "default",
      rowKeys: rowOf(Array.from({ length: 11 }, () => 0)), // 11 interactive keys, phone limit is 10
    });
    expect(proposal.outcome).toBe("redistribute");
    expect(proposal.reason).toMatch(/phone/i);
    expect(proposal.reason).toMatch(/limit/i);
  });

  it("PRECEDENCE: an over-limit row on a TWIN layer still proposes 'redistribute', never 'suppress'", () => {
    const proposal = computeProposedRemoveOutcome({
      platform: "phone",
      layerId: "shift", // a twin layer — rule 2 would otherwise propose "suppress"
      rowKeys: rowOf(Array.from({ length: 11 }, () => 0)), // over the phone limit of 10
    });
    expect(proposal.outcome).toBe("redistribute");
    expect(proposal.reason).toMatch(/limit/i);
  });

  it("excludes spacer/blank keys (sp:9/10) from the crowding count, matching check-18-3's own filter", () => {
    // 9 interactive keys plus 5 spacers: under the phone limit of 10 on the
    // interactive count alone, even though the row has 14 entries total.
    const rowKeys = [...rowOf(Array.from({ length: 9 }, () => 0)), ...rowOf([9, 9, 10, 10, 10])];
    const proposal = computeProposedRemoveOutcome({ platform: "phone", layerId: "shift", rowKeys });
    expect(proposal.outcome).toBe("suppress"); // rule 2 (twin) applies — not over the limit
  });

  it("a platform absent from PLATFORM_ROW_KEY_LIMIT (e.g. desktop) never triggers the crowding rule", () => {
    const proposal = computeProposedRemoveOutcome({
      platform: "desktop",
      layerId: "shift",
      rowKeys: rowOf(Array.from({ length: 50 }, () => 0)),
    });
    expect(proposal.outcome).toBe("suppress"); // falls through to rule 2 regardless of row size
  });

  it("resolves to the English source text when i18n is omitted (unit-test convention)", () => {
    const proposal = computeProposedRemoveOutcome({ platform: "phone", layerId: "shift", rowKeys: rowOf([0]) });
    expect(typeof proposal.reason).toBe("string");
    expect(proposal.reason.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 8. The last-key-in-row default (T099; FR-029, US4 AS2)
// ---------------------------------------------------------------------------

describe("buildRemoveKeyDialogConfirmResult — the keepRow override (T099)", () => {
  it("keepRow=false (the default) leaves all three original outcomes exactly as before", () => {
    const result = buildRemoveKeyDialogConfirmResult(TARGET_ADDRESS, "redistribute", "spacer");
    expect(result).toEqual({
      outcome: "redistribute",
      op: { address: TARGET_ADDRESS, kind: "remove", outcome: "redistribute" },
    });
  });

  it("keepRow=true overrides 'reflow' to a spacer-shaped suppress, reported as its own 'keepRow' outcome", () => {
    const result = buildRemoveKeyDialogConfirmResult(TARGET_ADDRESS, "reflow", "spacer", true);
    expect(result).toEqual({
      outcome: "keepRow",
      op: { address: TARGET_ADDRESS, kind: "suppress", spClass: 10, sentinelId: "T_SPACER" },
    });
  });

  it("keepRow=true overrides 'redistribute' to the SAME spacer-shaped suppress", () => {
    const result = buildRemoveKeyDialogConfirmResult(TARGET_ADDRESS, "redistribute", "spacer", true);
    expect(result).toEqual({
      outcome: "keepRow",
      op: { address: TARGET_ADDRESS, kind: "suppress", spClass: 10, sentinelId: "T_SPACER" },
    });
  });

  it("keepRow=true is a no-op when outcome is already 'suppress' — nothing to keep, suppress never removes the key", () => {
    const result = buildRemoveKeyDialogConfirmResult(TARGET_ADDRESS, "suppress", "keycap-hole", true);
    expect(result).toEqual({
      outcome: "suppress",
      op: { address: TARGET_ADDRESS, kind: "suppress", spClass: 9, sentinelId: "T_BLANK" },
    });
  });

  it("keepRow=true forces the spacer shape regardless of the caller's suppressShape argument", () => {
    // FR-029/AS2 names a full-width SPACER, never a visible keycap-shaped hole.
    const result = buildRemoveKeyDialogConfirmResult(TARGET_ADDRESS, "reflow", "keycap-hole", true);
    expect(result.op).toEqual({ address: TARGET_ADDRESS, kind: "suppress", spClass: 10, sentinelId: "T_SPACER" });
  });
});

describe("RemoveKeyDialog — the last-key-in-row keep-row control (T099)", () => {
  it("never renders the control when isLastKeyInRow is absent, regardless of the chosen outcome", () => {
    render(<RemoveKeyDialog {...defaultProps()} />);
    fireEvent.click(screen.getByRole("radio", { name: /remove and reflow/i }));
    expect(screen.queryByTestId("remove-key-dialog-keep-row")).toBeNull();
  });

  it("renders the control, checked by default, once isLastKeyInRow is true and 'Remove and reflow' is chosen", () => {
    render(<RemoveKeyDialog {...defaultProps({ isLastKeyInRow: true })} />);
    fireEvent.click(screen.getByRole("radio", { name: /remove and reflow/i }));

    const checkbox = screen.getByTestId("remove-key-dialog-keep-row-checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it("renders the control for 'Remove and redistribute' too", () => {
    render(<RemoveKeyDialog {...defaultProps({ isLastKeyInRow: true })} />);
    fireEvent.click(screen.getByRole("radio", { name: /remove and redistribute/i }));
    expect(screen.getByTestId("remove-key-dialog-keep-row")).toBeTruthy();
  });

  it("does NOT render the control when 'Suppress in place' is chosen — suppress already keeps the row", () => {
    render(<RemoveKeyDialog {...defaultProps({ isLastKeyInRow: true })} />);
    fireEvent.click(screen.getByRole("radio", { name: /suppress in place/i }));
    expect(screen.queryByTestId("remove-key-dialog-keep-row")).toBeNull();
  });

  it("confirms with the keepRow override (default checked) when the last key's row would otherwise empty", () => {
    const onConfirm = vi.fn<(result: RemoveKeyDialogConfirmResult) => void>();
    render(<RemoveKeyDialog {...defaultProps({ isLastKeyInRow: true, onConfirm })} />);

    fireEvent.click(screen.getByRole("radio", { name: /remove and redistribute/i }));
    fireEvent.submit(screen.getByTestId("remove-key-dialog"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0]![0]).toEqual({
      outcome: "keepRow",
      op: { address: TARGET_ADDRESS, kind: "suppress", spClass: 10, sentinelId: "T_SPACER" },
    });
  });

  it("confirms with the plain 'remove' outcome when the author unchecks 'keep this row'", () => {
    const onConfirm = vi.fn<(result: RemoveKeyDialogConfirmResult) => void>();
    render(<RemoveKeyDialog {...defaultProps({ isLastKeyInRow: true, onConfirm })} />);

    fireEvent.click(screen.getByRole("radio", { name: /remove and redistribute/i }));
    fireEvent.click(screen.getByTestId("remove-key-dialog-keep-row-checkbox"));
    fireEvent.submit(screen.getByTestId("remove-key-dialog"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0]![0]).toEqual({
      outcome: "redistribute",
      op: { address: TARGET_ADDRESS, kind: "remove", outcome: "redistribute" },
    });
  });

  it("confirms with a plain 'suppress' outcome (never 'keepRow') when the author chooses Suppress directly", () => {
    const onConfirm = vi.fn<(result: RemoveKeyDialogConfirmResult) => void>();
    render(<RemoveKeyDialog {...defaultProps({ isLastKeyInRow: true, onConfirm })} />);

    fireEvent.click(screen.getByRole("radio", { name: /suppress in place/i }));
    fireEvent.submit(screen.getByTestId("remove-key-dialog"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0]![0]).toEqual({
      outcome: "suppress",
      op: { address: TARGET_ADDRESS, kind: "suppress", spClass: 10, sentinelId: "T_SPACER" },
    });
  });
});
