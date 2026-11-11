// LayoutPane — the Layout tab end to end over the real stores and the real attribution hook
// (spec 117 US1: FR-010a, FR-011, FR-017, FR-018, scenarios 1, 6, 7). Only the compiled keyboard
// is faked: `fetch` returns placeholder bytes and the simulator is replaced by a table of what
// "the compiled keyboard" types, which a test changes to republish the artifact.

import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { diffIR, parseKmn } from "@keyboard-studio/engine";
import type { KeyboardIR, SimKeyInput, SimulationStep } from "@keyboard-studio/contracts";
import { render } from "../../test/renderWithI18n.tsx";
import {
  makeErrorRulesDemoArtifact,
  makeIdleRulesDemoArtifact,
  makeReadyRulesDemoArtifact,
  useRulesDemoArtifactStore,
} from "../../stores/rulesDemoArtifactStore.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { LayoutPane } from "./LayoutPane.tsx";

/** What the fake compiled keyboard types, by virtual key. Tests change it to "republish". */
const compiled = vi.hoisted(() => ({ typed: new Map<string, string>(), fired: new Set<string>() }));

vi.mock("@keyboard-studio/engine/context-tolerance", () => {
  const simulateEach = (_c: unknown, inputs: readonly SimKeyInput[], seed?: { text?: string }): SimulationStep[] =>
    inputs.map((input) => ({
      input,
      outputAfter: `${seed?.text ?? ""}${compiled.typed.get(input.vkey) ?? ""}`,
      pendingDeadkeys: [],
      beep: false,
      ...(compiled.fired.has(input.vkey) ? { firedRule: { group: "main", ruleIndex: 0 } } : {}),
    }));
  return { simulate: vi.fn(), simulateEach };
});

const KMN = `store(&VERSION) '10.0'
store(&NAME) 'T'
begin Unicode > use(main)
group(main) using keys
+ [K_A] > 'x'
+ [K_B] > 'y'
+ [SHIFT K_A] > 'X'
`;

const MNEMONIC = `store(&VERSION) '10.0'
store(&NAME) 'T'
store(&MNEMONICLAYOUT) '1'
begin Unicode > use(main)
group(main) using keys
+ 'a' > 'x'
`;

let urlCounter = 0;
/** The jsBytes cache is keyed by URL, so each republish uses a fresh one. */
function nextUrl(): string {
  urlCounter += 1;
  return `blob:layout-pane-test-${urlCounter}`;
}

function publish(): void {
  act(() => {
    useRulesDemoArtifactStore.setState({ artifact: makeReadyRulesDemoArtifact(nextUrl(), "t") });
  });
}

function load(kmn: string): KeyboardIR {
  const ir = parseKmn(kmn, "t").ir;
  useWorkingCopyStore.setState({ ir, startIr: ir, desktopLocked: false });
  return ir;
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

const cell = (vkey: string): HTMLElement => screen.getByTestId(`layout-cell-${vkey}`);

beforeEach(() => {
  compiled.fired = new Set();
  compiled.typed = new Map([
    ["K_A", "x"],
    ["K_B", "y"],
  ]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode("// compiled").buffer })),
  );
  useRulesDemoArtifactStore.setState({ artifact: makeIdleRulesDemoArtifact() });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useWorkingCopyStore.setState({ ir: null, startIr: null, desktopLocked: false });
  useRulesDemoArtifactStore.setState({ artifact: makeIdleRulesDemoArtifact() });
});

describe("LayoutPane", () => {
  it("says there is nothing to show without a keyboard", () => {
    useWorkingCopyStore.setState({ ir: null, startIr: null });
    render(<LayoutPane onViewInCode={vi.fn()} />);
    expect(screen.getByTestId("layout-pane-empty")).toBeTruthy();
  });

  it("shows each key's compiled output, from the starting point, once the keyboard compiles (scenario 1)", async () => {
    load(KMN);
    render(<LayoutPane onViewInCode={vi.fn()} />);
    publish();
    await settle();
    expect(cell("K_A").getAttribute("aria-label")).toContain("types x");
    expect(cell("K_A").getAttribute("aria-label")).toContain("From the starting point");
    expect(cell("K_A").getAttribute("aria-readonly")).toBeNull();
    expect(screen.queryByTestId("layout-banner-not-compiled")).toBeNull();
    expect(screen.queryByTestId("layout-banner-stale")).toBeNull();
  });

  it("lists default and Shift as layers, default first, and the grid names the active layer", async () => {
    load(KMN);
    render(<LayoutPane onViewInCode={vi.fn()} />);
    publish();
    await settle();
    const tabs = within(screen.getByTestId("key-layer-selector")).getAllByRole("tab");
    // Each tab also carries its provisional key count.
    expect(tabs.map((t) => t.textContent?.replace(/\d+$/, ""))).toEqual(["Default", "Shift"]);
    expect(screen.getByRole("grid").getAttribute("aria-label")).toBe("Desktop layout, Default layer");
    fireEvent.click(screen.getByTestId("key-layer-selector-option-SHIFT"));
    expect(screen.getByRole("grid").getAttribute("aria-label")).toBe("Desktop layout, Shift layer");
  });

  it("keeps the selected key when the layer changes", async () => {
    load(KMN);
    render(<LayoutPane onViewInCode={vi.fn()} />);
    publish();
    await settle();
    fireEvent.click(cell("K_A"));
    expect(screen.getByTestId("key-detail-heading").textContent).toBe("Key A, layer Default");
    fireEvent.click(screen.getByTestId("key-layer-selector-option-SHIFT"));
    expect(cell("K_A").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("key-detail-heading").textContent).toBe("Key A, layer Shift");
  });

  it("opens the Code tab at the rule from the detail panel", async () => {
    const ir = load(KMN);
    const onViewInCode = vi.fn();
    render(<LayoutPane onViewInCode={onViewInCode} />);
    publish();
    await settle();
    fireEvent.click(cell("K_A"));
    fireEvent.click(screen.getByTestId("key-detail-view-in-code"));
    expect(onViewInCode).toHaveBeenCalledWith(ir.groups[0]!.rules[0]!.nodeId);
  });

  describe("banners", () => {
    it("explains a keyboard that has not compiled, with every key read-only", () => {
      load(KMN);
      render(<LayoutPane onViewInCode={vi.fn()} />);
      expect(screen.getByTestId("layout-banner-not-compiled").textContent).toContain("has not compiled yet");
      expect(cell("K_A").getAttribute("aria-readonly")).toBe("true");
      expect(cell("K_A").getAttribute("aria-label")).toContain("not compiled yet");
    });

    it("lists the compile error and links to the Code tab when the first compile fails", () => {
      const ir = load(KMN);
      const onViewInCode = vi.fn();
      useRulesDemoArtifactStore.setState({
        artifact: makeErrorRulesDemoArtifact("compile", "syntax error near line 7", []),
      });
      render(<LayoutPane onViewInCode={onViewInCode} />);
      expect(screen.getByTestId("layout-banner-not-compiled").textContent).toContain("does not compile");
      expect(screen.getByTestId("layout-compile-error-message").textContent).toContain("syntax error near line 7");
      fireEvent.click(screen.getByTestId("layout-open-code"));
      expect(onViewInCode).toHaveBeenCalledWith(ir.groups[0]!.nodeId);
    });

    it("keeps the last good result, marked stale, when a later compile fails", async () => {
      load(KMN);
      render(<LayoutPane onViewInCode={vi.fn()} />);
      publish();
      await settle();
      act(() => {
        useRulesDemoArtifactStore.setState({
          artifact: makeErrorRulesDemoArtifact("compile", "broke", []),
        });
      });
      await settle();
      expect(screen.getByTestId("layout-banner-stale").textContent).toContain("last result that did");
      expect(cell("K_A").getAttribute("aria-label")).toContain("types x");
      expect(screen.getByTestId("layout-compile-error-message").textContent).toContain("broke");
    });
  });

  it("renders a mnemonic keyboard read-only with the reason and a Code-tab link (FR-018)", async () => {
    const ir = load(MNEMONIC);
    const onViewInCode = vi.fn();
    render(<LayoutPane onViewInCode={onViewInCode} />);
    publish();
    await settle();
    expect(screen.getByTestId("layout-banner-mnemonic").textContent).toContain("mnemonic");
    for (const key of ["K_A", "K_B", "K_Q"]) expect(cell(key).getAttribute("aria-readonly")).toBe("true");
    fireEvent.click(cell("K_A"));
    expect(screen.getByTestId("key-detail-editable").textContent).toBe("No, read-only");
    fireEvent.click(screen.getByTestId("layout-open-code"));
    expect(onViewInCode).toHaveBeenCalledWith(ir.groups[0]!.nodeId);
  });

  it("renders a locked desktop step read-only with the Assign tab's lock message", async () => {
    load(KMN);
    useWorkingCopyStore.setState({ desktopLocked: true });
    render(<LayoutPane onViewInCode={vi.fn()} />);
    publish();
    await settle();
    expect(screen.getByTestId("layout-banner-locked").textContent).toContain(
      "This desktop layout is complete. Editing it will flag your touch layout for re-review.",
    );
    expect(cell("K_A").getAttribute("aria-readonly")).toBe("true");
    expect(cell("K_A").getAttribute("aria-label")).toContain("read-only");
  });

  describe("Add layer (FR-010a)", () => {
    async function openDialog() {
      load(KMN);
      render(<LayoutPane onViewInCode={vi.fn()} />);
      publish();
      await settle();
      fireEvent.click(screen.getByTestId("layout-add-layer"));
    }

    it("adds a combination as a layer labelled 'not saved until a key is set', selects it, and returns focus", async () => {
      await openDialog();
      fireEvent.change(screen.getByTestId("add-layer-alt"), { target: { value: "RALT" } });
      expect(screen.getByTestId("add-layer-preview").textContent).toContain("AltGr");
      expect(screen.queryByTestId("add-layer-shortcut")).toBeNull();
      fireEvent.click(screen.getByTestId("add-layer-confirm"));
      await settle();
      const tab = screen.getByTestId("key-layer-selector-option-RALT");
      expect(tab.getAttribute("aria-selected")).toBe("true");
      expect(tab.textContent).toContain("not saved");
      expect(screen.getByTestId("layout-unsaved-layer").textContent).toContain("not saved until a key is set");
      expect(screen.queryByTestId("add-layer-dialog")).toBeNull();
      expect(document.activeElement).toBe(screen.getByTestId("layout-add-layer"));
    });

    it("shows the system-shortcut consequence for Ctrl or Alt without AltGr before confirming", async () => {
      await openDialog();
      fireEvent.change(screen.getByTestId("add-layer-ctrl"), { target: { value: "CTRL" } });
      expect(screen.getByTestId("add-layer-shortcut").textContent).toContain("shortcut");
      expect(screen.getByTestId("add-layer-confirm").textContent).toBe("Add layer anyway");
      // Nothing was added yet.
      expect(screen.queryByTestId("key-layer-selector-option-CTRL")).toBeNull();
    });

    it("cancels without adding a layer", async () => {
      await openDialog();
      fireEvent.change(screen.getByTestId("add-layer-alt"), { target: { value: "RALT" } });
      fireEvent.click(screen.getByTestId("add-layer-cancel"));
      expect(screen.queryByTestId("key-layer-selector-option-RALT")).toBeNull();
      expect(document.activeElement).toBe(screen.getByTestId("layout-add-layer"));
    });

    it("an added layer's keys show base-keyboard fallback until edited", async () => {
      await openDialog();
      fireEvent.change(screen.getByTestId("add-layer-alt"), { target: { value: "RALT" } });
      fireEvent.click(screen.getByTestId("add-layer-confirm"));
      await settle();
      expect(cell("K_A").getAttribute("data-provenance")).toBe("base-fallback");
    });
  });

  describe("US1 scenario 7: the cell follows the compiled keyboard", () => {
    it("reflects an Assign-tab assignment after the artifact is republished", async () => {
      load(KMN);
      render(<LayoutPane onViewInCode={vi.fn()} />);
      publish();
      await settle();
      expect(cell("K_A").getAttribute("aria-label")).toContain("types x");

      // The Assign tab records the assignment; the existing validation cycle recompiles and
      // republishes. The compiled keyboard now types z on K_A.
      useWorkingCopyStore.getState().recordAssignments([]);
      compiled.typed.set("K_A", "z");
      publish();
      await waitFor(() => expect(cell("K_A").getAttribute("aria-label")).toContain("types z"));
      expect(cell("K_A").getAttribute("aria-label")).toContain("Complex output");
      expect(cell("K_A").getAttribute("aria-readonly")).toBe("true");
      expect(cell("K_B").getAttribute("aria-label")).toContain("types y");
    });

    it("reflects an Assign-tab assignment on a key with no rule, instead of the base keyboard", async () => {
      load(KMN);
      render(<LayoutPane onViewInCode={vi.fn()} />);
      publish();
      await settle();
      // K_C has no rule: base-keyboard fallback.
      expect(cell("K_C").getAttribute("data-provenance")).toBe("base-fallback");

      // The assignment reaches the artifact through the projection, so the working IR still has
      // no rule for K_C, but the compiled keyboard fires one.
      useWorkingCopyStore.getState().recordAssignments([]);
      compiled.typed.set("K_C", "q");
      compiled.fired.add("K_C");
      publish();
      await waitFor(() => expect(cell("K_C").getAttribute("aria-label")).toContain("types q"));
      expect(cell("K_C").getAttribute("data-provenance")).toBe("hand-set");
      expect(cell("K_C").getAttribute("aria-label")).toContain("Hand-set");
      expect(cell("K_C").getAttribute("aria-readonly")).toBeNull();
      fireEvent.click(cell("K_C"));
      expect(screen.queryByTestId("key-detail-fallback")).toBeNull();
    });

    it("reflects a Code-tab Apply after the artifact is republished, hand-set from the Code tab", async () => {
      const ir = load(KMN);
      render(<LayoutPane onViewInCode={vi.fn()} />);
      publish();
      await settle();
      expect(cell("K_C").getAttribute("data-provenance")).toBe("base-fallback");

      // The Code tab's Apply adds a rule to the live IR; the validation cycle recompiles and
      // republishes, and the compiled keyboard now fires it.
      const changes = diffIR(ir, parseKmn(`${KMN}+ [K_C] > 'q'
`, "t").ir);
      act(() => {
        expect(useWorkingCopyStore.getState().commitKmnEdit({ op: "code-apply", changes, overrides: [] }).ok).toBe(true);
      });
      compiled.typed.set("K_C", "q");
      compiled.fired.add("K_C");
      publish();
      await waitFor(() => expect(cell("K_C").getAttribute("aria-label")).toContain("types q"));
      expect(cell("K_C").getAttribute("data-provenance")).toBe("hand-set");
      fireEvent.click(cell("K_C"));
      expect(screen.getByTestId("key-detail-changed-in-code")).toBeTruthy();
    });
  });
});

describe("LayoutPane deadkey table close and edit-panel placement", () => {
  const DK_KMN = `store(&VERSION) '10.0'
store(&NAME) 'T'
store(dk_3000_bases) 'e'
store(dk_3000_output) U+00E9
begin Unicode > use(main)
group(main) using keys
+ [K_A] > 'x'
+ [K_B] > 'y'
+ [K_D] > dk(3000)
dk(3000) + any(dk_3000_bases) > index(dk_3000_output, 2)
`;

  async function loadDeadkeys(): Promise<void> {
    load(DK_KMN);
    render(<LayoutPane onViewInCode={vi.fn()} />);
    publish();
    await settle();
  }

  const openButtonFor = (id: string): HTMLElement =>
    within(
      screen.getAllByTestId("deadkey-list-item").find((e) => e.getAttribute("data-deadkey") === id)!,
    ).getByTestId("deadkey-list-open");

  it("renders the edit panel directly under the grid, above the detail panel", async () => {
    load(KMN);
    render(<LayoutPane onViewInCode={vi.fn()} />);
    publish();
    await settle();
    fireEvent.click(cell("K_A"));
    const edit = screen.getByTestId("key-edit-panel");
    const detail = screen.getByTestId("key-detail-panel");
    expect(edit.compareDocumentPosition(detail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("a deadkey table closes and returns focus to its list row's Open button", async () => {
    await loadDeadkeys();
    fireEvent.click(screen.getByTestId("deadkey-list-toggle"));
    fireEvent.click(openButtonFor("3000"));
    expect(screen.getByTestId("deadkey-table-panel")).toBeTruthy();
    fireEvent.click(screen.getByTestId("deadkey-table-close"));
    expect(screen.queryByTestId("deadkey-table-panel")).toBeNull();
    expect(screen.getByTestId("deadkey-list-toggle").getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(openButtonFor("3000"));
  });

  it("the deadkey list is collapsed on arrival: no rows and no table until the author asks", async () => {
    await loadDeadkeys();
    expect(screen.getByTestId("deadkey-list-toggle").getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("deadkey-list-item")).toBeNull();
    expect(screen.queryByTestId("deadkey-table-panel")).toBeNull();
  });

  it("closing a new deadkey's table without deciding re-proposes the space row on reopen; declining it does not", async () => {
    await loadDeadkeys();
    fireEvent.click(cell("K_B"));
    fireEvent.click(screen.getByTestId("key-edit-deadkey"));
    fireEvent.change(screen.getByTestId("key-edit-deadkey-display"), { target: { value: "´" } });
    fireEvent.click(screen.getByTestId("key-edit-confirm"));
    expect(screen.getByTestId("deadkey-table-panel")).toBeTruthy();
    expect(screen.getByTestId("deadkey-table-space-proposal")).toBeTruthy();
    const newId = useWorkingCopyStore
      .getState()
      .deadkeyOverlay.ops.find((o) => o.kind === "define")?.id;
    expect(newId).not.toBeUndefined();
    const ref = newId!.toString(16).padStart(4, "0");

    // Close without deciding, reopen: the proposal is back.
    fireEvent.click(screen.getByTestId("deadkey-table-close"));
    expect(screen.queryByTestId("deadkey-table-panel")).toBeNull();
    fireEvent.click(openButtonFor(ref));
    expect(screen.getByTestId("deadkey-table-space-proposal")).toBeTruthy();

    // Decline it explicitly, close, reopen: no proposal this time.
    fireEvent.click(screen.getByTestId("deadkey-table-space-remove"));
    fireEvent.click(screen.getByTestId("deadkey-table-close"));
    fireEvent.click(openButtonFor(ref));
    expect(screen.queryByTestId("deadkey-table-space-proposal")).toBeNull();
  });

  it("an open deadkey table stays open when another key is selected — Close is the way out", async () => {
    await loadDeadkeys();
    fireEvent.click(screen.getByTestId("deadkey-list-toggle"));
    fireEvent.click(openButtonFor("3000"));
    expect(screen.getByTestId("deadkey-table-panel")).toBeTruthy();
    fireEvent.click(cell("K_A"));
    expect(screen.getByTestId("deadkey-table-panel")).toBeTruthy();
  });

  it("re-observes the edit panel for the scroll safety net after an after-view round trip", async () => {
    // jsdom has no ResizeObserver and no layout, so the observer is stubbed and the
    // observe calls themselves are the assertion: without the after-view in the dep
    // array the observer keeps watching the detached node and never re-observes.
    const observed: Element[] = [];
    class MockResizeObserver {
      constructor(_cb: ResizeObserverCallback) {}
      observe = (el: Element): void => {
        observed.push(el);
      };
      unobserve = (): void => {};
      disconnect = (): void => {};
    }
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    await loadDeadkeys();
    fireEvent.click(cell("K_A"));
    expect(observed).toHaveLength(1);
    expect(observed[0]?.querySelector('[data-testid="key-edit-panel"]')).not.toBeNull();
    // Open the after-view: the edit panel unmounts. Return: it remounts.
    fireEvent.change(screen.getByTestId("layout-after-select"), { target: { value: "3000" } });
    await settle();
    expect(screen.getByTestId("after-context-close")).toBeTruthy();
    fireEvent.click(screen.getByTestId("after-context-close"));
    await settle();
    expect(observed).toHaveLength(2);
    expect(observed[1]).toBe(screen.getByTestId("key-edit-panel").parentElement);
  });
});

describe("LayoutPane undo (spec 117 US2)", () => {
  it("offers undo only when the top undo entry is a Layout edit, and undoes it", async () => {
    load(KMN);
    publish();
    render(<LayoutPane onViewInCode={vi.fn()} />);
    await settle();
    const undo = screen.getByTestId("layout-undo") as HTMLButtonElement;
    expect(undo.disabled).toBe(true);
    act(() => {
      useWorkingCopyStore
        .getState()
        .commitKmnEdit({ op: "set-key", vkey: "K_B", layer: [], output: { kind: "text", text: "z" } });
    });
    expect((screen.getByTestId("layout-undo") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId("layout-undo"));
    expect((screen.getByTestId("layout-undo") as HTMLButtonElement).disabled).toBe(true);
    expect(useWorkingCopyStore.getState().undoStack).toEqual([]);
  });

  it("shows each layer's provisional key count, and an assigned key is not provisional (US6 scenario 1)", async () => {
    load(KMN);
    render(<LayoutPane onViewInCode={vi.fn()} />);
    publish();
    await settle();
    expect(cell("K_A").getAttribute("data-provisional")).toBe("false");
    expect(cell("K_D").getAttribute("data-provisional")).toBe("true");
    const provisionalIn = (cells: HTMLElement[]) => cells.filter((c) => c.getAttribute("data-provisional") === "true").length;
    const defaultCount = provisionalIn(screen.getAllByRole("gridcell"));
    expect(defaultCount).toBeGreaterThan(0);
    expect(screen.getByTestId("key-layer-selector-count-default").textContent).toBe(String(defaultCount));
    const shiftCount = Number(screen.getByTestId("key-layer-selector-count-SHIFT").textContent);
    expect(shiftCount).toBeGreaterThan(0);
    expect(screen.getByTestId("key-layer-selector-option-SHIFT").getAttribute("aria-label")).toContain("provisional keys");
    fireEvent.click(screen.getByTestId("key-layer-selector-option-SHIFT"));
    expect(provisionalIn(screen.getAllByRole("gridcell"))).toBe(shiftCount);
  });

  it("a provisional key's detail reaches the fallback policy surface", async () => {
    load(KMN);
    render(<LayoutPane onViewInCode={vi.fn()} />);
    publish();
    await settle();
    fireEvent.click(cell("K_D"));
    fireEvent.click(screen.getByTestId("key-detail-change-policy"));
    expect(screen.getByTestId("fallback-policy-section")).toBeTruthy();
  });

});
