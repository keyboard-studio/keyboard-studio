// DeadkeyTablePanel (spec 117 T077): fan-out rows (base character -> result, with the key that
// types it) and keystroke-keyed rows (key + layer -> result); add, change, remove for both; a
// store-using row outside the fan-out shape read-only with "view in code" while the others stay
// editable; the space row proposed (not written) for a new deadkey; chains link to "after"; and a
// deadkey with no combinations is flagged.

import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emitKmn, parseKmn } from "@keyboard-studio/engine";
import type { KmnEditsValue, LayerCombo } from "@keyboard-studio/contracts";
import { render } from "../../test/renderWithI18n.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { makeReadyRulesDemoArtifact, useRulesDemoArtifactStore } from "../../stores/rulesDemoArtifactStore.ts";
import { DeadkeyTablePanel } from "./DeadkeyTablePanel.tsx";

const KMN = `store(&VERSION) '10.0'
store(&NAME) 'dtp'
store(&TARGETS) 'any'
store(dk_3000_bases) 'ae'
store(dk_3000_output) U+00E1 U+00E9
store(wide) [K_X] [K_W]
begin Unicode > use(main)

group(main) using keys

+ [K_A] > 'a'
+ [K_E] > 'e'
+ [SHIFT K_E] > 'E'
+ [K_D] > dk(3000)
+ [K_Q] > dk(3001)
dk(3000) + any(dk_3000_bases) > index(dk_3000_output, 2)
dk(3000) + [K_D] > U+00B4
dk(3000) + [K_O] > U+00F3
dk(3000) + [K_Y] > dk(3001)
dk(3000) + any(wide) > 'z'
dk(3001) + [K_Q] > U+02C6
`;

const LAYERS: readonly LayerCombo[] = [[], ["SHIFT"]];

function seed(kmn = KMN): void {
  const ir = parseKmn(kmn, "dtp").ir;
  useWorkingCopyStore.setState({
    ir,
    startIr: ir,
    undoStack: [],
    desktopLocked: false,
    deadkeyOverlay: { ops: [] },
  });
  useDecisionStore.getState().reset();
  useRulesDemoArtifactStore.getState().setArtifact(makeReadyRulesDemoArtifact("blob:dtp", "dtp"));
}

const text = (): string => emitKmn(useWorkingCopyStore.getState().ir!);
const logged = (): KmnEditsValue | undefined =>
  useDecisionStore.getState().decisions["kmn-edits"]?.value as KmnEditsValue | undefined;
const top = () => {
  const stack = useWorkingCopyStore.getState().undoStack;
  return stack[stack.length - 1];
};

function panel(props: Partial<React.ComponentProps<typeof DeadkeyTablePanel>> = {}) {
  const onViewInCode = vi.fn();
  const onShowAfter = vi.fn();
  render(
    <DeadkeyTablePanel deadkeyId="3000" layers={LAYERS} onViewInCode={onViewInCode} onShowAfter={onShowAfter} {...props} />,
  );
  return { onViewInCode, onShowAfter };
}

beforeEach(() => seed());
afterEach(cleanup);

describe("DeadkeyTablePanel", () => {
  it("shows fan-out rows as base character -> result with the key that types it", () => {
    panel();
    const rows = screen.getAllByTestId("deadkey-table-fanout-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("a (key A, Default) becomes");
    expect((within(rows[0]!).getByTestId("deadkey-table-fanout-result") as HTMLInputElement).value).toBe("á");
    expect(rows[1]!.textContent).toContain("e (key E, Default) becomes");
  });

  it("shows keystroke-keyed rows as key + layer -> result", () => {
    panel();
    const rows = screen.getAllByTestId("deadkey-table-keystroke-row");
    const o = rows.find((r) => r.textContent?.includes("Key O"));
    expect(o?.textContent).toContain("Key O (Default) becomes");
    expect((within(o!).getByTestId("deadkey-table-keystroke-result") as HTMLInputElement).value).toBe("ó");
  });

  it("adds a fan-out row: one confirm is one ld undo step, and undo restores the text", () => {
    panel();
    const before = text();
    fireEvent.change(screen.getByTestId("deadkey-table-add-base"), { target: { value: "i" } });
    fireEvent.change(screen.getByTestId("deadkey-table-add-result"), { target: { value: "í" } });
    fireEvent.click(screen.getByTestId("deadkey-table-add"));
    expect(text()).toContain("í");
    expect(top()?.k).toBe("ld");
    expect(useWorkingCopyStore.getState().deadkeyOverlay.ops).toHaveLength(1);
    useWorkingCopyStore.getState().undoKmnEdit();
    expect(text()).toBe(before);
  });

  it("changes a fan-out row in one undo step", () => {
    panel();
    const before = text();
    const depth = useWorkingCopyStore.getState().undoStack.length;
    const row = screen.getAllByTestId("deadkey-table-fanout-row")[0]!;
    fireEvent.change(within(row).getByTestId("deadkey-table-fanout-result"), { target: { value: "à" } });
    fireEvent.click(within(row).getByTestId("deadkey-table-fanout-change"));
    expect(text()).toContain("à");
    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(depth + 1);
    useWorkingCopyStore.getState().undoKmnEdit();
    expect(text()).toBe(before);
  });

  it("removes a fan-out row", () => {
    panel();
    const row = screen.getAllByTestId("deadkey-table-fanout-row")[1]!;
    fireEvent.click(within(row).getByTestId("deadkey-table-fanout-remove"));
    expect(screen.getAllByTestId("deadkey-table-fanout-row")).toHaveLength(1);
    expect(top()?.k).toBe("ld");
  });

  it("changes and removes a keystroke-keyed row through kmn-edits, pushing l", () => {
    panel();
    const row = () => screen.getAllByTestId("deadkey-table-keystroke-row").find((r) => r.textContent?.includes("Key O"))!;
    fireEvent.change(within(row()).getByTestId("deadkey-table-keystroke-result"), { target: { value: "ò" } });
    fireEvent.click(within(row()).getByTestId("deadkey-table-keystroke-change"));
    expect(logged()?.entries[0]).toMatchObject({
      op: "set-row",
      vkey: "K_O",
      context: [{ kind: "deadkey", deadkeyId: "3000" }],
    });
    expect(text()).toContain("U+00F2");
    expect(top()?.k).toBe("l");

    fireEvent.click(within(row()).getByTestId("deadkey-table-keystroke-remove"));
    expect(logged()?.entries.at(-1)).toMatchObject({ op: "remove-row", vkey: "K_O" });
  });

  it("adds a keystroke-keyed row on a deadkey with no fan-out stores", () => {
    cleanup();
    panel({ deadkeyId: "3001" });
    fireEvent.change(screen.getByTestId("deadkey-table-add-key"), { target: { value: "e" } });
    fireEvent.change(screen.getByTestId("deadkey-table-add-layer"), { target: { value: "SHIFT" } });
    fireEvent.change(screen.getByTestId("deadkey-table-add-key-result"), { target: { value: "Ê" } });
    fireEvent.click(screen.getByTestId("deadkey-table-add-key-row"));
    expect(logged()?.entries[0]).toMatchObject({
      op: "set-row",
      vkey: "K_E",
      layer: ["SHIFT"],
      context: [{ kind: "deadkey", deadkeyId: "3001" }],
    });
    expect(text()).toContain("U+00CA");
  });

  it("a store-using row outside the fan-out shape is read-only with view in code; the others stay editable", () => {
    const { onViewInCode } = panel();
    const rows = screen.getAllByTestId("deadkey-table-keystroke-row");
    const readOnly = rows.filter((r) => within(r).queryByTestId("deadkey-table-view-in-code") !== null);
    expect(readOnly.length).toBeGreaterThan(0);
    for (const r of readOnly) expect(within(r).queryByTestId("deadkey-table-keystroke-result")).toBeNull();
    fireEvent.click(within(readOnly[0]!).getByTestId("deadkey-table-view-in-code"));
    expect(onViewInCode).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId("deadkey-table-fanout-result").length).toBe(2);
    expect(rows.some((r) => within(r).queryByTestId("deadkey-table-keystroke-result") !== null)).toBe(true);
  });

  it("a row whose result is a deadkey links to after that deadkey", () => {
    const { onShowAfter } = panel();
    fireEvent.click(screen.getByTestId("deadkey-table-follow"));
    expect(onShowAfter).toHaveBeenCalledWith("3001");
    fireEvent.click(screen.getByTestId("deadkey-table-show-after"));
    expect(onShowAfter).toHaveBeenLastCalledWith("3000");
  });

  it("flags a deadkey with no combinations", () => {
    cleanup();
    seed(KMN.replace("dk(3001) + [K_Q] > U+02C6\n", "").replace("dk(3000) + [K_Y] > dk(3001)\n", ""));
    panel({ deadkeyId: "3001" });
    expect(screen.getByTestId("deadkey-table-empty")).toBeTruthy();
  });

  it("proposes the space row for a new deadkey and writes it only on confirm", () => {
    panel({ proposeSpaceRow: true });
    expect(screen.getByTestId("deadkey-table-space-proposal")).toBeTruthy();
    expect(useWorkingCopyStore.getState().deadkeyOverlay.ops).toHaveLength(0);
    fireEvent.click(screen.getByTestId("deadkey-table-space-confirm"));
    expect(useWorkingCopyStore.getState().deadkeyOverlay.ops).toEqual([
      { kind: "add-pair", id: 0x3000, base: " ", accented: "´" },
    ]);
    expect(screen.queryByTestId("deadkey-table-space-proposal")).toBeNull();
  });

  it("the author can remove the proposed space row without anything being written", () => {
    panel({ proposeSpaceRow: true });
    const before = text();
    fireEvent.click(screen.getByTestId("deadkey-table-space-remove"));
    expect(screen.queryByTestId("deadkey-table-space-proposal")).toBeNull();
    expect(text()).toBe(before);
    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(0);
  });

  it("shows why a change was refused and writes nothing", () => {
    panel();
    useWorkingCopyStore.setState({ desktopLocked: true });
    fireEvent.change(screen.getByTestId("deadkey-table-add-base"), { target: { value: "i" } });
    fireEvent.change(screen.getByTestId("deadkey-table-add-result"), { target: { value: "í" } });
    const before = text();
    fireEvent.click(screen.getByTestId("deadkey-table-add"));
    expect(screen.getByTestId("deadkey-table-problem").textContent).toContain("complete");
    expect(text()).toBe(before);
  });
});
