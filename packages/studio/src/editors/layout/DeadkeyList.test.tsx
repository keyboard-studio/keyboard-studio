// DeadkeyList (spec 117 T083): every deadkey the keyboard defines, including one on no key (place
// it on the selected key or delete it through spec 083), the "no combinations yet" flag, and one
// deadkey on several keys or layers shown once.

import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attributeLayer, emitKmn, parseKmn } from "@keyboard-studio/engine";
import type { LayerCombo } from "@keyboard-studio/contracts";
import { render } from "../../test/renderWithI18n.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { makeReadyRulesDemoArtifact, useRulesDemoArtifactStore } from "../../stores/rulesDemoArtifactStore.ts";
import { buildDesktopGridViewModel } from "./desktopGridViewModel.ts";
import type { DesktopCellViewModel } from "./desktopGridViewModel.ts";
import { DeadkeyList } from "./DeadkeyList.tsx";

const KMN = `store(&VERSION) '10.0'
store(&NAME) 'dkl'
store(&TARGETS) 'any'
store(dk_3000_bases) 'e'
store(dk_3000_output) U+00E9
begin Unicode > use(main)

group(main) using keys

+ [K_A] > 'a'
+ [K_B] > 'b'
+ [K_D] > dk(3000)
+ [SHIFT K_D] > dk(3000)
+ [K_Q] > dk(3001)
dk(3000) + any(dk_3000_bases) > index(dk_3000_output, 2)
dk(3000) + [K_D] > U+00B4
dk(3001) + [K_Q] > U+02C6
dk(3002) + [K_Q] > U+00A8
`;

const LAYERS: readonly LayerCombo[] = [[], ["SHIFT"]];

function seed(): void {
  const ir = parseKmn(KMN, "dkl").ir;
  useWorkingCopyStore.setState({ ir, startIr: ir, undoStack: [], desktopLocked: false, deadkeyOverlay: { ops: [] } });
  useDecisionStore.getState().reset();
  useRulesDemoArtifactStore.getState().setArtifact(makeReadyRulesDemoArtifact("blob:dkl", "dkl"));
}

function cellFor(vkey: string, layer: LayerCombo = []): DesktopCellViewModel {
  const ir = useWorkingCopyStore.getState().ir!;
  const vm = buildDesktopGridViewModel({ layer, cells: attributeLayer(ir, layer, [vkey]), state: "ready" });
  return vm.cells.find((c) => c.vkey === vkey)!;
}

const text = (): string => emitKmn(useWorkingCopyStore.getState().ir!);
const item = (id: string): HTMLElement =>
  screen.getAllByTestId("deadkey-list-item").find((e) => e.getAttribute("data-deadkey") === id)!;

function list(selectedCell: DesktopCellViewModel | null = null) {
  const onOpen = vi.fn();
  const onDeleted = vi.fn();
  render(<DeadkeyList layers={LAYERS} openId={null} selectedCell={selectedCell} onOpen={onOpen} onDeleted={onDeleted} />);
  return { onOpen, onDeleted };
}

beforeEach(seed);
afterEach(cleanup);

describe("DeadkeyList", () => {
  it("lists each deadkey once, with every key and layer that types it", () => {
    list();
    const dk = item("3000");
    expect(within(dk).getByTestId("deadkey-list-keys").textContent).toContain("D (Default)");
    expect(within(dk).getByTestId("deadkey-list-keys").textContent).toContain("D (Shift)");
    expect(screen.getAllByTestId("deadkey-list-item").filter((e) => e.getAttribute("data-deadkey") === "3000")).toHaveLength(1);
  });

  it("opens a deadkey's table", () => {
    const { onOpen } = list();
    fireEvent.click(within(item("3000")).getByTestId("deadkey-list-open"));
    expect(onOpen).toHaveBeenCalledWith("3000");
  });

  it("flags a deadkey with no combinations and none on a deadkey that has them", () => {
    list();
    expect(within(item("3000")).queryByTestId("deadkey-list-empty-flag")).toBeNull();
    // dk(3001) has a keystroke row but no fan-out; dk(3002) has a row and sits on no key.
    expect(within(item("3002")).queryByTestId("deadkey-list-unplaced")).not.toBeNull();
  });

  it("flags a deadkey whose only rule is its trigger", () => {
    cleanup();
    const ir = parseKmn(KMN.replace("dk(3001) + [K_Q] > U+02C6\n", ""), "dkl").ir;
    useWorkingCopyStore.setState({ ir, startIr: ir });
    list();
    expect(within(item("3001")).getByTestId("deadkey-list-empty-flag")).toBeTruthy();
  });

  it("a deadkey on no key can be placed on the selected key", () => {
    cleanup();
    list(cellFor("K_B"));
    const before = text();
    fireEvent.click(within(item("3002")).getByTestId("deadkey-list-place"));
    expect(text()).not.toBe(before);
    expect(text()).toContain("+ [K_B] > dk(3002)");
    // Recorded as a decision, with the current op list.
    expect(useDecisionStore.getState().decisions["deadkeys-defined"]?.provenance).toBe("asked");
  });

  it("place is unavailable without an editable selected key", () => {
    list(null);
    expect((within(item("3002")).getByTestId("deadkey-list-place") as HTMLButtonElement).disabled).toBe(true);
  });

  it("deletes a deadkey through the lifecycle only after a confirm", () => {
    cleanup();
    list();
    fireEvent.click(within(item("3000")).getByTestId("deadkey-list-delete"));
    expect(text()).toContain("dk_3000_bases");
    fireEvent.click(within(item("3000")).getByTestId("deadkey-list-delete-confirm"));
    expect(text()).not.toContain("dk_3000_bases");
    expect(useWorkingCopyStore.getState().deadkeyOverlay.ops).toEqual([{ kind: "delete", id: 0x3000 }]);
  });

  it("cancelling a delete writes nothing", () => {
    list();
    const before = text();
    fireEvent.click(within(item("3000")).getByTestId("deadkey-list-delete"));
    fireEvent.click(within(item("3000")).getByTestId("deadkey-list-delete-cancel"));
    expect(text()).toBe(before);
  });
});
