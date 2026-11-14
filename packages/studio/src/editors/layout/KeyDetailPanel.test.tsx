// KeyDetailPanel — the selected key's detail (spec 117 FR-014..FR-016, US1 scenarios 3, 3a, 4, 6).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import type { LayerCombo } from "@keyboard-studio/contracts";
import type { KeyCellAttribution, RowAttribution } from "@keyboard-studio/engine";
import { render } from "../../test/renderWithI18n.tsx";
import type { WindowsLayout } from "../../lib/windowsLayouts.ts";
import { baseFallbackFor } from "./baseFallbackCells.ts";
import { buildDesktopGridViewModel, type DesktopCellViewModel } from "./desktopGridViewModel.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { KeyDetailPanel } from "./KeyDetailPanel.tsx";

afterEach(cleanup);

const LAYER: LayerCombo = [];
const US: WindowsLayout = { id: "00000409", name: "US", languages: [], family: "qwerty", host: "us" };
const OTHER: WindowsLayout = { id: "0000040c", name: "French", languages: [], family: "azerty", host: "azerty" };

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

function attribution(vkey: string, over: Partial<KeyCellAttribution> = {}): KeyCellAttribution {
  return { vkey, layer: LAYER, plain: row(), rows: [], unhandled: false, frame: false, ...over };
}

function cellOf(
  a: KeyCellAttribution,
  extra: Parameters<typeof buildDesktopGridViewModel>[0] extends infer I ? Partial<I> : never = {},
): DesktopCellViewModel {
  return buildDesktopGridViewModel({ layer: LAYER, cells: [a], state: "ready", ...extra }).cells[0]!;
}

function show(cell: DesktopCellViewModel | null, onViewInCode = vi.fn()) {
  render(<KeyDetailPanel cell={cell} onViewInCode={onViewInCode} />);
  return onViewInCode;
}

describe("KeyDetailPanel", () => {
  it("asks for a selection when there is none", () => {
    show(null);
    expect(screen.getByTestId("key-detail-empty").textContent).toContain("Select a key");
  });

  it("shows the output with nothing before it, the class, the provenance, and the rule count", () => {
    show(cellOf(attribution("K_A")));
    expect(screen.getByTestId("key-detail-heading").textContent).toBe("Key A, layer Default");
    expect(screen.getByTestId("key-detail-output").textContent).toContain("types x");
    expect(screen.getByTestId("key-detail-class").textContent).toBe("Text");
    expect(screen.getByTestId("key-detail-provenance").textContent).toBe("From the starting point");
    expect(screen.getByTestId("key-detail-rule-count").textContent).toBe("1 rule");
    expect(screen.getByTestId("key-detail-editable").textContent).toBe("Yes");
    expect(screen.queryByTestId("key-detail-reason")).toBeNull();
  });

  it("says why a read-only key is read-only, in plain words, and offers view in code (scenario 6)", () => {
    const onView = show(
      cellOf(
        attribution("K_A", {
          plain: row({ ruleNodeId: "opaque1", shape: "opaque", output: null, editable: false, readOnlyReason: "opaque" }),
        }),
      ),
    );
    expect(screen.getByTestId("key-detail-class").textContent).toBe("Code the studio cannot show here");
    expect(screen.getByTestId("key-detail-reason").textContent).toContain("code the studio cannot show here");
    expect(screen.getByTestId("key-detail-editable").textContent).toBe("No, read-only");
    fireEvent.click(screen.getByTestId("key-detail-view-in-code"));
    expect(onView).toHaveBeenCalledWith("opaque1");
  });

  it("gives a distinct plain-words reason for every read-only cause", () => {
    const reasons = [
      "store-based",
      "conditional",
      "opaque",
      "readonly-group",
      "complex-output",
      "later-group-change",
      "never-fires",
    ] as const;
    const seen = new Set<string>();
    for (const reason of reasons) {
      cleanup();
      show(cellOf(attribution("K_A", { plain: row({ output: null, editable: false, readOnlyReason: reason }) })));
      const text = screen.getByTestId("key-detail-reason").textContent ?? "";
      expect(text.length).toBeGreaterThan(20);
      expect(text).not.toContain(reason);
      seen.add(text);
    }
    expect(seen.size).toBe(reasons.length);
  });

  it("explains a mnemonic keyboard", () => {
    show(cellOf(attribution("K_A", { plain: null, unhandled: true }), { mnemonic: true }));
    expect(screen.getByTestId("key-detail-reason").textContent).toContain("mnemonic");
  });

  it("lists contextual rows, each marked editable or read-only, with view in code (scenarios 3, 3a)", () => {
    const onView = show(
      cellOf(
        attribution("K_E", {
          rows: [
            row({
              ruleNodeId: "dk1",
              shape: "deadkey-keystroke",
              context: [{ kind: "deadkey", deadkeyId: "acute" }],
              output: { kind: "text", text: "é" },
            }),
            row({
              ruleNodeId: "st1",
              shape: "store-based",
              context: [{ kind: "text", text: "a" }],
              output: null,
              editable: false,
              readOnlyReason: "store-based",
            }),
          ],
        }),
      ),
    );
    // The plain output stays editable.
    expect(screen.getByTestId("key-detail-editable").textContent).toBe("Yes");
    const dk = screen.getByTestId("key-detail-row-dk1");
    expect(dk.textContent).toContain("After deadkey acute");
    expect(dk.textContent).toContain("U+00E9");
    expect(screen.getByTestId("key-detail-row-dk1-status").textContent).toBe("editable");
    const st = screen.getByTestId("key-detail-row-st1");
    expect(screen.getByTestId("key-detail-row-st1-status").textContent).toBe("read-only");
    expect(st.textContent).toContain("list of characters");
    fireEvent.click(within(st).getByTestId("key-detail-view-in-code"));
    expect(onView).toHaveBeenCalledWith("st1");
    expect(screen.getByTestId("key-detail-rule-count").textContent).toBe("3 rules");
  });

  it("lists every picked base keyboard for a key the keyboard does not handle, primary first (scenario 4)", () => {
    const detail = baseFallbackFor("K_B", LAYER, [US, OTHER]);
    show(cellOf(attribution("K_B", { plain: null, unhandled: true }), { baseFallback: new Map([["K_B", detail]]) }));
    expect(screen.getByTestId("key-detail-provenance").textContent).toBe("Base keyboard fallback");
    const items = within(screen.getByTestId("key-detail-fallback")).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain("US (primary)");
    expect(items[0]!.textContent).toContain("U+0062");
    expect(items[1]!.textContent).toContain("French");
    expect(items[1]!.textContent).not.toContain("primary");
  });

  it("says so when no base keyboard has been picked, and when a policy is not yet in effect", () => {
    show(
      cellOf(attribution("K_B", { plain: null, unhandled: true }), {
        baseFallback: new Map([["K_B", baseFallbackFor("K_B", LAYER, [])]]),
      }),
    );
    expect(screen.getByTestId("key-detail-fallback-none")).toBeTruthy();
    cleanup();
    const detail = baseFallbackFor("K_B", LAYER, [US], { policyDoNothing: () => true });
    show(cellOf(attribution("K_B", { plain: null, unhandled: true }), { baseFallback: new Map([["K_B", detail]]) }));
    expect(screen.getByTestId("key-detail-policy-note").textContent).toContain("does not enforce");
  });

  it("names a system shortcut and an unknown base character in words", () => {
    const shortcut = baseFallbackFor("K_B", ["CTRL"], [US]);
    show(cellOf(attribution("K_B", { plain: null, unhandled: true }), { baseFallback: new Map([["K_B", shortcut]]) }));
    expect(screen.getByTestId("key-detail-fallback-00000409").textContent).toContain("system shortcut");
  });

  it("a frame key shows its class, no provenance, and no view in code", () => {
    show(cellOf(attribution("K_ENTER", { plain: null, frame: true })));
    expect(screen.getByTestId("key-detail-class").textContent).toBe("Frame key");
    expect(screen.queryByTestId("key-detail-provenance")).toBeNull();
    expect(screen.queryByTestId("key-detail-view-in-code")).toBeNull();
    expect(screen.getByTestId("key-detail-reason").textContent).toContain("frame");
  });

  it("explains K_oE2", () => {
    show(cellOf(attribution("K_oE2")));
    expect(screen.getByTestId("key-detail-iso-note").textContent).toContain("beside left Shift");
  });
});

describe("KeyDetailPanel changed in code (spec 117 US8)", () => {
  it("says so when a Code tab edit set the key", () => {
    show(cellOf(attribution("K_A", { plain: row({ provenance: "hand-set", authorEdit: "code-tab" }) })));
    expect(screen.getByTestId("key-detail-changed-in-code").textContent).toContain("Code tab");
  });

  it("does not say so for a Layout tab edit or the starting point", () => {
    show(cellOf(attribution("K_A", { plain: row({ provenance: "hand-set", authorEdit: "layout-tab" }) })));
    expect(screen.queryByTestId("key-detail-changed-in-code")).toBeNull();
  });
});

describe("KeyDetailPanel rules and replaced value (spec 117 US5, FR-016)", () => {
  it("counts the matching rules and lists each with its shape and editability", () => {
    show(
      cellOf(
        attribution("K_E", {
          plain: row({ ruleNodeId: "p1" }),
          rows: [
            row({ ruleNodeId: "dk1", shape: "deadkey-keystroke", context: [{ kind: "deadkey", deadkeyId: "acute" }] }),
            row({ ruleNodeId: "st1", shape: "store-based", output: null, editable: false, readOnlyReason: "store-based" }),
          ],
        }),
      ),
    );
    expect(screen.getByTestId("key-detail-rule-count").textContent).toBe("3 rules");
    expect(screen.getByTestId("key-detail-row-p1").textContent).toContain("plain key rule");
    expect(screen.getByTestId("key-detail-row-p1-status").textContent).toBe("editable");
    expect(screen.getByTestId("key-detail-row-dk1").textContent).toContain("deadkey combination");
    expect(screen.getByTestId("key-detail-row-st1").textContent).toContain("list of characters");
    expect(screen.getByTestId("key-detail-row-st1-status").textContent).toBe("read-only");
  });

  it("view in code defaults to the rule that fires with nothing before it", () => {
    const onView = show(
      cellOf(attribution("K_E", { plain: row({ ruleNodeId: "p1" }), rows: [row({ ruleNodeId: "dk1", shape: "deadkey-keystroke", context: [{ kind: "deadkey", deadkeyId: "acute" }] })] })),
    );
    const buttons = screen.getAllByTestId("key-detail-view-in-code");
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]!);
    expect(onView).toHaveBeenCalledWith("p1");
  });

  it("shows the replaced starting-point value only for a hand-set key", () => {
    const hand = cellOf(attribution("K_A", { plain: row({ provenance: "hand-set", authorEdit: "layout-tab" }) }));
    show(hand, vi.fn());
    cleanup();
    render(<KeyDetailPanel cell={hand} onViewInCode={vi.fn()} replaced={{ kind: "text", text: "a" }} />);
    expect(screen.getByTestId("key-detail-replaced").textContent).toContain("U+0061");
    cleanup();
    render(<KeyDetailPanel cell={cellOf(attribution("K_A"))} onViewInCode={vi.fn()} replaced={{ kind: "text", text: "a" }} />);
    expect(screen.queryByTestId("key-detail-replaced")).toBeNull();
  });
});

describe("KeyDetailPanel: provisional key (FR-031)", () => {
  const provisionalCell = () =>
    cellOf(attribution("K_COMMA", { plain: null, unhandled: true }), {
      baseFallback: new Map([["K_COMMA", baseFallbackFor("K_COMMA", LAYER, [US])]]),
    });

  it("offers to change the fallback policy for the key's class, and opens the fallback surface", () => {
    show(provisionalCell());
    expect(screen.getByTestId("key-detail-provisional").textContent).toContain("provisional");
    const button = screen.getByTestId("key-detail-change-policy");
    expect(button.textContent).toBe("Change the fallback policy for punctuation and symbols");
    expect(screen.queryByTestId("fallback-policy-section")).toBeNull();
    fireEvent.click(button);
    expect(screen.getByTestId("fallback-policy-section")).toBeTruthy();
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("does not set the policy itself", () => {
    const before = useWorkingCopyStore.getState().fallbackPolicy;
    show(provisionalCell());
    fireEvent.click(screen.getByTestId("key-detail-change-policy"));
    expect(useWorkingCopyStore.getState().fallbackPolicy).toBe(before);
  });

  it("is absent for a key that is not provisional", () => {
    show(cellOf(attribution("K_A")));
    expect(screen.queryByTestId("key-detail-provisional")).toBeNull();
    expect(screen.queryByTestId("key-detail-change-policy")).toBeNull();
  });
});
