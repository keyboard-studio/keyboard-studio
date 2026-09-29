// DeadkeyInventory tests — spec 083 US2: inventory origins, import
// limitations, and the duplicate-id repair notice.

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(cleanup);
import { screen, fireEvent } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { listDeadkeys } from "@keyboard-studio/contracts";
import { parseKmn, defineDeadkey } from "@keyboard-studio/engine";
import { DeadkeyInventory } from "./DeadkeyInventory.tsx";

const BASE_KMN = `store(&VERSION) '10.0'
store(&NAME) 'deadkey-inventory-test'
store(&TARGETS) 'any'
begin Unicode > use(main)

group(main) using keys
`;

function parseIr(extra: string): KeyboardIR {
  return parseKmn(BASE_KMN + extra, "deadkey-inventory-test").ir;
}

function renderInventory(ir: KeyboardIR, onCommitRepair = vi.fn()) {
  const onDefine = vi.fn();
  const onEdit = vi.fn();
  render(
    <DeadkeyInventory
      ir={ir}
      onDefine={onDefine}
      onEdit={onEdit}
      onCommitRepair={onCommitRepair}
    />,
  );
  return { onDefine, onEdit, onCommitRepair };
}

describe("DeadkeyInventory", () => {
  it("lists a studio-defined deadkey with the studio origin label", () => {
    const base = parseIr("");
    const result = defineDeadkey(base, { triggerKey: "K_COLON", id: 0x3001, accentChar: ";" });
    if (!result.ok) throw new Error("defineDeadkey failed in fixture");
    const ir = result.ir;
    expect(listDeadkeys(ir).some((d) => d.origin === "studio")).toBe(true);

    renderInventory(ir);
    expect(screen.getByText(/defined in studio/i)).toBeTruthy();
    expect(screen.getByText(/dk\(3001\)/i)).toBeTruthy();
  });

  it("labels a codepoint-derived legacy deadkey and an imported one distinctly", () => {
    // dk(003b) on K_COLON (;) — legacy codepoint convention.
    // dk(3000) on K_A — no studio marker, not codepoint-derived → imported.
    const ir = parseIr(`+ [K_COLON] > dk(003b)\n+ [K_A] > dk(3000)\n`);
    renderInventory(ir);
    expect(screen.getByText(/legacy codepoint id/i)).toBeTruthy();
    expect(screen.getByText(/imported/i)).toBeTruthy();
  });

  it("disables Pairs with the exact note when the rule shape is not recognized", () => {
    // Trigger-only: no fan-out stores → pair editing unavailable.
    const ir = parseIr(`+ [K_A] > dk(3000)\n`);
    const { onEdit } = renderInventory(ir);
    expect(
      screen.getAllByText("rule shape not recognized — pair editing unavailable").length,
    ).toBeGreaterThan(0);
    const pairsButtons = screen.queryAllByRole("button", { name: /pairs/i });
    // The row's Pairs button exists but is disabled.
    expect(pairsButtons.length).toBeGreaterThan(0);
    for (const b of pairsButtons) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
    }
    // Rename/retarget/delete stay available for imported numeric deadkeys.
    for (const name of ["Rename", "Retarget", "Delete"]) {
      const btn = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    }
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("a named deadkey (id null) offers rename/retarget/delete but no pairs", () => {
    const ir = parseIr(`+ [K_BKQUOTE] > dk(acute)\n`);
    const infos = listDeadkeys(ir);
    expect(infos.some((d) => d.id === null)).toBe(true);

    renderInventory(ir);
    expect(screen.getByText(/dk\(acute\)/i)).toBeTruthy();
    // Pairs disabled for the null-id row too.
    expect(
      screen.getAllByText("rule shape not recognized — pair editing unavailable").length,
    ).toBeGreaterThan(0);
  });

  it("shows the duplicate-id repair notice and repairs on click", () => {
    const ir = parseIr(`+ [K_COLON] > dk(dead0)\n+ [K_LBRKT] > dk(dead0)\n`);
    const { onCommitRepair } = renderInventory(ir);

    expect(screen.getByText(/duplicate deadkey id/i)).toBeTruthy();
    const repairBtn = screen.getByRole("button", { name: /repair: re-assign fresh ids/i });
    fireEvent.click(repairBtn);

    expect(onCommitRepair).toHaveBeenCalledTimes(1);
    const repaired = onCommitRepair.mock.calls[0]![0] as KeyboardIR;
    const ids = listDeadkeys(repaired).map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("an empty inventory invites defining the first deadkey", () => {
    const { onDefine } = renderInventory(parseIr(""));
    const defineBtn = screen.getByRole("button", { name: /define.*deadkey/i });
    expect(defineBtn).toBeTruthy();
    fireEvent.click(defineBtn);
    expect(onDefine).toHaveBeenCalledTimes(1);
  });
});
